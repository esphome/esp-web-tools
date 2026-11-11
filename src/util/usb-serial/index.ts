/**
 * Registry of WebUSB serial drivers.
 *
 * To add support for another USB-UART bridge:
 *   1. Write `src/util/usb-serial/<chip>.ts` exporting a factory
 *      `(device: USBDevice) => UsbSerialDriver` (see driver.ts): an object that
 *      claims the interface, programs baud rate / modem lines and, if the chip
 *      frames its data, strips that framing in `processRead`. Keep the
 *      protocol maths in small exported pure functions.
 *   2. Add an entry to `usbSerialDrivers` below holding the USB filters that
 *      identify the chip and a lazy `load` that imports the driver file.
 * The device picker filters and the device-to-driver matching are generated
 * from this list, and `UsbSerialPort` (port.ts) does everything else.
 *
 * The filters live here, and the driver code is imported lazily, because the
 * picker needs the filters up front while the driver code is only needed for
 * the device that was picked. That keeps each driver (and port.ts) in its own
 * chunk that is fetched on demand.
 *
 * Order matters: the first definition whose filters match a device wins, so
 * put chip specific drivers before the generic CDC-ACM one.
 */
import { matchesDefinition, type UsbSerialDriverDefinition } from "./driver";

export const usbSerialDrivers: UsbSerialDriverDefinition[] = [
  {
    name: "CP210x",
    // Same product IDs as the Linux cp210x driver's default table.
    // Vendor ID 0x10c4 is Silicon Labs.
    filters: [0xea60, 0xea61, 0xea63, 0xea70, 0xea71].map((productId) => ({
      vendorId: 0x10c4,
      productId,
    })),
    load: () => import("./cp210x").then((m) => m.createCp210xDriver),
  },
  {
    name: "CH340/CH341",
    filters: [
      { vendorId: 0x1a86, productId: 0x7523 },
      { vendorId: 0x1a86, productId: 0x7522 },
      { vendorId: 0x1a86, productId: 0x5523 },
      { vendorId: 0x4348, productId: 0x5523 },
    ],
    load: () => import("./ch34x").then((m) => m.createCh34xDriver),
  },
  {
    name: "FTDI",
    // FT232R/BM/AM, FT2232, FT4232, FT232H, FT-X.
    filters: [0x6001, 0x6010, 0x6011, 0x6014, 0x6015].map((productId) => ({
      vendorId: 0x0403,
      productId,
    })),
    load: () => import("./ftdi").then((m) => m.createFtdiDriver),
  },
  {
    name: "CDC-ACM",
    // USB class 0x02 is the communications device class.
    filters: [{ classCode: 0x02 }],
    load: () => import("./cdc-acm").then((m) => m.createCdcAcmDriver),
  },
];

/** Filters for `navigator.usb.requestDevice`. */
export const usbSerialFilters = (): USBDeviceFilter[] =>
  usbSerialDrivers.flatMap((driver) => driver.filters);

export const findUsbSerialDriver = (
  device: USBDevice,
): UsbSerialDriverDefinition | undefined =>
  usbSerialDrivers.find((driver) => matchesDefinition(device, driver));

/**
 * Let the user pick a USB serial device and wrap it as a Web Serial port.
 * Only the picked device's driver and port.ts are fetched.
 */
export const requestUsbSerialPort = async (): Promise<SerialPort> => {
  const device = await navigator.usb.requestDevice({
    filters: usbSerialFilters(),
  });
  const definition = findUsbSerialDriver(device);
  if (!definition) {
    throw new Error("Unsupported USB serial device");
  }
  const [create, { UsbSerialPort }] = await Promise.all([
    definition.load(),
    import("./port"),
  ]);
  // Not structurally identical to the DOM SerialPort type, but it implements
  // the surface esptool-js and the Improv SDK use.
  return new UsbSerialPort(device, create) as unknown as SerialPort;
};
