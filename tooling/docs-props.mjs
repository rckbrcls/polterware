#!/usr/bin/env node
// Extracts component prop tables from the design system's public exports for the gallery docs.
// Uses the classic compiler API (`typescript-classic`); the repo's typescript 7 has no stable JS API.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript-classic");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designSystem = path.join(root, "packages/frontend/design-system");
const indexFile = path.join(designSystem, "src/index.ts");
const outFile = path.join(root, "apps/gallery/src/generated/props.json");
const MAX_TYPE_LENGTH = 200;

const configPath = path.join(designSystem, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, designSystem);
const program = ts.createProgram([indexFile], { ...parsed.options, noEmit: true });
const checker = program.getTypeChecker();
const indexSource = program.getSourceFile(indexFile);
if (!indexSource) throw new Error(`Cannot load ${indexFile}`);
const indexSymbol = checker.getSymbolAtLocation(indexSource);
if (!indexSymbol) throw new Error("index.ts has no module symbol");

/** Attributes inherited from solid-js JSX types are summarised by interface name instead of expanded. */
const isInherited = (symbol) => (symbol.declarations ?? []).every((declaration) => declaration.getSourceFile().fileName.includes("/solid-js/"));
const parentName = (symbol) => {
  const parent = symbol.declarations?.[0]?.parent;
  return parent && "name" in parent && parent.name ? parent.name.getText() : undefined;
};

const typeText = (type, location, optional = false) => {
  let text = checker.typeToString(type, location, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope);
  if (optional) text = text.replace(/ \| undefined$/, "");
  return text.length > MAX_TYPE_LENGTH ? `${text.slice(0, MAX_TYPE_LENGTH - 1)}…` : text;
};

function describe(propsType, location) {
  const extendsNames = new Set();
  const props = [];
  for (const property of checker.getPropertiesOfType(propsType)) {
    if (isInherited(property)) {
      const parent = parentName(property);
      if (parent) extendsNames.add(parent);
      continue;
    }
    const description = ts.displayPartsToString(property.getDocumentationComment(checker)).trim();
    const defaultTag = property.getJsDocTags(checker).find((tag) => tag.name === "default" || tag.name === "defaultValue");
    props.push({
      name: property.getName(),
      type: typeText(checker.getTypeOfSymbolAtLocation(property, location), location, (property.flags & ts.SymbolFlags.Optional) !== 0),
      required: (property.flags & ts.SymbolFlags.Optional) === 0,
      ...(defaultTag ? { default: ts.displayPartsToString(defaultTag.text).trim() } : {}),
      ...(description ? { description } : {}),
    });
  }
  props.sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name));
  // Keep the element-specific interface (ButtonHTMLAttributes); the shared base interfaces are noise.
  const specific = [...extendsNames].filter((name) => /HTMLAttributes$/.test(name) && name !== "HTMLAttributes");
  const names = specific.length ? specific : [...extendsNames].filter((name) => name === "HTMLAttributes");
  return { ...(names.length ? { extends: names.sort() } : {}), props };
}

function fromCallable(type, location) {
  const signature = type.getCallSignatures()[0];
  if (!signature) return undefined;
  const parameter = signature.getParameters()[0];
  if (!parameter) return { props: [] };
  return describe(checker.getTypeOfSymbolAtLocation(parameter, location), location);
}

const result = {};
const unresolved = [];
for (const exported of checker.getExportsOfModule(indexSymbol)) {
  const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  if ((symbol.flags & ts.SymbolFlags.Value) === 0) continue;
  const name = exported.getName();
  const type = checker.getTypeOfSymbolAtLocation(symbol, indexSource);
  if (type.getCallSignatures().length) {
    const doc = fromCallable(type, indexSource);
    if (doc && (doc.props.length || doc.extends)) result[name] = doc;
    continue;
  }
  // Namespace objects such as DataTable.Root: one entry per callable member.
  let members = 0;
  for (const member of /^[A-Z]/.test(name) ? checker.getPropertiesOfType(type) : []) {
    if (!/^[A-Z]/.test(member.getName())) continue;
    const memberType = checker.getTypeOfSymbolAtLocation(member, indexSource);
    if (!memberType.getCallSignatures().length) continue;
    const doc = fromCallable(memberType, indexSource);
    members += 1;
    if (doc) result[`${name}.${member.getName()}`] = doc;
  }
  if (members === 0 && symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Class)) unresolved.push(name);
}

const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`docs-props: wrote ${Object.keys(sorted).length} entries to ${path.relative(root, outFile)}`);
if (unresolved.length) console.warn(`docs-props: no props resolved for ${unresolved.join(", ")}`);
