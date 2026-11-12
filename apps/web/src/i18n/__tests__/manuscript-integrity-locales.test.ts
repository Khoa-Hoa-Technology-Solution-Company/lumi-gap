import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { manuscriptIntegrityEn, manuscriptIntegrityVi } from "../locales/manuscript-integrity";
import { loadDictionary } from "../locales";
it("provides English and Vietnamese labels for integrity screens without unscoped domain enum overrides", async () => {
  const [en, vi] = await Promise.all([loadDictionary('en'), loadDictionary('vi')]);
  for (const key of Object.keys(manuscriptIntegrityEn)) { expect(en[key], key).toBeTruthy(); expect(vi[key], key).toBeTruthy(); if (key.startsWith('integrity.')) expect(vi[key], key).toBe(manuscriptIntegrityVi[key]); }
  const source = readFileSync(new URL('../../features/manuscripts/manuscript-integrity.tsx', import.meta.url), 'utf8');
  const missing = [...source.matchAll(/\bt\("([^"\n]+)"\)/g)].map(match => match[1]!).filter(key => !en[key] || !vi[key]); expect(missing).toEqual([]);
  expect(manuscriptIntegrityVi).not.toHaveProperty('AI'); expect(manuscriptIntegrityVi['integrity.AI']).toBeTruthy();
});
