import {
  controlOut,
  findBulkEndpoints,
  findInterface,
  type LineConfig,
  type UsbSerialDriver,
  type UsbSerialEndpoints,
} from "./driver";

/**
 * USB CDC-ACM (class 0x02 control + class 0x0A data interface). This is what
 * ESP chips with native USB (S2, S3, C3, C6, ...) present, and also what
 * CH343/CH9102 and some other bridges use in CDC mode.
 */

const CDC_CLASS = 0x02;
const CDC_DATA_CLASS = 0x0a;

const SET_LINE_CODING = 0x20;
const SET_CONTROL_LINE_STATE = 0x22;
const SEND_BREAK = 0x23;

const PARITY_INDEX: Record<ParityType, number> = {
  none: 0,
  odd: 1,
  even: 2,
};

/** The 7 byte payload of SET_LINE_CODING (CDC 1.1, 6.2.12). */
export const cdcLineCoding = (config: LineConfig): Uint8Array<ArrayBuffer> => {
  const buffer = new Uint8Array(7);
  new DataView(buffer.buffer).setUint32(0, config.baudRate, true);
  buffer[4] = config.stopBits === 2 ? 2 : 0;
  buffer[5] = PARITY_INDEX[config.parity];
  buffer[6] = config.dataBits;
  return buffer;
};

class CdcAcmDriver implements UsbSerialDriver {
  private _controlNumber = 0;

  constructor(private readonly _device: USBDevice) {}

  public async open(): Promise<UsbSerialEndpoints> {
    const control = findInterface(this._device, CDC_CLASS);
    if (!control) {
      throw new Error("No CDC control interface found");
    }
    const data = findInterface(this._device, CDC_DATA_CLASS) ?? control;
    this._controlNumber = control.interfaceNumber;
    await this._device.claimInterface(control.interfaceNumber);
    if (data !== control) {
      await this._device.claimInterface(data.interfaceNumber);
    }
    return findBulkEndpoints(data);
  }

  public setLineConfig(config: LineConfig): Promise<void> {
    return controlOut(
      this._device,
      {
        requestType: "class",
        recipient: "interface",
        request: SET_LINE_CODING,
        value: 0,
        index: this._controlNumber,
      },
      cdcLineCoding(config),
    );
  }

  public setSignals(
    dataTerminalReady: boolean,
    requestToSend: boolean,
  ): Promise<void> {
    return controlOut(this._device, {
      requestType: "class",
      recipient: "interface",
      request: SET_CONTROL_LINE_STATE,
      value: (dataTerminalReady ? 1 : 0) | (requestToSend ? 2 : 0),
      index: this._controlNumber,
    });
  }

  public setBreak(enabled: boolean): Promise<void> {
    // 0xFFFF holds the break until a later request with 0 releases it.
    return controlOut(this._device, {
      requestType: "class",
      recipient: "interface",
      request: SEND_BREAK,
      value: enabled ? 0xffff : 0,
      index: this._controlNumber,
    });
  }
}

export const createCdcAcmDriver = (device: USBDevice): UsbSerialDriver =>
  new CdcAcmDriver(device);
