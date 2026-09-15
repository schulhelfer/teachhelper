import { readFile } from 'node:fs/promises';

const workspaceRoot = new URL('../../src/modules/workspace/', import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

export function createWorkspaceModuleLoader(overrides = {}) {
  const cache = new Map();
  const sources = new Map(Object.entries(overrides).map(([path, source]) => [new URL(path, workspaceRoot).href, source]));
  const load = async (fileUrl, ancestors = new Set()) => {
    const key = new URL(fileUrl, workspaceRoot).href;
    if (ancestors.has(key)) throw new Error(`Cyclic workspace import: ${key}`);
    if (cache.has(key)) return cache.get(key);
    const nextAncestors = new Set([...ancestors, key]);
    const pending = (async () => {
      let source = sources.has(key) ? sources.get(key) : await readFile(new URL(key), 'utf8');
      const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\1/g)];
      for (const specifier of new Set(imports.map((match) => match[2]))) {
        const url = await load(new URL(specifier, key), nextAncestors);
        source = source.replaceAll(`'${specifier}'`, `'${url}'`).replaceAll(`"${specifier}"`, `"${url}"`);
      }
      return dataUrl(source);
    })();
    cache.set(key, pending);
    return pending;
  };
  return load;
}
