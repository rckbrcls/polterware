import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// Only the languages agents usually print, so the bundle stays small.
const LANGUAGES = { bash, css, diff, go, ini, javascript, json, markdown, python, rust, sql, typescript, xml, yaml };
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);
hljs.registerAliases(["sh", "shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["js", "jsx", "mjs"], { languageName: "javascript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["toml"], { languageName: "ini" });
hljs.registerAliases(["patch"], { languageName: "diff" });
hljs.registerAliases(["md"], { languageName: "markdown" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["rs"], { languageName: "rust" });

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[char]};`);

/** A diff or patch: hunk headers, or most lines marked added, removed, or unchanged. */
export function looksLikeDiff(text: string): boolean {
  const lines = text.split("\n").filter(Boolean);
  if (lines.some((line) => /^@@ .* @@/.test(line) || /^diff --git /.test(line))) return true;
  const marked = lines.filter((line) => /^[+-](?![+-])/.test(line)).length;
  return lines.length >= 2 && marked >= Math.ceil(lines.length / 2);
}

/**
 * Escaped HTML with highlight.js token spans (`hljs-*`), colored by the terminal theme in
 * `terminal.css`. A known language is used as given; without one, a diff or JSON is recognised,
 * a fenced block (`guess`) is detected among the registered languages, and anything else stays plain.
 */
export function highlightTerminal(code: string, language = "", guess = false): string {
  const known = language && hljs.getLanguage(language) ? language : "";
  if (known) return hljs.highlight(code, { language: known, ignoreIllegals: true }).value;
  if (looksLikeDiff(code)) return hljs.highlight(code, { language: "diff", ignoreIllegals: true }).value;
  if (/^\s*[[{]/.test(code) && /[\]}]\s*$/.test(code)) {
    try {
      JSON.parse(code);
      return hljs.highlight(code, { language: "json", ignoreIllegals: true }).value;
    } catch {
      // Not JSON after all.
    }
  }
  if (guess && code.length < 20_000) return hljs.highlightAuto(code, Object.keys(LANGUAGES)).value;
  return escape(code);
}
