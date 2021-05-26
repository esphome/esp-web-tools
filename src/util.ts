import {
  CHIP_FAMILY_ESP32,
  CHIP_FAMILY_ESP32S2,
  CHIP_FAMILY_ESP8266,
} from "./vendor/esptool";
import { ESPLoader } from "./vendor/esptool/esp_loader";

export const getChipFamilyName = (esploader: ESPLoader) => {
  switch (esploader.chipFamily) {
    case CHIP_FAMILY_ESP32:
      return "ESP32";
    case CHIP_FAMILY_ESP8266:
      return "ESP8266";
    case CHIP_FAMILY_ESP32S2:
      return "ESP32-S2";
    default:
      return "Unknown Chip";
  }
};
