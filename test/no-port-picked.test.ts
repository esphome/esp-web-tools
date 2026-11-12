import { beforeEach, describe, expect, it, vi } from "vitest";
import { openNoPortPickedDialog } from "../src/no-port-picked/index";

vi.mock("../src/no-port-picked/no-port-picked-dialog", () => ({}));

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("openNoPortPickedDialog", () => {
  it("appends the dialog with the retry callback", async () => {
    const cb = vi.fn();
    expect(await openNoPortPickedDialog(cb)).toBe(true);
    const el = document.body.querySelector("ewt-no-port-picked-dialog") as any;
    expect(el).not.toBeNull();
    expect(el.doTryAgain).toBe(cb);
  });

  it("works without a callback", async () => {
    expect(await openNoPortPickedDialog()).toBe(true);
    const el = document.body.querySelector("ewt-no-port-picked-dialog") as any;
    expect(el.doTryAgain).toBeUndefined();
  });
});
