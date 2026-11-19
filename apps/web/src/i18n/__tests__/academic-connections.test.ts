import { expect, it } from "vitest";
import { academicConnectionsEn, academicConnectionsVi } from "../locales/academic-connections";
import { loadDictionary } from "../locales";
it("loads ORCID and lecturer expertise messages in both dictionaries without changing other domain labels", async () => {
  const [en, vi] = await Promise.all([loadDictionary("en"), loadDictionary("vi")]);
  for (const key of Object.keys(academicConnectionsEn)) { expect(en[key], key).toBe(academicConnectionsEn[key]); expect(vi[key], key).toBe(academicConnectionsVi[key]); }
  expect(vi["Research Specializations"]).toBe("Chuyên ngành nghiên cứu");
});
