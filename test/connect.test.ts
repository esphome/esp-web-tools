import { beforeEach, describe, expect, it, vi } from "vitest";
import { connect } from "../src/connect";
import { requestSerialPort } from "../src/util/serial";
import { openNoPortPickedDialog } from "../src/no-port-picked/index";

vi.mock("../src/util/serial", () => ({ requestSerialPort: vi.fn() }));
vi.mock("../src/install-dialog.js", () => ({}));
vi.mock("../src/no-port-picked/index", () => ({
  openNoPortPickedDialog: vi.fn(),
}));

const mockedRequest = vi.mocked(requestSerialPort);
const mockedOpenDialog = vi.mocked(openNoPortPickedDialog);

const makeButton = (extra: Record<string, unknown> = {}): any => {
  const button = document.createElement("div") as any;
  Object.assign(button, extra);
  return button;
};

const makePort = (): any => ({
  open: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  vi.stubGlobal("alert", vi.fn());
});

describe("connect", () => {
  it("opens the no-port dialog on NotFoundError and retries via callback", async () => {
    mockedRequest.mockRejectedValue(
      Object.assign(new Error("none"), { name: "NotFoundError" }),
    );
    const button = makeButton();
    await connect(button);
    await vi.waitFor(() => expect(mockedOpenDialog).toHaveBeenCalledTimes(1));
    expect(alert).not.toHaveBeenCalled();
    expect(mockedRequest).toHaveBeenCalledTimes(1);

    const retry = mockedOpenDialog.mock.calls[0][0]!;
    retry();
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("alerts on other request errors", async () => {
    mockedRequest.mockRejectedValue(new Error("boom"));
    await connect(makeButton());
    expect(alert).toHaveBeenCalledWith("Error: boom");
    expect(mockedOpenDialog).not.toHaveBeenCalled();
  });

  it("returns early when no port is returned", async () => {
    mockedRequest.mockResolvedValue(undefined as any);
    await connect(makeButton());
    expect(document.body.children.length).toBe(0);
    expect(alert).not.toHaveBeenCalled();
  });

  it("alerts when opening the port fails", async () => {
    const port = makePort();
    port.open.mockRejectedValue(new Error("busy"));
    mockedRequest.mockResolvedValue(port);
    await connect(makeButton());
    expect(alert).toHaveBeenCalledWith("busy");
    expect(document.body.children.length).toBe(0);
  });

  it("appends the install dialog using button.manifest", async () => {
    const port = makePort();
    mockedRequest.mockResolvedValue(port);
    const overrides = { a: 1 };
    await connect(makeButton({ manifest: "m.json", overrides }));
    expect(port.open).toHaveBeenCalledWith({
      baudRate: 115200,
      bufferSize: 8192,
    });
    const el = document.body.querySelector("ewt-install-dialog") as any;
    expect(el.port).toBe(port);
    expect(el.manifestPath).toBe("m.json");
    expect(el.overrides).toBe(overrides);

    el.dispatchEvent(new Event("closed"));
    el.dispatchEvent(new Event("closed"));
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("falls back to the manifest attribute", async () => {
    mockedRequest.mockResolvedValue(makePort());
    const button = makeButton();
    button.setAttribute("manifest", "attr.json");
    await connect(button);
    const el = document.body.querySelector("ewt-install-dialog") as any;
    expect(el.manifestPath).toBe("attr.json");
  });
});
