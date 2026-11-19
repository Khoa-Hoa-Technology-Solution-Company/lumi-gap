import { expect, it } from "vitest";
import { mentorApplicantsEn, mentorApplicantsVi } from "../locales/mentor-applicants";
import { loadDictionary } from "../locales";
it("provides English and Vietnamese copy for every applicant and evidence label", async () => {
  const [english, vietnamese] = await Promise.all([loadDictionary("en"), loadDictionary("vi")]);
  for (const key of Object.keys(mentorApplicantsEn)) {
    expect(english[key], key).toBeTruthy();
    expect(vietnamese[key], key).toBe((mentorApplicantsVi as Record<string,string>)[key]);
    expect(vietnamese[key], key).not.toBe(key);
  }
});
