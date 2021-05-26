import {
  ChipFamily,
  CHIP_FAMILY_ESP32,
  CHIP_FAMILY_ESP32S2,
  CHIP_FAMILY_ESP8266,
} from "../const";
import { toByteArray } from "../util";

interface LoadedStub {
  text: string;
  data: string;
  text_start: number;
  entry: number;
  data_start: number;
}

interface Stub {
  text: number[];
  data: number[];
  text_start: number;
  entry: number;
  data_start: number;
}

export const getStubCode = async (chipFamily: ChipFamily): Promise<Stub> => {
  let stubcode!: LoadedStub;

  if (chipFamily == CHIP_FAMILY_ESP32) {
    stubcode = await import("./esp32.json");
  } else if (chipFamily == CHIP_FAMILY_ESP32S2) {
    stubcode = await import("./esp32s2.json");
  } else if (chipFamily == CHIP_FAMILY_ESP8266) {
    stubcode = await import("./esp8266.json");
  }

  // Base64 decode the text and data
  return {
    ...stubcode,
    text: toByteArray(atob(stubcode.text)),
    data: toByteArray(atob(stubcode.data)),
  };
};
