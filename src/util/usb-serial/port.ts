import type {
  LineConfig,
  UsbSerialDriver,
  UsbSerialDriverDefinition,
  UsbSerialEndpoints,
} from "./driver";

const DEFAULT_BUFFER_SIZE = 255;

/** Fill defaults and validate Web Serial options, like native Web Serial. */
export const toLineConfig = (options: SerialOptions): LineConfig => {
  const { baudRate, dataBits = 8, stopBits = 1, parity = "none" } = options;
  if (!Number.isInteger(baudRate) || baudRate <= 0) {
    throw new RangeError(`invalid Baud Rate ${baudRate}`);
  }
  if (![5, 6, 7, 8].includes(dataBits)) {
    throw new RangeError(`invalid dataBits ${dataBits}`);
  }
  if (stopBits !== 1 && stopBits !== 2) {
    throw new RangeError(`invalid stopBits ${stopBits}`);
  }
  if (!["none", "even", "odd"].includes(parity)) {
    throw new RangeError(`invalid parity ${parity}`);
  }
  return { baudRate, dataBits, stopBits, parity } as LineConfig;
};

/**
 * Web Serial `SerialPort` on top of a WebUSB device, for any registered
 * driver. Implements the surface esptool-js, the Improv SDK and the console
 * use. It is not structurally identical to the DOM `SerialPort` type.
 *
 * Behaviours that mirror native Web Serial (and that those consumers rely on):
 * - `readable` hands out a fresh stream after the previous one was cancelled,
 *   and a read that was in flight at cancel time is delivered to the next
 *   stream so no bytes get lost.
 * - Zero-length USB packets are skipped, never enqueued.
 * - DTR and RTS are deasserted after `open()`.
 */
export class UsbSerialPort {
  private _driver?: UsbSerialDriver;
  private _endpoints?: UsbSerialEndpoints;
  private _options?: SerialOptions;
  private _readable: ReadableStream<Uint8Array> | null = null;
  private _writable: WritableStream<Uint8Array> | null = null;
  private _pendingRead?: Promise<Uint8Array>;
  private _signals = { dataTerminalReady: false, requestToSend: false };
  private _break = false;

  constructor(
    private readonly _device: USBDevice,
    private readonly _definition: UsbSerialDriverDefinition,
  ) {}

  private get _bufferSize(): number {
    return this._options?.bufferSize ?? DEFAULT_BUFFER_SIZE;
  }

  public get readable(): ReadableStream<Uint8Array> | null {
    if (this._readable || !this._device.opened || !this._endpoints) {
      return this._readable;
    }
    const stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>(
      {
        pull: async (controller) => {
          this._pendingRead ??= this._read(controller.desiredSize);
          this._pendingRead.catch(() => undefined);
          let chunk: Uint8Array;
          try {
            chunk = await this._pendingRead;
          } catch (err) {
            this._pendingRead = undefined;
            if (this._readable === stream) {
              this._readable = null;
            }
            controller.error(err);
            return;
          }
          if (this._readable !== stream) {
            // Cancelled while reading, keep the chunk for the next stream.
            return;
          }
          this._pendingRead = undefined;
          controller.enqueue(chunk);
        },
        cancel: () => {
          if (this._readable === stream) {
            this._readable = null;
          }
        },
      },
      new ByteLengthQueuingStrategy({ highWaterMark: this._bufferSize }),
    );
    this._readable = stream;
    return stream;
  }

  public get writable(): WritableStream<Uint8Array> | null {
    if (this._writable || !this._device.opened || !this._endpoints) {
      return this._writable;
    }
    const stream: WritableStream<Uint8Array> = new WritableStream<Uint8Array>(
      {
        write: async (chunk) => {
          if (!chunk.byteLength) {
            return;
          }
          try {
            const result = await this._device.transferOut(
              this._endpoints!.out.endpointNumber,
              chunk as Uint8Array<ArrayBuffer>,
            );
            if (result.status !== "ok") {
              throw new Error(`USB error: ${result.status}`);
            }
          } catch (err) {
            if (this._writable === stream) {
              this._writable = null;
            }
            throw err;
          }
        },
      },
      new ByteLengthQueuingStrategy({ highWaterMark: this._bufferSize }),
    );
    this._writable = stream;
    return stream;
  }

  /** Read one non-empty, driver-processed chunk from the IN endpoint. */
  private async _read(desiredSize: number | null): Promise<Uint8Array> {
    const endpoint = this._endpoints!.in;
    const driver = this._driver!;
    const packetSize = endpoint.packetSize;
    const length =
      Math.max(1, Math.ceil((desiredSize ?? packetSize) / packetSize)) *
      packetSize;
    for (;;) {
      const result = await this._device.transferIn(
        endpoint.endpointNumber,
        length,
      );
      if (result.status !== "ok") {
        throw new Error(`USB error: ${result.status}`);
      }
      if (!result.data?.byteLength) {
        continue;
      }
      let chunk = new Uint8Array(
        result.data.buffer,
        result.data.byteOffset,
        result.data.byteLength,
      );
      if (driver.processRead) {
        chunk = driver.processRead(chunk);
      }
      // Skip empty packets (nothing to deliver).
      if (chunk.byteLength) {
        return chunk;
      }
    }
  }

  public async open(options: SerialOptions): Promise<void> {
    const config = toLineConfig(options);
    this._options = options;
    try {
      await this._device.open();
      if (this._device.configuration === null) {
        await this._device.selectConfiguration(1);
      }
      const driver = this._definition.create(this._device);
      this._driver = driver;
      this._endpoints = await driver.open();
      await driver.setLineConfig(config);
      // Start with DTR and RTS low like native Web Serial. On ESP boards they
      // drive IO0 and EN, so a stray DTR boots the ROM bootloader instead of
      // the firmware.
      this._signals = { dataTerminalReady: false, requestToSend: false };
      this._break = false;
      await driver.setSignals(false, false);
    } catch (err) {
      this._driver = undefined;
      this._endpoints = undefined;
      if (this._device.opened) {
        await this._device.close().catch(() => undefined);
      }
      throw new Error(`Error setting up device: ${err}`);
    }
  }

  public async close(): Promise<void> {
    // Streams may be locked by a consumer, which makes cancel/abort reject.
    await Promise.all([
      this._readable?.cancel().catch(() => undefined),
      this._writable?.abort().catch(() => undefined),
    ]);
    this._readable = null;
    this._writable = null;
    this._pendingRead = undefined;
    if (!this._device.opened) {
      return;
    }
    // The device may already be gone, closing must still succeed.
    try {
      await this._driver?.setSignals(false, false);
      await this._driver?.close?.();
    } catch {
      // ignore
    }
    this._driver = undefined;
    this._endpoints = undefined;
    await this._device.close();
  }

  public forget(): Promise<void> {
    return this._device.forget();
  }

  public getInfo(): SerialPortInfo {
    return {
      usbVendorId: this._device.vendorId,
      usbProductId: this._device.productId,
    };
  }

  /** Change line settings (baud rate, ...) of an open port. */
  public async reconfigure(options: SerialOptions): Promise<void> {
    const merged = { ...this._options, ...options };
    const config = toLineConfig(merged);
    this._options = merged;
    await this._requireDriver().setLineConfig(config);
  }

  public async setSignals(signals: SerialOutputSignals): Promise<void> {
    const driver = this._requireDriver();
    if (
      signals.dataTerminalReady !== undefined ||
      signals.requestToSend !== undefined
    ) {
      this._signals = {
        dataTerminalReady:
          signals.dataTerminalReady ?? this._signals.dataTerminalReady,
        requestToSend: signals.requestToSend ?? this._signals.requestToSend,
      };
      await driver.setSignals(
        this._signals.dataTerminalReady,
        this._signals.requestToSend,
      );
    }
    if (signals.break !== undefined && driver.setBreak) {
      this._break = signals.break;
      await driver.setBreak(this._break);
    }
  }

  private _requireDriver(): UsbSerialDriver {
    if (!this._driver) {
      throw new DOMException("The port is not open.", "InvalidStateError");
    }
    return this._driver;
  }
}
