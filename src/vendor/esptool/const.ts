import { toByteArray } from "./util";

export interface Logger {
  log(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
}
export const baudRates = [921600, 115200, 230400, 460800];
export const flashSizes = {
  "512KB": 0x00,
  "256KB": 0x10,
  "1MB": 0x20,
  "2MB": 0x30,
  "4MB": 0x40,
  "2MB-c1": 0x50,
  "4MB-c1": 0x60,
  "8MB": 0x80,
  "16MB": 0x90,
};

export const FLASH_WRITE_SIZE = 0x200;
export const ESP32S2_FLASH_WRITE_SIZE = 0x400;
export const FLASH_SECTOR_SIZE = 0x1000; // Flash sector size, minimum unit of erase.
export const ESP_ROM_BAUD = 115200;

export const SYNC_PACKET = toByteArray(
  "\x07\x07\x12 UUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU"
);
export const CHIP_DETECT_MAGIC_REG_ADDR = 0x40001000;
export const CHIP_FAMILY_ESP8266 = 0x8266;
export const CHIP_FAMILY_ESP32 = 0x32;
export const CHIP_FAMILY_ESP32S2 = 0x3252;
export type ChipFamily =
  | typeof CHIP_FAMILY_ESP8266
  | typeof CHIP_FAMILY_ESP32
  | typeof CHIP_FAMILY_ESP32S2;

export const ESP32_DATAREGVALUE = 0x15122500;
export const ESP8266_DATAREGVALUE = 0x00062000;
export const ESP32S2_DATAREGVALUE = 0x500;

// Commands supported by ESP8266 ROM bootloader
export const ESP_FLASH_BEGIN = 0x02;
export const ESP_FLASH_DATA = 0x03;
export const ESP_FLASH_END = 0x04;
export const ESP_MEM_BEGIN = 0x05;
export const ESP_MEM_END = 0x06;
export const ESP_MEM_DATA = 0x07;
export const ESP_SYNC = 0x08;
export const ESP_WRITE_REG = 0x09;
export const ESP_READ_REG = 0x0a;

export const ESP_ERASE_FLASH = 0xd0;
export const ESP_ERASE_REGION = 0xd1;

export const ESP_SPI_SET_PARAMS = 0x0b;
export const ESP_SPI_ATTACH = 0x0d;
export const ESP_CHANGE_BAUDRATE = 0x0f;
export const ESP_SPI_FLASH_MD5 = 0x13;
export const ESP_CHECKSUM_MAGIC = 0xef;

export const ROM_INVALID_RECV_MSG = 0x05;

export const USB_RAM_BLOCK = 0x800;
export const ESP_RAM_BLOCK = 0x1800;

// Timeouts
export const DEFAULT_TIMEOUT = 3000;
export const CHIP_ERASE_TIMEOUT = 600000; // timeout for full chip erase in ms
export const MAX_TIMEOUT = CHIP_ERASE_TIMEOUT * 2; // longest any command can run in ms
export const SYNC_TIMEOUT = 100; // timeout for syncing with bootloader in ms
export const ERASE_REGION_TIMEOUT_PER_MB = 30000; // timeout (per megabyte) for erasing a region in ms
export const MEM_END_ROM_TIMEOUT = 50;

/**
 * @name slipEncode
 * Take an array buffer and return back a new array where
 * 0xdb is replaced with 0xdb 0xdd and 0xc0 is replaced with 0xdb 0xdc
 */

/**
 * @name timeoutPerMb
 * Scales timeouts which are size-specific
 */
export const timeoutPerMb = (secondsPerMb: number, sizeBytes: number) => {
  let result = Math.floor(secondsPerMb * (sizeBytes / 0x1e6));
  if (result < DEFAULT_TIMEOUT) {
    return DEFAULT_TIMEOUT;
  }
  return result;
};
