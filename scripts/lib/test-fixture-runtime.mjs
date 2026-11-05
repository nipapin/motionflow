import { readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFunction, createContext, Script } from "node:vm";

const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const sourceDirectories = new Set(["app", "components", "hooks", "lib", "scripts"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

// The harness compiles checked-out project modules. Data supplied to tests
// goes through the fixture bindings, never through the compiler.
export function readTestFixture(file) {
  const filename = realpathSync(file);
  const local = relative(root, filename);
  if (isAbsolute(local) || !sourceDirectories.has(local.split(sep)[0]) ||
      !sourceExtensions.has(extname(filename))) {
    throw new Error("Test fixtures must be project source files");
  }
  return readFileSync(filename, "utf8");
}

export function runIsolatedFixture(source, bindings, options) {
  const context = createContext(bindings, {
    codeGeneration: { strings: false, wasm: false },
  });
  new Script(source, options).runInContext(context);
}

export function runModuleFixture(source, bindings, filename) {
  const evaluate = compileFunction(source, Object.keys(bindings), { filename });
  evaluate(...Object.values(bindings));
}
