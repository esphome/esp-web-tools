import { getOperatingSystem } from "./get-operating-system";

/**
 * Chrome on Android ships a native Web Serial that only lists Bluetooth serial
 * devices, never USB ones. There we use web-serial-polyfill (Web Serial over
 * WebUSB) instead. It speaks USB CDC-ACM, so it only works with ESP chips
 * using native USB.
 */
const usePolyfill = (): boolean =>
  "usb" in navigator &&
  (!("serial" in navigator) || getOperatingSystem() === "Android");

export const isSerialSupported = (): boolean =>
  "serial" in navigator || "usb" in navigator;

// Fields of the polyfill's SerialPort that are private in its typings.
interface PolyfillInternals {
  device_: USBDevice;
  inEndpoint_: USBEndpoint;
  serialOptions_?: SerialOptions;
}

const createPolyfillPort = async (device: USBDevice): Promise<SerialPort> => {
  const { SerialPort: PolyfillSerialPort } =
    await import("web-serial-polyfill");

  /**
   * The polyfill hands out one cached ReadableStream that has no cancel()
   * handler. Once a consumer cancels it (the Improv SDK does when it stops
   * reading), every later `port.readable` is that same dead stream, so the
   * console would end immediately. It also throws on zero-length USB packets.
   * Native Web Serial gives a fresh stream after a cancel, so do the same.
   */
  class UsbSerialPort extends PolyfillSerialPort {
    private _stream: ReadableStream<Uint8Array> | null = null;

    // A read that was in flight when its stream got cancelled. The next
    // stream picks it up so no data is lost.
    private _pendingRead?: Promise<Uint8Array>;

    private get _internals(): PolyfillInternals {
      return this as unknown as PolyfillInternals;
    }

    public get readable(): ReadableStream<Uint8Array> | null {
      const { device_, serialOptions_ } = this._internals;
      if (this._stream || !device_.opened) {
        return this._stream;
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
              if (this._stream === stream) {
                this._stream = null;
              }
              controller.error(err);
              return;
            }
            if (this._stream !== stream) {
              // Cancelled while reading, keep the chunk for the next stream.
              return;
            }
            this._pendingRead = undefined;
            controller.enqueue(chunk);
          },
          cancel: () => {
            if (this._stream === stream) {
              this._stream = null;
            }
          },
        },
        new ByteLengthQueuingStrategy({
          highWaterMark: serialOptions_?.bufferSize ?? 255,
        }),
      );
      this._stream = stream;
      return stream;
    }

    private async _read(desiredSize: number | null): Promise<Uint8Array> {
      const { device_, inEndpoint_ } = this._internals;
      const packetSize = inEndpoint_.packetSize;
      const length =
        Math.max(1, Math.ceil((desiredSize ?? packetSize) / packetSize)) *
        packetSize;
      let result: USBInTransferResult;
      do {
        result = await device_.transferIn(inEndpoint_.endpointNumber, length);
        if (result.status !== "ok") {
          throw new Error(`USB error: ${result.status}`);
        }
        // Skip zero-length packets, there is nothing to deliver.
      } while (!result.data?.byteLength);
      return new Uint8Array(
        result.data.buffer,
        result.data.byteOffset,
        result.data.byteLength,
      );
    }

    public async open(options: SerialOptions): Promise<void> {
      await super.open(options);
      // The polyfill asserts DTR on open, native Web Serial does not. On ESP
      // chips DTR drives IO0 and RTS drives EN, so with DTR left high the
      // reset sequences of esptool-js and the console end up booting the ROM
      // bootloader instead of the firmware.
      await this.setSignals({ dataTerminalReady: false, requestToSend: false });
    }

    public async close(): Promise<void> {
      this._stream = null;
      this._pendingRead = undefined;
      await super.close();
    }
  }

  // Not structurally identical to the DOM SerialPort type, but it implements
  // the surface esptool-js and the Improv SDK use.
  return new UsbSerialPort(device) as unknown as SerialPort;
};

export const requestSerialPort = async (): Promise<SerialPort> => {
  if (!usePolyfill()) {
    return navigator.serial.requestPort();
  }
  // Same filter the polyfill's own requestPort uses: CDC control interface.
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 0x02 }],
  });
  return createPolyfillPort(device);
};
