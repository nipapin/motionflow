import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    return nextResolve(new URL(specifier.slice(2) + '.ts', root).href, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith(root.href) || !url.endsWith('.ts')) return nextLoad(url, context);
  const source = await readFile(new URL(url), 'utf8');
  return {
    format: 'module',
    source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    shortCircuit: true,
  };
}
