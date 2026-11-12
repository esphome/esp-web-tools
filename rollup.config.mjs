import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";

const ENTRY = "install-button.js";

// Collect the modules statically imported from `id`, including `id`.
const staticClosure = (id, getModuleInfo) => {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(getModuleInfo(current)?.importedIds ?? []));
  }
  return seen;
};

let sharedModules;

/**
 * Lazy chunks must never import the entry chunk. Pages often load the entry
 * from an unpinned CDN URL (e.g. unpkg.com/esp-web-tools/...) while unpkg
 * rewrites the chunks' relative imports to a pinned version URL. The entry
 * then runs a second time and throws on its duplicate customElements.define,
 * so the lazy import fails. Modules shared by the entry and a lazy chunk go
 * into their own chunk instead of into the entry.
 */
const manualChunks = (id, { getModuleInfo, getModuleIds }) => {
  if (!sharedModules) {
    const entryId = [...getModuleIds()].find(
      (moduleId) => getModuleInfo(moduleId).isEntry,
    );
    const fromEntry = staticClosure(entryId, getModuleInfo);
    const fromLazy = new Set();
    for (const moduleId of getModuleIds()) {
      for (const dynamicId of getModuleInfo(moduleId).dynamicallyImportedIds) {
        for (const lazyId of staticClosure(dynamicId, getModuleInfo)) {
          fromLazy.add(lazyId);
        }
      }
    }
    sharedModules = new Set(
      [...fromEntry].filter((m) => m !== entryId && fromLazy.has(m)),
    );
  }
  return sharedModules.has(id) ? "shared" : undefined;
};

const config = {
  input: `dist/${ENTRY}`,
  output: {
    dir: "dist/web",
    format: "module",
    manualChunks,
  },
  external: ["https://www.improv-wifi.com/sdk-js/launch-button.js"],
  preserveEntrySignatures: false,
  plugins: [
    commonjs(),
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    babel({
      babelHelpers: "bundled",
      presets: [
        [
          "@babel/preset-env",
          {
            targets: {
              // We use unpkg as CDN and it doesn't bundle modern syntax
              chrome: "84",
            },
          },
        ],
      ],
    }),
    json(),
  ],
};

if (process.env.NODE_ENV === "production") {
  config.plugins.push(
    terser({
      ecma: 2019,
      toplevel: true,
      format: {
        comments: false,
      },
    })
  );
}

export default config;
