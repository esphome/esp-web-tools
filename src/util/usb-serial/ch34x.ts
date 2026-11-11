import {
  controlIn,
  controlOut,
  findBulkEndpoints,
  findInterface,
  type LineConfig,
  type UsbSerialDriver,
  type UsbSerialEndpoints,
} from "./driver";

/**
 * WCH CH340 / CH341 in serial mode. Vendor control requests are addressed to
 * the device. CH343 / CH9102 are not covered here: they mostly enumerate as
 * CDC-ACM and use that driver.
 */

const VENDOR_CLASS = 0xff;

const REQ_READ_VERSION = 0x5f;
const REQ_WRITE_REG = 0x9a;
const REQ_SERIAL_INIT = 0xa1;
const REQ_MODEM_CTRL = 0xa4;

// Modem control bits, written inverted (0 = asserted).
const BIT_DTR = 1 << 5;
const BIT_RTS = 1 << 6;

// Line control register bits.
const LCR_ENABLE_RX = 0x80;
const LCR_ENABLE_TX = 0x40;
const LCR_PAR_EVEN = 0x10;
const LCR_ENABLE_PAR = 0x08;
const LCR_STOP_BITS_2 = 0x04;

const CLOCK_RATE = 48_000_000;
const MIN_BPS = 46;
const MAX_BPS = 3_000_000;

// Base clock divisor for prescaler `ps` and factor `fact`.
const clockDivisor = (ps: number, fact: number): number =>
  1 << (12 - 3 * ps - fact);

// Lowest rate each prescaler can produce with fact = 1.
const MIN_RATES = [0, 1, 2, 3].map((ps) =>
  Math.floor(CLOCK_RATE / (clockDivisor(ps, 1) * 512)),
);

/**
 * Compute the 16 bit value for registers 0x12 (prescaler) and 0x13 (divisor)
 * for a baud rate. Mirrors the algorithm of the Linux ch341 driver: pick the
 * largest base clock that keeps the divisor below 512, round to the nearest
 * divisor, then prefer the lower base clock when the divisor is even.
 */
export const ch34xBaudDivisor = (baudRate: number): number => {
  const speed = Math.min(Math.max(baudRate, MIN_BPS), MAX_BPS);

  let fact = 1;
  let ps = 3;
  while (ps > 0 && speed <= MIN_RATES[ps]) {
    ps--;
  }

  let clkDiv = clockDivisor(ps, fact);
  let div = Math.floor(CLOCK_RATE / (clkDiv * speed));
  if (div < 9 || div > 255) {
    div = Math.floor(div / 2);
    clkDiv *= 2;
    fact = 0;
  }

  // Use the next divisor when it gives a closer rate.
  if (
    (16 * CLOCK_RATE) / (clkDiv * div) - 16 * speed >=
    16 * speed - (16 * CLOCK_RATE) / (clkDiv * (div + 1))
  ) {
    div++;
  }

  if (fact === 1 && div % 2 === 0) {
    div /= 2;
    fact = 0;
  }

  return ((0x100 - div) << 8) | (fact << 2) | ps;
};

/** Line control register value (the chip always keeps RX and TX enabled). */
export const ch34xLineControl = (config: LineConfig): number => {
  let lcr = LCR_ENABLE_RX | LCR_ENABLE_TX | (config.dataBits - 5);
  if (config.parity !== "none") {
    lcr |= LCR_ENABLE_PAR;
    if (config.parity === "even") {
      lcr |= LCR_PAR_EVEN;
    }
  }
  if (config.stopBits === 2) {
    lcr |= LCR_STOP_BITS_2;
  }
  return lcr;
};

/** Value for the modem control request: DTR/RTS bits, inverted. */
export const ch34xModemControl = (dtr: boolean, rts: boolean): number =>
  ~((dtr ? BIT_DTR : 0) | (rts ? BIT_RTS : 0)) & 0xffff;

class Ch34xDriver implements UsbSerialDriver {
  constructor(private readonly _device: USBDevice) {}

  private _out(request: number, value: number, index: number): Promise<void> {
    return controlOut(this._device, {
      requestType: "vendor",
      recipient: "device",
      request,
      value,
      index,
    });
  }

  public async open(): Promise<UsbSerialEndpoints> {
    const iface = findInterface(this._device, VENDOR_CLASS);
    if (!iface) {
      throw new Error("No vendor specific interface found");
    }
    await this._device.claimInterface(iface.interfaceNumber);
    // The vendor init sequence; the version read doubles as a liveness check.
    await controlIn(
      this._device,
      {
        requestType: "vendor",
        recipient: "device",
        request: REQ_READ_VERSION,
        value: 0,
        index: 0,
      },
      2,
    );
    await this._out(REQ_SERIAL_INIT, 0, 0);
    return findBulkEndpoints(iface);
  }

  public async setLineConfig(config: LineConfig): Promise<void> {
    // Bit 7 makes the chip forward data right away instead of buffering
    // until a full packet has arrived.
    await this._out(
      REQ_WRITE_REG,
      0x1312,
      ch34xBaudDivisor(config.baudRate) | 0x80,
    );
    await this._out(REQ_WRITE_REG, 0x2518, ch34xLineControl(config));
  }

  public setSignals(
    dataTerminalReady: boolean,
    requestToSend: boolean,
  ): Promise<void> {
    return this._out(
      REQ_MODEM_CTRL,
      ch34xModemControl(dataTerminalReady, requestToSend),
      0,
    );
  }
}

export const createCh34xDriver = (device: USBDevice): UsbSerialDriver =>
  new Ch34xDriver(device);
