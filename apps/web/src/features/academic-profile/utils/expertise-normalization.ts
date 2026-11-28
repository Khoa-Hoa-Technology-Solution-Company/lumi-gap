import type { NormalizedResearchExpertise } from "@trend/shared-types";

const KNOWN_RESEARCH_METHOD_TERMS = new Set([
  "research methods",
  "research methodology",
  "systematic review",
  "systematic literature review",
  "literature screening",
  "evidence extraction",
  "experimental design",
  "experimental research",
  "survey design",
  "survey research",
  "qualitative analysis",
  "qualitative coding",
  "qualitative research",
  "quantitative analysis",
  "quantitative research",
  "mixed methods",
  "case study",
  "statistical analysis",
  "interview analysis",
  "archival research",
  "laboratory techniques",
  "meta-analysis",
  "meta analysis",
  "ablation study",
  "user study",
  "thiết kế thí nghiệm",
  "phương pháp nghiên cứu",
  "phân tích định tính",
  "phân tích định lượng",
  "phân tích thống kê",
  "tổng quan hệ thống",
  "nghiên cứu khảo sát",
  "nghiên cứu thực nghiệm",
  "nghiên cứu tình huống",
]);

export function dedupeAcademicTerms(values: ReadonlyArray<string | null | undefined>, max = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const clean = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

export function isKnownResearchMethodTerm(term: string): boolean {
  const key = term.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return KNOWN_RESEARCH_METHOD_TERMS.has(key);
}

export function normalizeAcademicExpertise(input: {
  expertiseAreas?: ReadonlyArray<string>;
  researchSpecializations?: ReadonlyArray<string>;
  researchInterests?: ReadonlyArray<string>;
  skills?: ReadonlyArray<string>;
  researchMethods?: ReadonlyArray<string>;
  researchKeywords?: ReadonlyArray<string>;
  classificationNodeNames?: ReadonlyArray<string>;
  classificationSkillLabels?: ReadonlyArray<string>;
}): NormalizedResearchExpertise {
  const explicitMethods = dedupeAcademicTerms(input.researchMethods ?? [], 30);
  const rawSkills = dedupeAcademicTerms([...(input.skills ?? []), ...(input.classificationSkillLabels ?? [])], 40);
  const rawAreas = dedupeAcademicTerms(
    [
      ...(input.expertiseAreas ?? []),
      ...(input.researchSpecializations ?? []),
      ...(input.classificationNodeNames ?? []),
      ...(input.researchInterests ?? []),
    ],
    40,
  );

  const methodsFromLegacy = [...rawSkills, ...rawAreas].filter(isKnownResearchMethodTerm);
  const researchMethods = dedupeAcademicTerms([...explicitMethods, ...methodsFromLegacy], 30);
  const methodKeys = new Set(researchMethods.map(item => item.toLocaleLowerCase()));

  const skills = rawSkills.filter(item => !methodKeys.has(item.toLocaleLowerCase()));
  const skillKeys = new Set(skills.map(item => item.toLocaleLowerCase()));

  const researchAreas = rawAreas.filter(item => {
    const key = item.toLocaleLowerCase();
    return !methodKeys.has(key) && !skillKeys.has(key);
  });

  const allKeys = new Set([
    ...researchAreas.map(item => item.toLocaleLowerCase()),
    ...skills.map(item => item.toLocaleLowerCase()),
    ...researchMethods.map(item => item.toLocaleLowerCase()),
  ]);
  for (const kw of dedupeAcademicTerms(input.researchKeywords ?? [], 40)) {
    const key = kw.toLocaleLowerCase();
    if (allKeys.has(key)) continue;
    allKeys.add(key);
    if (isKnownResearchMethodTerm(kw)) researchMethods.push(kw);
    else researchAreas.push(kw);
  }

  return { researchAreas, skills, researchMethods };
}
