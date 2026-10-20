import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ABSTAIN_REASON_KEYS } from "../closure-format";
import { englishDictionary, loadDictionary } from "@/i18n/locales";

const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageFile = resolve(featureRoot, "../../pages/gap-closure.tsx");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** String literals passed straight to t("..."), the way every component in this feature translates text. */
function translatedLiterals(): string[] {
  const keys = new Set<string>();
  for (const file of [...sourceFiles(featureRoot), pageFile]) {
    for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${match[1]}"`) as string);
  }
  return [...keys];
}

beforeAll(async () => { await loadDictionary("en"); });

describe("Gap Closure Protocol copy", () => {
  it("has an English entry for every translated literal and every reason message", () => {
    const keys = [...translatedLiterals(), ...Object.values(ABSTAIN_REASON_KEYS)];
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((key) => !(key in englishDictionary))).toEqual([]);
  });

  it("is translated into Vietnamese, with the same placeholders", async () => {
    const vi = await loadDictionary("vi");
    const keys = [...translatedLiterals(), ...Object.values(ABSTAIN_REASON_KEYS)];
    const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const key of keys) {
      expect(vi[key], key).toBeTruthy();
      expect(placeholders(vi[key]!), key).toEqual(placeholders(key));
    }
    expect(vi["Already answered"]).not.toBe("Already answered");
    expect(vi["Needs review"]).not.toBe("Needs review");
    expect(vi["Open · false-novelty risk ≤ {{bound}}%"]).toContain("{{bound}}%");
  });
});
