/**
 * Building blocks shared by all USB-UART bridge drivers.
 *
 * A driver knows how to talk to one family of chips over WebUSB: which
 * interface to claim, how to initialise the chip, how to program baud rate and
 * modem lines. The generic `UsbSerialPort` (port.ts) turns any driver into the
 * Web Serial API surface that esptool-js, the Improv SDK and the console use.
 */

/** UART settings, already validated and with defaults filled in. */
export interface LineConfig {
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 2;
  parity: ParityType;
}

/** The bulk endpoints the port reads from and writes to. */
export interface UsbSerialEndpoints {
  in: USBEndpoint;
  out: USBEndpoint;
}

/** One opened chip. Created by the factory a definition's `load` resolves to. */
export interface UsbSerialDriver {
  /**
   * Claim the interfaces and initialise the chip. The USB configuration is
   * already selected. Returns the bulk endpoints carrying serial data.
   */
  open(): Promise<UsbSerialEndpoints>;
  /** Program baud rate, data bits, stop bits and parity. */
  setLineConfig(config: LineConfig): Promise<void>;
  /** Set both output modem lines (true = asserted). */
  setSignals(dataTerminalReady: boolean, requestToSend: boolean): Promise<void>;
  /** Assert or release a break condition. Omit if the chip cannot do it. */
  setBreak?(enabled: boolean): Promise<void>;
  /**
   * Strip chip specific framing from a transferIn result (e.g. FTDI prepends
   * 2 status bytes to every packet). May return an empty array.
   */
  processRead?(data: Uint8Array): Uint8Array;
  /** Release anything claimed in `open`. */
  close?(): Promise<void>;
}

/**
 * A registry entry describing a supported family of chips. Only the filters
 * are needed up front (for the device picker); the driver code itself is
 * fetched with `load` once a matching device has been picked.
 */
export interface UsbSerialDriverDefinition {
  name: string;
  /**
   * Used both for the `navigator.usb.requestDevice` picker and to match a
   * picked device to this driver. Same semantics as WebUSB: every field that
   * is set must match, and `classCode` matches the device or any interface.
   */
  filters: USBDeviceFilter[];
  /** Lazily fetch the driver code and resolve to its factory. */
  load(): Promise<(device: USBDevice) => UsbSerialDriver>;
}

const matchesFilter = (device: USBDevice, filter: USBDeviceFilter): boolean => {
  if (filter.vendorId !== undefined && filter.vendorId !== device.vendorId) {
    return false;
  }
  if (filter.productId !== undefined && filter.productId !== device.productId) {
    return false;
  }
  if (filter.classCode === undefined) {
    return true;
  }
  if (device.deviceClass === filter.classCode) {
    return true;
  }
  return device.configurations.some((config) =>
    config.interfaces.some((iface) =>
      iface.alternates.some((alt) => alt.interfaceClass === filter.classCode),
    ),
  );
};

export const matchesDefinition = (
  device: USBDevice,
  definition: UsbSerialDriverDefinition,
): boolean => definition.filters.some((f) => matchesFilter(device, f));

/** Find the first interface (alternate 0) of the active configuration. */
export const findInterface = (
  device: USBDevice,
  classCode: number,
): USBInterface | undefined =>
  device.configuration?.interfaces.find(
    (iface) => iface.alternates[0]?.interfaceClass === classCode,
  );

/** Find the bulk IN and OUT endpoints of an interface (alternate 0). */
export const findBulkEndpoints = (iface: USBInterface): UsbSerialEndpoints => {
  const endpoints = iface.alternates[0].endpoints.filter(
    (ep) => ep.type === "bulk",
  );
  const inEp = endpoints.find((ep) => ep.direction === "in");
  const outEp = endpoints.find((ep) => ep.direction === "out");
  if (!inEp || !outEp) {
    throw new Error(
      `Interface ${iface.interfaceNumber} has no bulk IN and OUT endpoints`,
    );
  }
  return { in: inEp, out: outEp };
};

/** controlTransferOut that throws when the device does not ACK. */
export const controlOut = async (
  device: USBDevice,
  setup: USBControlTransferParameters,
  data?: BufferSource,
): Promise<void> => {
  const result = await device.controlTransferOut(setup, data);
  if (result.status !== "ok") {
    throw new Error(
      `USB control request 0x${setup.request.toString(16)} failed: ${result.status}`,
    );
  }
};

/** controlTransferIn that throws when the device does not ACK. */
export const controlIn = async (
  device: USBDevice,
  setup: USBControlTransferParameters,
  length: number,
): Promise<DataView> => {
  const result = await device.controlTransferIn(setup, length);
  if (result.status !== "ok" || !result.data) {
    throw new Error(
      `USB control request 0x${setup.request.toString(16)} failed: ${result.status}`,
    );
  }
  return result.data;
};
