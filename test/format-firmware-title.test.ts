import { describe, expect, it } from "vitest";
import { formatFirmwareTitle } from "../src/util/format-firmware-title";

describe("formatFirmwareTitle", () => {
  it("splits on dots and title cases ESPHome", () => {
    expect(formatFirmwareTitle("esphome.web")).toBe("ESPHome\nWeb");
  });

  it("matches ESPHome case-insensitively", () => {
    expect(formatFirmwareTitle("ESPHOME.web")).toBe("ESPHome\nWeb");
  });

  it("converts hyphens to spaces when there are no underscores", () => {
    expect(formatFirmwareTitle("esphome.bluetooth-proxy")).toBe(
      "ESPHome\nBluetooth Proxy",
    );
  });

  it("converts underscores to spaces when there are no hyphens", () => {
    expect(formatFirmwareTitle("esphome.bluetooth_proxy")).toBe(
      "ESPHome\nBluetooth Proxy",
    );
  });

  it("keeps hyphens and converts underscores when mixed", () => {
    expect(formatFirmwareTitle("esphome.my_bluetooth-proxy")).toBe(
      "ESPHome\nMy Bluetooth-Proxy",
    );
  });

  it("handles a name with no dot", () => {
    expect(formatFirmwareTitle("my_firmware")).toBe("My Firmware");
  });

  it("keeps existing casing after the first letter", () => {
    expect(formatFirmwareTitle("m5stack.ESP32 cam")).toBe("M5stack\nESP32 Cam");
  });

  it("does not treat Object.prototype keys as special words", () => {
    expect(formatFirmwareTitle("constructor.toString")).toBe(
      "Constructor\nToString",
    );
  });

  it("drops empty lines", () => {
    expect(formatFirmwareTitle(".esphome..web.")).toBe("ESPHome\nWeb");
    expect(formatFirmwareTitle("")).toBe("");
  });
});
