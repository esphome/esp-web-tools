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

export const requestSerialPort = async (): Promise<SerialPort> => {
  if (!usePolyfill()) {
    return navigator.serial.requestPort();
  }
  const { serial } = await import("web-serial-polyfill");
  // The polyfill implements the same surface esptool-js uses, but its class is
  // not structurally identical to the DOM SerialPort type.
  return (await serial.requestPort()) as unknown as SerialPort;
};
