import assert from "node:assert/strict";
import test from "node:test";

import { runPostFlash } from "../dist/post-flash.js";

const makePort = (steps) => ({
  open: async (options) => {
    assert.deepEqual(options, { baudRate: 115200, bufferSize: 8192 });
    steps.push("open");
  },
});

test("runs the callback after the port opens and before initialization", async () => {
  const steps = [];
  const port = makePort(steps);

  await runPostFlash(
    port,
    async (callbackPort) => {
      assert.equal(callbackPort, port);
      steps.push("callback-start");
      await Promise.resolve();
      steps.push("callback-end");
    },
    async () => {
      steps.push("initialize");
    },
    console,
  );

  assert.deepEqual(steps, [
    "open",
    "callback-start",
    "callback-end",
    "initialize",
  ]);
});

test("continues initialization when the callback fails", async () => {
  const steps = [];
  const errors = [];
  const failure = new Error("callback failed");

  await runPostFlash(
    makePort(steps),
    async () => {
      steps.push("callback");
      throw failure;
    },
    async () => {
      steps.push("initialize");
    },
    {
      log() {},
      error(...args) {
        errors.push(args);
      },
    },
  );

  assert.deepEqual(steps, ["open", "callback", "initialize"]);
  assert.deepEqual(errors, [["Post-flash callback failed.", failure]]);
});

test("continues without a callback", async () => {
  const steps = [];

  await runPostFlash(
    makePort(steps),
    undefined,
    () => {
      steps.push("initialize");
    },
    console,
  );

  assert.deepEqual(steps, ["open", "initialize"]);
});
