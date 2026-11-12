import { describe, expect, it, vi } from "vitest";
// @ts-expect-error plain JS module
import { createManualChunks } from "../script/rollup-manual-chunks.mjs";

interface FakeInfo {
  isEntry?: boolean;
  importedIds?: string[];
  dynamicallyImportedIds?: string[];
}

const setup = (graph: Record<string, FakeInfo>) => {
  const getModuleInfo = vi.fn((id: string) => {
    const info = graph[id];
    return info
      ? {
          isEntry: false,
          importedIds: [],
          dynamicallyImportedIds: [],
          ...info,
        }
      : null;
  });
  const getModuleIds = vi.fn(() => Object.keys(graph)[Symbol.iterator]());
  const manualChunks = createManualChunks();
  const run = (id: string) => manualChunks(id, { getModuleInfo, getModuleIds });
  return { run, getModuleIds, getModuleInfo, manualChunks };
};

describe("createManualChunks", () => {
  it("puts modules shared by the entry and a lazy chunk into shared", () => {
    const { run } = setup({
      entry: {
        isEntry: true,
        importedIds: ["common"],
        dynamicallyImportedIds: ["lazy"],
      },
      common: {},
      lazy: { importedIds: ["common"] },
    });
    expect(run("common")).toBe("shared");
  });

  it("leaves entry-only and lazy-only modules alone", () => {
    const { run } = setup({
      entry: {
        isEntry: true,
        importedIds: ["entryOnly"],
        dynamicallyImportedIds: ["lazy"],
      },
      entryOnly: {},
      lazy: { importedIds: ["lazyOnly"] },
      lazyOnly: {},
    });
    expect(run("entryOnly")).toBeUndefined();
    expect(run("lazyOnly")).toBeUndefined();
    expect(run("lazy")).toBeUndefined();
  });

  it("never puts the entry itself into shared", () => {
    const { run } = setup({
      entry: { isEntry: true, dynamicallyImportedIds: ["lazy"] },
      lazy: { importedIds: ["entry"] },
    });
    expect(run("entry")).toBeUndefined();
  });

  it("counts transitive static imports on both sides", () => {
    const { run } = setup({
      entry: {
        isEntry: true,
        importedIds: ["a"],
        dynamicallyImportedIds: ["lazy"],
      },
      a: { importedIds: ["deep"] },
      deep: {},
      lazy: { importedIds: ["b"] },
      b: { importedIds: ["deep"] },
    });
    expect(run("deep")).toBe("shared");
    expect(run("a")).toBeUndefined();
    expect(run("b")).toBeUndefined();
  });

  it("handles import cycles", () => {
    const { run } = setup({
      entry: {
        isEntry: true,
        importedIds: ["a"],
        dynamicallyImportedIds: ["lazy"],
      },
      a: { importedIds: ["b"] },
      b: { importedIds: ["a"] },
      lazy: { importedIds: ["a"] },
    });
    expect(run("a")).toBe("shared");
    expect(run("b")).toBe("shared");
  });

  it("tolerates imported ids without module info", () => {
    const { run } = setup({
      entry: {
        isEntry: true,
        importedIds: ["external", "common"],
        dynamicallyImportedIds: ["lazy"],
      },
      common: {},
      lazy: { importedIds: ["external", "common"] },
    });
    expect(run("common")).toBe("shared");
    expect(run("external")).toBe("shared");
  });

  it("memoises the shared set across calls", () => {
    const { run, getModuleIds } = setup({
      entry: {
        isEntry: true,
        importedIds: ["common"],
        dynamicallyImportedIds: ["lazy"],
      },
      common: {},
      lazy: { importedIds: ["common"] },
    });
    run("common");
    const callsAfterFirst = getModuleIds.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    run("entry");
    run("lazy");
    expect(getModuleIds.mock.calls.length).toBe(callsAfterFirst);
  });

  it("keeps a separate cache per factory", () => {
    const graph = {
      entry: {
        isEntry: true,
        importedIds: ["common"],
        dynamicallyImportedIds: ["lazy"],
      },
      common: {},
      lazy: { importedIds: ["common"] },
    };
    const one = setup(graph);
    const two = setup(graph);
    one.run("common");
    expect(one.getModuleIds).toHaveBeenCalled();
    expect(two.getModuleIds).not.toHaveBeenCalled();
    two.run("common");
    expect(two.getModuleIds).toHaveBeenCalled();
  });
});
