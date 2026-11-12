import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let android: boolean;
let usbImports: number;
let usbFailuresLeft: number;
const requestUsbSerialPort = vi.fn();

const setNav = (key: "serial" | "usb", value: unknown): void => {
  Object.defineProperty(navigator, key, {
    value,
    configurable: true,
    writable: true,
  });
};

const load = async () => {
  vi.resetModules();
  Object.defineProperty(navigator, "userAgent", {
    value: android ? "Mozilla/5.0 (Linux; Android 14)" : "Mozilla/5.0 (X11)",
    configurable: true,
  });
  vi.doMock("../src/util/usb-serial/index", () => {
    usbImports++;
    if (usbFailuresLeft > 0) {
      usbFailuresLeft--;
      throw new Error("chunk failed");
    }
    return { requestUsbSerialPort };
  });
  return import("../src/util/serial");
};

beforeEach(() => {
  android = false;
  usbImports = 0;
  usbFailuresLeft = 0;
  requestUsbSerialPort.mockReset();
});

afterEach(() => {
  delete (navigator as any).serial;
  delete (navigator as any).usb;
});

describe("isSerialSupported", () => {
  it("is true with serial, usb, or both", async () => {
    const mod = await load();
    setNav("serial", {});
    expect(mod.isSerialSupported()).toBe(true);
    delete (navigator as any).serial;
    setNav("usb", {});
    expect(mod.isSerialSupported()).toBe(true);
    setNav("serial", {});
    expect(mod.isSerialSupported()).toBe(true);
  });

  it("is false with neither", async () => {
    const mod = await load();
    expect(mod.isSerialSupported()).toBe(false);
  });
});

describe("requestSerialPort", () => {
  it("uses Web Serial on desktop", async () => {
    const port = {};
    setNav("serial", { requestPort: vi.fn().mockResolvedValue(port) });
    const mod = await load();
    expect(await mod.requestSerialPort()).toBe(port);
    expect(usbImports).toBe(0);
  });

  it("uses WebUSB on Android even with Web Serial", async () => {
    android = true;
    const requestPort = vi.fn();
    setNav("serial", { requestPort });
    setNav("usb", {});
    const usbPort = {};
    requestUsbSerialPort.mockResolvedValue(usbPort);
    const mod = await load();
    expect(await mod.requestSerialPort()).toBe(usbPort);
    expect(requestPort).not.toHaveBeenCalled();
  });

  it("uses WebUSB when only usb exists", async () => {
    setNav("usb", {});
    requestUsbSerialPort.mockResolvedValue("p");
    const mod = await load();
    expect(await mod.requestSerialPort()).toBe("p");
  });

  it("uses Web Serial on Android without WebUSB", async () => {
    android = true;
    const requestPort = vi.fn().mockResolvedValue("s");
    setNav("serial", { requestPort });
    const mod = await load();
    expect(await mod.requestSerialPort()).toBe("s");
  });

  it("reuses the cached usb-serial import", async () => {
    setNav("usb", {});
    requestUsbSerialPort.mockResolvedValue("p");
    const mod = await load();
    await mod.requestSerialPort();
    await mod.requestSerialPort();
    expect(usbImports).toBe(1);
    expect(requestUsbSerialPort).toHaveBeenCalledTimes(2);
  });
});

describe("preloadSerialSupport", () => {
  it("does nothing without WebUSB", async () => {
    setNav("serial", {});
    const mod = await load();
    mod.preloadSerialSupport();
    await new Promise((r) => setTimeout(r, 0));
    expect(usbImports).toBe(0);
  });

  it("loads the chunk with WebUSB", async () => {
    setNav("usb", {});
    const mod = await load();
    mod.preloadSerialSupport();
    await vi.waitFor(() => expect(usbImports).toBe(1));
    requestUsbSerialPort.mockResolvedValue("p");
    await mod.requestSerialPort();
    expect(usbImports).toBe(1);
  });

  it("forgets a failed preload so the next request retries", async () => {
    setNav("usb", {});
    usbFailuresLeft = 1;
    const mod = await load();
    mod.preloadSerialSupport();
    await new Promise((r) => setTimeout(r, 10));
    expect(usbImports).toBe(1);
    requestUsbSerialPort.mockResolvedValue("p");
    expect(await mod.requestSerialPort()).toBe("p");
    expect(usbImports).toBe(2);
  });
});
