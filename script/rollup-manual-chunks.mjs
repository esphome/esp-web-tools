// Collect the modules statically imported from `id`, including `id`.
export const staticClosure = (id, getModuleInfo) => {
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

/**
 * Lazy chunks must never import the entry chunk. Pages often load the entry
 * from an unpinned CDN URL (e.g. unpkg.com/esp-web-tools/...) while unpkg
 * rewrites the chunks' relative imports to a pinned version URL. The entry
 * then runs a second time and throws on its duplicate customElements.define,
 * so the lazy import fails. Modules shared by the entry and a lazy chunk go
 * into their own chunk instead of into the entry.
 */
export const createManualChunks = () => {
  let sharedModules;
  return (id, { getModuleInfo, getModuleIds }) => {
    if (!sharedModules) {
      const entryId = [...getModuleIds()].find(
        (moduleId) => getModuleInfo(moduleId).isEntry,
      );
      const fromEntry = staticClosure(entryId, getModuleInfo);
      const fromLazy = new Set();
      for (const moduleId of getModuleIds()) {
        for (const dynamicId of getModuleInfo(moduleId)
          .dynamicallyImportedIds) {
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
};
