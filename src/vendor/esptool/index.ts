import { ESP_ROM_BAUD, Logger } from "./const";
import { ESPLoader } from "./esp_loader";

export {
  CHIP_FAMILY_ESP32,
  CHIP_FAMILY_ESP32S2,
  CHIP_FAMILY_ESP8266,
} from "./const";

export const connect = async (logger: Logger) => {
  // - Request a port and open a connection.
  const port = await navigator.serial.requestPort();

  logger.log("Connecting...");
  // - Wait for the port to open.toggleUIConnected
  await port.open({ baudRate: ESP_ROM_BAUD });

  // const signals = await port.getSignals();

  logger.log("Connected successfully.");

  return new ESPLoader(port, logger);
};
