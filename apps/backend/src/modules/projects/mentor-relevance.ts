import { normalizeResearchTerm, normalizeTechnicalSkill, TECHNICAL_SKILLS, type ResearchClassification, type AvailableMentor } from "@trend/shared-types";
type Explanation = NonNullable<AvailableMentor["matchExplanation"]>;
export function explainMentorRelevance(wanted: { classification?: ResearchClassification; terms: string[]; supportTypes?: string[] }, candidate: { classification?: ResearchClassification; areas: string[]; specializations: string[]; skills: string[]; interests: string[]; keywords: string[]; supportTypes?: string[]; preferredTopics?: string[]; preferredTopicIds?: string[] }): Explanation {
  const wantedTerms = new Set(wanted.terms.map(normalizeResearchTerm));
  const overlap = (values: string[]) => [...new Set(values.filter(term => wantedTerms.has(normalizeResearchTerm(term))))];
  const canonical = (level: string) => candidate.classification?.nodes.filter(node => node.level === level && wanted.classification?.nodes.some(w => w.id === node.id)).map(node => node.name) ?? [];
  const wantedSkills = new Set([...(wanted.classification?.skillIds ?? []), ...wanted.terms.map(normalizeTechnicalSkill)]);
  const skillIds = [...new Set([...(candidate.classification?.skillIds ?? []), ...candidate.skills.map(normalizeTechnicalSkill)])].filter(id => wantedSkills.has(id));
  const skills = skillIds.map(id => TECHNICAL_SKILLS.find(skill => skill.id === id)?.label ?? candidate.skills.find(skill => normalizeTechnicalSkill(skill) === id) ?? id);
  const topics = canonical("topic"), subfields = [...new Set([...canonical("subfield"), ...overlap(candidate.specializations)])], fields = [...new Set([...canonical("field"), ...overlap(candidate.areas)])];
  const interests = [...new Set([...overlap([...candidate.interests, ...candidate.keywords, ...candidate.preferredTopics ?? []]), ...(candidate.classification?.keywords.filter(keyword => wanted.classification?.keywordIds.includes(keyword.id)).map(keyword => keyword.name) ?? [])])];
  const supervisionTopics = wanted.classification?.nodes.filter(node => node.level === "topic" && candidate.preferredTopicIds?.includes(node.id)).map(node => node.name) ?? [];
  const support = candidate.supportTypes?.filter(type => wanted.supportTypes?.includes(type)) ?? [];
  const gaps = [...(wanted.classification?.nodes.some(node => node.level === "topic") && !topics.length ? ["No shared canonical research topic"] : []), ...(wanted.classification?.skillIds.filter(id => !skillIds.includes(id)).map(id => TECHNICAL_SKILLS.find(skill => skill.id === id)?.label ?? id) ?? [])];
  return { relevance: topics.length ? "HIGHLY_RELEVANT" : subfields.length || skills.length || interests.length || supervisionTopics.length ? "RELEVANT" : "POTENTIAL", topics, subfields, fields, skills, interests, supervisionTopics, support, gaps };
}
