import {
  controlOut,
  findBulkEndpoints,
  findInterface,
  type LineConfig,
  type UsbSerialDriver,
  type UsbSerialEndpoints,
} from "./driver";

/**
 * Silicon Labs CP210x (CP2101/2/3/4/5/8 and CP2102N). The chip exposes a
 * vendor specific interface and is configured with vendor control requests
 * addressed to that interface.
 */

const VENDOR_CLASS = 0xff;

const IFC_ENABLE = 0x00;
const SET_LINE_CTL = 0x03;
const SET_BREAK = 0x05;
const SET_MHS = 0x07;
const SET_BAUDRATE = 0x1e;

const UART_ENABLE = 0x0001;
const UART_DISABLE = 0x0000;

// SET_MHS value: bits 0/1 carry the DTR/RTS levels, bits 8/9 say which of
// them the request is allowed to change.
const MHS_DTR = 0x0001;
const MHS_RTS = 0x0002;
const MHS_WRITE_DTR = 0x0100;
const MHS_WRITE_RTS = 0x0200;

/** SET_LINE_CTL value: data bits in 11:8, parity in 7:4, stop bits in 3:0. */
export const cp210xLineControl = (config: LineConfig): number => {
  const parity = { none: 0x00, odd: 0x10, even: 0x20 }[config.parity];
  const stop = config.stopBits === 2 ? 0x02 : 0x00;
  return (config.dataBits << 8) | parity | stop;
};

/** SET_MHS value that sets both DTR and RTS to the given levels. */
export const cp210xModemControl = (dtr: boolean, rts: boolean): number =>
  MHS_WRITE_DTR | MHS_WRITE_RTS | (dtr ? MHS_DTR : 0) | (rts ? MHS_RTS : 0);

class Cp210xDriver implements UsbSerialDriver {
  private _interfaceNumber = 0;

  constructor(private readonly _device: USBDevice) {}

  private _out(
    request: number,
    value: number,
    data?: BufferSource,
  ): Promise<void> {
    return controlOut(
      this._device,
      {
        requestType: "vendor",
        recipient: "interface",
        request,
        value,
        index: this._interfaceNumber,
      },
      data,
    );
  }

  public async open(): Promise<UsbSerialEndpoints> {
    const iface = findInterface(this._device, VENDOR_CLASS);
    if (!iface) {
      throw new Error("No vendor specific interface found");
    }
    this._interfaceNumber = iface.interfaceNumber;
    await this._device.claimInterface(iface.interfaceNumber);
    await this._out(IFC_ENABLE, UART_ENABLE);
    return findBulkEndpoints(iface);
  }

  public async setLineConfig(config: LineConfig): Promise<void> {
    const baud = new Uint8Array(4);
    new DataView(baud.buffer).setUint32(0, config.baudRate, true);
    await this._out(SET_BAUDRATE, 0, baud);
    await this._out(SET_LINE_CTL, cp210xLineControl(config));
  }

  public setSignals(
    dataTerminalReady: boolean,
    requestToSend: boolean,
  ): Promise<void> {
    return this._out(
      SET_MHS,
      cp210xModemControl(dataTerminalReady, requestToSend),
    );
  }

  public setBreak(enabled: boolean): Promise<void> {
    return this._out(SET_BREAK, enabled ? 1 : 0);
  }

  public async close(): Promise<void> {
    await this._out(IFC_ENABLE, UART_DISABLE);
  }
}

export const createCp210xDriver = (device: USBDevice): UsbSerialDriver =>
  new Cp210xDriver(device);
