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

const build = async (): Promise<OutputChunk[]> => {
  const { output, ...rest } = baseConfig;
  const bundle = await rollup({
    ...rest,
    input: path.join(tscDir, "install-button.js"),
  });
  try {
    const result = await bundle.generate(output);
    return result.output.filter((o): o is OutputChunk => o.type === "chunk");
  } finally {
    await bundle.close();
  }
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
  it("keeps the entry chunk free of imports of other chunks", async () => {
    const entry = (await build()).find((c) => c.isEntry)!;
    // The entry is loaded straight from a script tag, so it must be a single
    // file that needs nothing else to start. Lazy chunks load on demand.
    expect(entry.imports).toEqual([]);
  }, 180_000);

  it("keeps lazy chunks from importing the entry chunk", async () => {
    // Pages often load the entry from an unpinned CDN URL while unpkg
    // rewrites the chunks' relative imports to a pinned version URL. A lazy
    // chunk importing the entry would run it a second time, which throws on
    // the duplicate customElements.define.
    const chunks = await build();
    const entry = chunks.find((c) => c.isEntry)!;
    for (const chunk of chunks.filter((c) => !c.isEntry)) {
      expect([...chunk.imports, ...chunk.dynamicImports]).not.toContain(
        entry.fileName,
      );
    }
    const noPort = chunks.find((c) =>
      Object.keys(c.modules).some((m) =>
        m.includes(path.join("no-port-picked", "index")),
      ),
    )!;
    expect(noPort).toBeDefined();
    expect(noPort.isEntry).toBe(false);
  }, 180_000);
});
