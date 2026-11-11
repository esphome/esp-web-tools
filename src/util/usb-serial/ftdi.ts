import {
  controlOut,
  findBulkEndpoints,
  findInterface,
  type LineConfig,
  type UsbSerialDriver,
  type UsbSerialDriverDefinition,
  type UsbSerialEndpoints,
} from "./driver";

/**
 * FTDI FT232R/FT232H/FT2232/FT4232/FT-X (and clones). Vendor control requests
 * addressed to the device, with the port selected in the low byte of wIndex.
 * Every bulk IN packet starts with 2 modem status bytes that must be removed.
 */

const VENDOR_CLASS = 0xff;

const REQ_SET_MODEM_CTRL = 0x01;
const REQ_SET_FLOW_CTRL = 0x02;
const REQ_SET_BAUDRATE = 0x03;
const REQ_SET_DATA = 0x04;

const MODEM_DTR_HIGH = 0x0001;
const MODEM_RTS_HIGH = 0x0002;
const MODEM_DTR_MASK = 0x0100;
const MODEM_RTS_MASK = 0x0200;

const DATA_BREAK = 1 << 14;

/** Modem status bytes the chip prepends to every bulk IN packet. */
const STATUS_BYTES = 2;

export interface FtdiChip {
  /** Hi-speed chips (FT2232H/4232H/232H) use a 120 MHz base clock. */
  highSpeed: boolean;
  /** Baud rate index is shifted into the high byte of wIndex. */
  shiftBaudIndex: boolean;
  maxBaud: number;
}

/**
 * Classify a chip from its bcdDevice (and whether it has several interfaces).
 * Returns undefined for the ancient SIO/FT8U232AM parts.
 */
export const ftdiChipFromVersion = (
  bcdDevice: number,
  multiInterface: boolean,
): FtdiChip | undefined => {
  if (bcdDevice < 0x400) {
    return undefined;
  }
  if (multiInterface) {
    // FT2232C (full speed), FT2232H and FT4232H.
    const highSpeed = bcdDevice === 0x700 || bcdDevice === 0x800;
    return { highSpeed, shiftBaudIndex: true, maxBaud: highSpeed ? 12e6 : 3e6 };
  }
  switch (bcdDevice) {
    case 0x400: // FT232BM
    case 0x600: // FT232R
      return { highSpeed: false, shiftBaudIndex: false, maxBaud: 3e6 };
    case 0x500: // FT2232C/D
    case 0x1000: // FT-X
      return { highSpeed: false, shiftBaudIndex: true, maxBaud: 3e6 };
    default: // 0x700 FT2232H, 0x800 FT4232H, 0x900 FT232H, newer
      return { highSpeed: true, shiftBaudIndex: true, maxBaud: 12e6 };
  }
};

// Fractional divisor bits (1/8 steps) as the chip encodes them.
const DIV_FRAC = [0, 3, 2, 4, 1, 5, 6, 7];

const divRoundClosest = (n: number, d: number): number =>
  Math.floor((n + Math.floor(d / 2)) / d);

/**
 * 32 bit baud rate divisor: low 16 bits go in wValue, high 16 bits in wIndex.
 * Mirrors the Linux ftdi_sio algorithm.
 */
export const ftdiBaudDivisor = (baudRate: number, chip: FtdiChip): number => {
  const baud = Math.min(Math.max(baudRate, 1), chip.maxBaud);
  const divisor3 = chip.highSpeed
    ? divRoundClosest(8 * 120_000_000, 10 * baud)
    : divRoundClosest(48_000_000, 2 * baud);
  let divisor = (divisor3 >> 3) | (DIV_FRAC[divisor3 & 7] << 14);
  // Special cases for the highest rates.
  if (divisor === 1) {
    divisor = 0;
  } else if (divisor === 0x4001) {
    divisor = 1;
  }
  if (chip.highSpeed) {
    // Turn off the divide by 2.5 stage, needed above 1.2 Mbaud.
    divisor |= 0x20000;
  }
  return divisor;
};

/** SET_DATA value: data bits, parity (bits 8-10), stop bits (bits 11-13). */
export const ftdiDataBits = (config: LineConfig, brk = false): number => {
  const parity = { none: 0, odd: 1, even: 2 }[config.parity];
  const stop = config.stopBits === 2 ? 2 : 0;
  return (
    config.dataBits | (parity << 8) | (stop << 11) | (brk ? DATA_BREAK : 0)
  );
};

/** SET_MODEM_CTRL value that sets both DTR and RTS to the given levels. */
export const ftdiModemControl = (dtr: boolean, rts: boolean): number =>
  MODEM_DTR_MASK |
  MODEM_RTS_MASK |
  (dtr ? MODEM_DTR_HIGH : 0) |
  (rts ? MODEM_RTS_HIGH : 0);

class FtdiDriver implements UsbSerialDriver {
  private _chip!: FtdiChip;
  private _index = 0;
  private _packetSize = 64;
  private _config?: LineConfig;

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
    const multiInterface = this._device.configuration!.interfaces.length > 1;
    const bcdDevice =
      (this._device.deviceVersionMajor << 8) |
      (this._device.deviceVersionMinor << 4) |
      this._device.deviceVersionSubminor;
    const chip = ftdiChipFromVersion(bcdDevice, multiInterface);
    if (!chip) {
      throw new Error("Unsupported FTDI chip");
    }
    this._chip = chip;
    // Multi-port chips address ports A, B, ... as 1, 2, ...
    this._index = multiInterface ? iface.interfaceNumber + 1 : 0;
    await this._device.claimInterface(iface.interfaceNumber);
    const endpoints = findBulkEndpoints(iface);
    this._packetSize = endpoints.in.packetSize;
    // No hardware flow control.
    await this._out(REQ_SET_FLOW_CTRL, 0, this._index);
    return endpoints;
  }

  public async setLineConfig(config: LineConfig): Promise<void> {
    this._config = config;
    const divisor = ftdiBaudDivisor(config.baudRate, this._chip);
    const value = divisor & 0xffff;
    let index = (divisor >>> 16) & 0xffff;
    if (this._chip.shiftBaudIndex) {
      index = (index << 8) | this._index;
    }
    await this._out(REQ_SET_BAUDRATE, value, index);
    await this._out(REQ_SET_DATA, ftdiDataBits(config), this._index);
  }

  public setSignals(
    dataTerminalReady: boolean,
    requestToSend: boolean,
  ): Promise<void> {
    return this._out(
      REQ_SET_MODEM_CTRL,
      ftdiModemControl(dataTerminalReady, requestToSend),
      this._index,
    );
  }

  public setBreak(enabled: boolean): Promise<void> {
    return this._out(
      REQ_SET_DATA,
      ftdiDataBits(this._config!, enabled),
      this._index,
    );
  }

  public processRead(data: Uint8Array): Uint8Array {
    return ftdiStripStatus(data, this._packetSize);
  }
}

/** Drop the 2 status bytes at the start of every packet in `data`. */
export const ftdiStripStatus = (
  data: Uint8Array,
  packetSize: number,
): Uint8Array => {
  const out = new Uint8Array(data.byteLength);
  let length = 0;
  for (let start = 0; start < data.byteLength; start += packetSize) {
    const payload = data.subarray(
      start + STATUS_BYTES,
      Math.min(start + packetSize, data.byteLength),
    );
    out.set(payload, length);
    length += payload.byteLength;
  }
  return out.subarray(0, length);
};

export const ftdiDriver: UsbSerialDriverDefinition = {
  name: "FTDI",
  // FT232R/BM/AM, FT2232, FT4232, FT232H, FT-X.
  filters: [0x6001, 0x6010, 0x6011, 0x6014, 0x6015].map((productId) => ({
    vendorId: 0x0403,
    productId,
  })),
  create: (device) => new FtdiDriver(device),
};
