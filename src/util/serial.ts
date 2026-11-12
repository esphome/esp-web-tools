/**
 * The install button entry chunk must not import any other chunk, so this
 * check is inlined here instead of using getOperatingSystem, which the lazy
 * chunks also use. test/build.test.ts enforces this.
 *
 * Chrome on Android ships a native Web Serial that only lists Bluetooth serial
 * devices, never USB ones. There (and wherever Web Serial is missing but
 * WebUSB is present) we speak to USB-UART bridges and native-USB ESP chips
 * over WebUSB instead, see ./usb-serial.
 */
const useWebUsb = (): boolean =>
  "usb" in navigator &&
  (!("serial" in navigator) || /Android/.test(navigator.userAgent));

export const isSerialSupported = (): boolean =>
  "serial" in navigator || "usb" in navigator;

let usbSerial: Promise<typeof import("./usb-serial/index")> | undefined;

// The WebUSB code is only needed on Android, so it is a separate chunk that
// desktop browsers never download.
const loadUsbSerial = (): Promise<typeof import("./usb-serial/index")> =>
  (usbSerial ??= import("./usb-serial/index"));

/**
 * Fetch the WebUSB registry chunk ahead of time. requestDevice needs
 * transient user activation (about 5 seconds in Chrome), so the chunk is
 * fetched when the button renders, not after the click. A failed preload is
 * forgotten so the click retries it.
 */
export const preloadSerialSupport = (): void => {
  if (!useWebUsb()) {
    return;
  }
  loadUsbSerial().catch(() => {
    usbSerial = undefined;
  });
};

export const requestSerialPort = async (): Promise<SerialPort> => {
  if (!useWebUsb()) {
    return navigator.serial.requestPort();
  }
  const { requestUsbSerialPort } = await loadUsbSerial();
  return requestUsbSerialPort();
};
