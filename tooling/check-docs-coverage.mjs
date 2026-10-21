#!/usr/bin/env node
// Ratchet: every value export of the design system index must be listed in a `*.docs.tsx` entry,
// except names in tooling/docs-coverage-baseline.json. New exports must be documented; the baseline
// may only shrink. Run with --write-baseline to regenerate it after documenting components.
import { createRequire } from "node:module";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript-classic");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designSystem = path.join(root, "packages/frontend/design-system");
const indexFile = path.join(designSystem, "src/index.ts");
const baselineFile = path.join(root, "tooling/docs-coverage-baseline.json");

const config = ts.readConfigFile(path.join(designSystem, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, designSystem);
const program = ts.createProgram([indexFile], { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const indexSymbol = checker.getSymbolAtLocation(program.getSourceFile(indexFile));
const valueExports = checker
  .getExportsOfModule(indexSymbol)
  .filter((exported) => {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    return (symbol.flags & ts.SymbolFlags.Value) !== 0;
  })
  .map((exported) => exported.getName())
  .sort();

function docsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : docsFiles(full);
    return entry.name.endsWith(".docs.tsx") ? [full] : [];
  });
}

const documented = new Set();
for (const file of docsFiles(path.join(designSystem, "src"))) {
  const match = /exports:\s*\[([^\]]*)\]/.exec(readFileSync(file, "utf8"));
  if (!match) {
    console.error(`docs coverage: ${path.relative(root, file)} has no \`exports: [...]\` list`);
    process.exitCode = 1;
    continue;
  }
  for (const name of match[1].matchAll(/"([^"]+)"/g)) documented.add(name[1]);
}

const missing = valueExports.filter((name) => !documented.has(name));
const unknown = [...documented].filter((name) => !valueExports.includes(name));

if (process.argv.includes("--write-baseline")) {
  writeFileSync(baselineFile, `${JSON.stringify(missing, null, 2)}\n`);
  console.log(`docs coverage: baseline now lists ${missing.length} undocumented exports`);
  process.exit(process.exitCode ?? 0);
}

const baseline = new Set(existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : []);
const fresh = missing.filter((name) => !baseline.has(name));
const stale = [...baseline].filter((name) => !missing.includes(name));
if (fresh.length) console.error(`docs coverage: undocumented exports (add a *.docs.tsx entry):\n  ${fresh.join("\n  ")}`);
if (stale.length) console.error(`docs coverage: baseline lists documented or removed exports (run --write-baseline):\n  ${stale.join("\n  ")}`);
if (unknown.length) console.error(`docs coverage: docs reference names that are not exported:\n  ${unknown.join("\n  ")}`);
if (fresh.length || stale.length || unknown.length) process.exit(1);
if (process.exitCode) process.exit(process.exitCode);
console.log(`docs coverage ok: ${valueExports.length - missing.length}/${valueExports.length} documented, ${baseline.size} in baseline`);
