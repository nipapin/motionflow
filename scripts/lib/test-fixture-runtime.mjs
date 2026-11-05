import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileFunction, createContext } from "node:vm";

const require = createRequire(import.meta.url);
const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const sourceDirectories = new Set(["app", "components", "hooks", "lib", "scripts"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

export function compileTestFixture(file, { compilerOptions, replaceImportMetaUrl = false }) {
  const filename = realpathSync(file);
  const local = relative(root, filename);
  if (isAbsolute(local) || !sourceDirectories.has(local.split(sep)[0]) ||
      !sourceExtensions.has(extname(filename))) {
    throw new Error("Test fixtures must be project source files");
  }
  const ts = require("typescript");
  const original = readFileSync(filename, "utf8");
  const source = replaceImportMetaUrl
    ? original.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href))
    : original;
  const { outputText } = ts.transpileModule(source, { compilerOptions });

  // Only compiled project files reach the VM. Test values are passed separately.
  return {
    runIsolated(bindings) {
      const parsingContext = createContext(bindings, {
        codeGeneration: { strings: false, wasm: false },
      });
      const evaluate = compileFunction(outputText, [], { filename, parsingContext });
      evaluate();
    },
    runModule(bindings) {
      const evaluate = compileFunction(outputText, Object.keys(bindings), { filename });
      evaluate(...Object.values(bindings));
    },
  };
}
