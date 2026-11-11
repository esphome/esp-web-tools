import { getOperatingSystem } from "./get-operating-system";
import { findUsbSerialDriver, usbSerialFilters } from "./usb-serial";
import { UsbSerialPort } from "./usb-serial/port";

/**
 * Chrome on Android ships a native Web Serial that only lists Bluetooth serial
 * devices, never USB ones. There (and wherever Web Serial is missing but
 * WebUSB is present) we speak to USB-UART bridges and native-USB ESP chips
 * over WebUSB instead, see ./usb-serial.
 */
const useWebUsb = (): boolean =>
  "usb" in navigator &&
  (!("serial" in navigator) || getOperatingSystem() === "Android");

export const isSerialSupported = (): boolean =>
  "serial" in navigator || "usb" in navigator;

export const requestSerialPort = async (): Promise<SerialPort> => {
  if (!useWebUsb()) {
    return navigator.serial.requestPort();
  }
  const device = await navigator.usb.requestDevice({
    filters: usbSerialFilters(),
  });
  const driver = findUsbSerialDriver(device);
  if (!driver) {
    throw new Error("Unsupported USB serial device");
  }
  // Not structurally identical to the DOM SerialPort type, but it implements
  // the surface esptool-js and the Improv SDK use.
  return new UsbSerialPort(device, driver) as unknown as SerialPort;
};
