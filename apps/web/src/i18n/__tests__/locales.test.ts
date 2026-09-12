import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  englishDictionary,
  loadDictionary,
  type TranslationKey,
} from "../locales";
import { UI_LANGUAGES } from "../index";

const TRANSLATABLE_ATTRIBUTES = new Set(["placeholder", "aria-label", "title", "alt"]);
const TEXT_PROPS = new Set([
  "label",
  "title",
  "description",
  "subtitle",
  "emptyText",
  "actionLabel",
  "helperText",
  "placeholder",
  "message",
  "successMessage",
  "errorMessage",
]);
const SKIP_SOURCE_PATTERNS = [/__tests__/, /components[\\/]ui/, /i18n[\\/]locales/, /vite-env\.d\.ts$/];

describe("UI i18n dictionaries", () => {
  it("ships all 11 interface languages used by paper translation", () => {
    expect(UI_LANGUAGES.map((language) => language.code)).toEqual([
      "en",
      "vi",
      "es",
      "fr",
      "de",
      "pt",
      "zh",
      "ja",
      "ko",
      "ru",
      "id",
    ]);
  });

  it("keeps every lazily loaded locale aligned with the English source keys", async () => {
    const sourceKeys = Object.keys(englishDictionary).sort() as TranslationKey[];

    for (const language of UI_LANGUAGES) {
      expect(Object.keys(await loadDictionary(language.code)).sort()).toEqual(sourceKeys);
    }
  });

  it("covers known body text that is easy to miss", () => {
    expect(englishDictionary).toMatchObject({
      "Add Note": "Add Note",
      "Create Paper": "Create Paper",
      "Logging in...": "Logging in...",
      "PDF is awaiting admin approval": "PDF is awaiting admin approval",
      "Queue data unavailable because Redis is unreachable.": "Queue data unavailable because Redis is unreachable.",
      "Save papers or AI reports here for quick access.": "Save papers or AI reports here for quick access.",
      "Search results come from the backend candidate index for the current Data Scope.": "Search results come from the backend candidate index for the current Data Scope.",
    });
  });

  it("covers static UI text rendered by pages and feature components", () => {
    const repoSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const uiStrings = collectUiStrings(repoSrc);
    const missing = [...uiStrings].filter((text) => !(text in englishDictionary)).sort((a, b) => a.localeCompare(b));

    expect(missing).toEqual([]);
  });
});

function collectUiStrings(root: string) {
  const strings = new Set<string>();

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (SKIP_SOURCE_PATTERNS.some((pattern) => pattern.test(fullPath))) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
        scanSourceFile(fullPath, strings);
      }
    }
  }

  walk(root);
  return strings;
}

function scanSourceFile(filePath: string, strings: Set<string>) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) addUiString(strings, node.getText(sourceFile));

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      const initializer = node.initializer;
      if (TRANSLATABLE_ATTRIBUTES.has(name) && initializer) {
        if (ts.isStringLiteral(initializer)) addUiString(strings, initializer.text);
        if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)) {
          addUiString(strings, initializer.expression.text);
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      const initializer = node.initializer;
      if (TEXT_PROPS.has(name) && ts.isStringLiteralLike(initializer)) addUiString(strings, initializer.text);
      if (TEXT_PROPS.has(name) && ts.isNoSubstitutionTemplateLiteral(initializer)) addUiString(strings, initializer.text);
    }

    if (ts.isStringLiteralLike(node) && isInJsxChildExpression(node)) addUiString(strings, node.text);
    if (ts.isNoSubstitutionTemplateLiteral(node) && isInJsxChildExpression(node)) addUiString(strings, node.text);
    if (ts.isTemplateExpression(node) && isInJsxChildExpression(node)) {
      addUiString(strings, node.head.text);
      for (const span of node.templateSpans) addUiString(strings, span.literal.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function propertyNameText(name: ts.PropertyName) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : "";
}

function nearestJsxAttribute(node: ts.Node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) return current;
    if (ts.isJsxElement(current) || ts.isJsxFragment(current)) return undefined;
    current = current.parent;
  }
  return undefined;
}

function isInJsxChildExpression(node: ts.Node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxExpression(current)) return !nearestJsxAttribute(current);
    if (ts.isJsxAttribute(current)) return false;
    current = current.parent;
  }
  return false;
}

function addUiString(strings: Set<string>, value: string) {
  const text = normalizeUiString(value);
  if (!text) return;
  strings.add(text);
}

function normalizeUiString(value: string) {
  const text = value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rarr;/g, "→")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 2 || text.length > 260) return "";
  if (!/[A-Za-zÀ-ỹА-Яа-я一-龯ぁ-ゔァ-ヴー々〆〤가-힣]/.test(text)) return "";
  if (/^[\d\s.,:%()[\]{}+\-*/|#@!$&]+$/.test(text)) return "";
  if (/^[/#&?=]/.test(text)) return "";
  if (/^https?:\/\//i.test(text) || text.includes("@")) return "";
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return "";
  if (/rgba?\(|hsl\(|\b(px|rem|fr|vh|vw)\b|calc\(|linear-gradient|shadow|animate-|duration-|ease-|translate|scale|rotate|opacity|fill|stroke|bg-|text-|border-|rounded|absolute|relative|flex|grid|items-|justify-|hover:|dark:|from-|to-|via-/i.test(text)) {
    return "";
  }
  if (/^(className|style|variant|default|button|submit|text|div|span|true|false|null|undefined)$/i.test(text)) {
    return "";
  }
  if (/^([a-z0-9_-]+|[/.?#=&:%-]+)$/i.test(text) && !/[A-Z ]/.test(text)) return "";
  if (/^(GET|POST|PATCH|DELETE|PUT)\s/.test(text)) return "";
  if (text.includes("=>") || text.includes("&&") || text.includes("||") || text.includes("?.")) return "";
  if (text.includes("const ") || text.includes("return ")) return "";
  return text;
}
