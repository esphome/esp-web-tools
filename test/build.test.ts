import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { rollup, type OutputChunk } from "rollup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS module
import baseConfig from "../rollup.config.mjs";

const exec = promisify(execFile);
const root = path.resolve(__dirname, "..");
let tscDir: string;

const build = async (withManualChunks: boolean): Promise<OutputChunk[]> => {
  const { output, ...rest } = baseConfig;
  const { manualChunks, ...outputRest } = output;
  const bundle = await rollup({
    ...rest,
    input: path.join(tscDir, "install-button.js"),
  });
  try {
    const result = await bundle.generate({
      ...outputRest,
      ...(withManualChunks ? { manualChunks } : {}),
    });
    return result.output.filter((o): o is OutputChunk => o.type === "chunk");
  } finally {
    await bundle.close();
  }
};

const importsEntry = (chunks: OutputChunk[], chunk: OutputChunk): boolean => {
  const entry = chunks.find((c) => c.isEntry)!;
  return [...chunk.imports, ...chunk.dynamicImports].includes(entry.fileName);
};

beforeAll(async () => {
  tscDir = await fs.mkdtemp(path.join(os.tmpdir(), "ewt-tsc-"));
  await exec("npx", ["tsc", "--outDir", tscDir], { cwd: root });
  // Let module resolution find the dependencies from the temp dir.
  await fs.symlink(
    path.join(root, "node_modules"),
    path.join(tscDir, "node_modules"),
  );
}, 180_000);

afterAll(async () => {
  await fs.rm(tscDir, { recursive: true, force: true });
});

describe("rollup build", () => {
  it("keeps lazy chunks from importing the entry chunk", async () => {
    const chunks = await build(true);
    expect(chunks.some((c) => /^shared.*\.js$/.test(c.fileName))).toBe(true);
    for (const chunk of chunks.filter((c) => !c.isEntry)) {
      expect(importsEntry(chunks, chunk)).toBe(false);
    }
    const noPort = chunks.find((c) =>
      Object.keys(c.modules).some((m) =>
        m.includes(path.join("no-port-picked", "index")),
      ),
    )!;
    expect(noPort).toBeDefined();
    expect(noPort.isEntry).toBe(false);
    expect(importsEntry(chunks, noPort)).toBe(false);
  }, 180_000);

  it("control: without manualChunks a lazy chunk imports the entry", async () => {
    const chunks = await build(false);
    const offenders = chunks.filter(
      (c) => !c.isEntry && importsEntry(chunks, c),
    );
    expect(offenders.length).toBeGreaterThan(0);
  }, 180_000);
});
