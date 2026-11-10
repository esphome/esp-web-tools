/**
 * Registry of WebUSB serial drivers.
 *
 * To add support for another USB-UART bridge:
 *   1. Write `src/util/usb-serial/<chip>.ts` exporting a
 *      `UsbSerialDriverDefinition` (see driver.ts): the USB filters that
 *      identify the chip, plus a `create(device)` returning an object that
 *      claims the interface, programs baud rate / modem lines and, if the chip
 *      frames its data, strips that framing in `processRead`. Keep the
 *      protocol maths in small exported pure functions.
 *   2. Add it to `usbSerialDrivers` below.
 * The device picker filters and the device-to-driver matching are generated
 * from this list, and `UsbSerialPort` (port.ts) does everything else.
 *
 * Order matters: the first definition whose filters match a device wins, so
 * put chip specific drivers before the generic CDC-ACM one.
 */
import { cdcAcmDriver } from "./cdc-acm";
import { ch34xDriver } from "./ch34x";
import { cp210xDriver } from "./cp210x";
import { matchesDefinition, type UsbSerialDriverDefinition } from "./driver";
import { ftdiDriver } from "./ftdi";

export const usbSerialDrivers: UsbSerialDriverDefinition[] = [
  cp210xDriver,
  ch34xDriver,
  ftdiDriver,
  cdcAcmDriver,
];

/** Filters for `navigator.usb.requestDevice`. */
export const usbSerialFilters = (): USBDeviceFilter[] =>
  usbSerialDrivers.flatMap((driver) => driver.filters);

export const findUsbSerialDriver = (
  device: USBDevice,
): UsbSerialDriverDefinition | undefined =>
  usbSerialDrivers.find((driver) => matchesDefinition(device, driver));
