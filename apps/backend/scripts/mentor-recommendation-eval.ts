/**
 * Reproducible Offline Benchmark Harness for Academic Mentor Recommendation.
 *
 * IMPORTANT: This script evaluates Baseline 1 (Keyword Overlap), Baseline 2 (Synthetic Vector Cosine),
 * and the Proposed Hybrid Need-Level Method on 24 controlled synthetic research project scenarios.
 * Results measure engineering behavior on controlled fixtures — NOT human expert ground-truth validation.
 */
import { normalizeResearchTerm, type ResearchSupportNeed } from "@trend/shared-types";
import {
  cosineSimilarity,
  evaluateCandidateRecommendation,
  evaluateLecturerEligibility,
  type ProjectRecommendationInput,
  type RecommendationCandidateProfile,
} from "../src/modules/projects/mentor-recommendation.engine.js";

// Deterministic 6-dim synthetic topic subspace vectors for offline semantic baseline reproducibility:
// [NLP/LLM, IR/Search, Methodology/Review, SoftwareEng/Sec, Education/Qual, Healthcare/Bio]
type Vec6 = [number, number, number, number, number, number];

interface EvalCandidate {
  profile: RecommendationCandidateProfile;
  profileVec: Vec6;
}

interface EvalScenario {
  id: string;
  name: string;
  project: ProjectRecommendationInput;
  queryVec: Vec6;
  /** Controlled synthetic rubric (0..3) defined for fixture sanity benchmarking only — NOT human expert labels. */
  fixtureGrades: Record<string, 0 | 1 | 2 | 3>;
  expectAbstention?: boolean;
}

const CANDIDATES: EvalCandidate[] = [
  {
    profileVec: [0.95, 0.85, 0.2, 0.35, 0.05, 0.05],
    profile: {
      lecturerId: "A", publicId: "A", fullName: "Lecturer A (NLP/IR)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 1, maxActiveProjects: 4,
      expertiseAreas: ["Natural Language Processing", "Large Language Models", "Information Retrieval"],
      researchSpecializations: ["Semantic Search"], skills: ["Python", "PyTorch"], researchMethods: ["Experimental Design"], researchKeywords: ["LLM Evaluation", "RAG"], researchInterests: ["NLP"],
      supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "EXPERIMENT_DESIGN"], preferredTopics: ["NLP"], preferredTopicIds: [],
      publications: [{ id: "pa1", paperId: "pa1", title: "Semantic Retrieval with Large Language Models", abstractText: "Information Retrieval and Large Language Models for academic search evaluation.", year: 2025, source: "openalex", embedding: [0.95, 0.88, 0.2, 0.3, 0.0, 0.0], attributionStatus: "LINKED_IDENTITY" }],
    },
  },
  {
    profileVec: [0.15, 0.2, 0.96, 0.1, 0.35, 0.15],
    profile: {
      lecturerId: "B", publicId: "B", fullName: "Lecturer B (Methodology)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 1, maxActiveProjects: 4,
      expertiseAreas: ["Research Methodology", "Literature Review", "Academic Writing"],
      researchSpecializations: ["Systematic Review"], skills: ["Systematic Review"], researchMethods: ["Systematic Review", "Research Methods"], researchKeywords: ["Research Gap", "Literature Review"], researchInterests: ["Research Methodology"],
      supportTypes: ["RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION", "RESEARCH_METHODOLOGY", "ACADEMIC_WRITING"], preferredTopics: ["Literature Review"], preferredTopicIds: [],
      publications: [{ id: "pb1", paperId: "pb1", title: "Methodological Guidelines for Research Gap Validation", abstractText: "Systematic review and literature synthesis guidelines for research question formulation.", year: 2024, source: "openalex", embedding: [0.15, 0.2, 0.95, 0.1, 0.3, 0.1], attributionStatus: "LINKED_IDENTITY" }],
    },
  },
  {
    profileVec: [0.25, 0.25, 0.2, 0.96, 0.05, 0.05],
    profile: {
      lecturerId: "C", publicId: "C", fullName: "Lecturer C (Software Eng)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 1, maxActiveProjects: 4,
      expertiseAreas: ["Software Engineering", "Cybersecurity", "System Architecture"],
      researchSpecializations: ["Vulnerability Detection"], skills: ["Python", "SQL"], researchMethods: ["Experimental Design", "Case Study"], researchKeywords: ["Secure Coding", "System Reliability"], researchInterests: ["Software Engineering"],
      supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "EXPERIMENT_DESIGN"], preferredTopics: ["Software Engineering"], preferredTopicIds: [],
      publications: [{ id: "pc1", paperId: "pc1", title: "Automated Vulnerability Detection in Web Systems", abstractText: "Empirical software engineering evaluation of security architecture and static analysis.", year: 2025, source: "openalex", embedding: [0.2, 0.2, 0.2, 0.96, 0.0, 0.0], attributionStatus: "LINKED_IDENTITY" }],
    },
  },
  {
    profileVec: [0.1, 0.05, 0.55, 0.05, 0.95, 0.1],
    profile: {
      lecturerId: "D", publicId: "D", fullName: "Lecturer D (Education/Qual)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 0, maxActiveProjects: 4,
      expertiseAreas: ["Education", "Educational Technology", "Human-Computer Interaction"],
      researchSpecializations: ["Qualitative Research"], skills: ["Qualitative Analysis"], researchMethods: ["Qualitative Research", "Survey Design", "User Study"], researchKeywords: ["Education", "Qualitative Research"], researchInterests: ["Educational Technology"],
      supportTypes: ["RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN", "ACADEMIC_WRITING"], preferredTopics: ["Education"], preferredTopicIds: [],
      publications: [{ id: "pd1", paperId: "pd1", title: "Qualitative Study of Student Learning Analytics", abstractText: "Survey design and qualitative coding for educational technology platforms.", year: 2024, source: "openalex", embedding: [0.1, 0.05, 0.5, 0.05, 0.96, 0.05], attributionStatus: "LINKED_IDENTITY" }],
    },
  },
  {
    profileVec: [0.75, 0.7, 0.45, 0.55, 0.1, 0.05],
    profile: {
      lecturerId: "E", publicId: "E", fullName: "Lecturer E (No Pubs Declared)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 0, maxActiveProjects: 5,
      expertiseAreas: ["Natural Language Processing", "Information Retrieval", "Software Engineering"],
      researchSpecializations: ["LLM Applications"], skills: ["Python", "PyTorch"], researchMethods: ["Experimental Design"], researchKeywords: ["Large Language Models", "Research Gap"], researchInterests: ["NLP"],
      supportTypes: ["RESEARCH_DIRECTION", "SOFTWARE_TECHNICAL_GUIDANCE", "RESEARCH_GAP_VALIDATION"], preferredTopics: ["NLP"], preferredTopicIds: [],
      publications: [],
    },
  },
  {
    profileVec: [0.02, 0.02, 0.1, 0.02, 0.05, 0.95],
    profile: {
      lecturerId: "F", publicId: "F", fullName: "Lecturer F (High Pubs Bio/Health)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 1, maxActiveProjects: 4,
      expertiseAreas: ["AI in Healthcare", "Medical Education", "Clinical Evaluation"],
      researchSpecializations: ["Biomedical Informatics"], skills: ["R", "Statistical Analysis"], researchMethods: ["Systematic Review"], researchKeywords: ["Healthcare", "Medical"], researchInterests: ["Medical Education"],
      supportTypes: ["DATA_ANALYSIS", "LITERATURE_REVIEW"], preferredTopics: ["AI in Healthcare"], preferredTopicIds: [],
      publications: Array.from({ length: 10 }, (_, idx) => ({
        id: `pf${idx}`, paperId: `pf${idx}`, title: `Clinical Healthcare Diagnostic Evaluation ${idx + 1}`,
        abstractText: "Medical education and clinical healthcare evidence assessment.", year: 2024, source: "openalex",
        embedding: [0.05, 0.05, 0.15, 0.02, 0.1, 0.96], attributionStatus: "LINKED_IDENTITY" as const,
      })),
    },
  },
  {
    profileVec: [0.95, 0.9, 0.4, 0.4, 0.05, 0.05],
    profile: {
      lecturerId: "G", publicId: "G", fullName: "Lecturer G (Capacity Full)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 2, maxActiveProjects: 2,
      expertiseAreas: ["Natural Language Processing", "Large Language Models", "Information Retrieval"],
      researchSpecializations: [], skills: ["Python"], researchMethods: ["Experimental Design"], researchKeywords: ["LLM"], researchInterests: ["NLP"],
      supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE"], preferredTopics: [], preferredTopicIds: [], publications: [],
    },
  },
  {
    profileVec: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
    profile: {
      lecturerId: "I", publicId: "I", fullName: "Lecturer I (Sparse Profile)", verifiedLecturer: true, profileVisible: true, acceptingNew: true, allowCollaborationRequests: true, activeProjectCount: 0, maxActiveProjects: null,
      expertiseAreas: [], researchSpecializations: [], skills: [], researchMethods: [], researchKeywords: [], researchInterests: [],
      supportTypes: [], preferredTopics: [], preferredTopicIds: [], publications: [],
    },
  },
];

function mkNeed(id: string, title: string, category: ResearchSupportNeed["category"], terms: string[], supportType?: ResearchSupportNeed["supportType"]): ResearchSupportNeed {
  return { id, title, description: title, category, priority: "ESSENTIAL", taxonomyNodeIds: [], relatedTerms: terms, supportType, rationale: "Fixture need", source: "GROUP_DECLARED", status: "CONFIRMED" };
}

const BASE_SCENARIOS: EvalScenario[] = [
  {
    id: "s1", name: "LLM + IR Research Gap System",
    queryVec: [0.9, 0.85, 0.7, 0.4, 0.05, 0.05],
    project: {
      projectId: "s1", publicProjectId: "s1", stage: "DISCOVERY", wantedTerms: ["Large Language Models", "Information Retrieval", "Research Gap"], wantedMethods: ["Systematic Review"], wantedSupportTypes: ["RESEARCH_GAP_VALIDATION", "SOFTWARE_TECHNICAL_GUIDANCE"], hasSufficientContext: true,
      needs: [mkNeed("n1", "NLP & LLM", "DOMAIN_EXPERTISE", ["Natural Language Processing", "Large Language Models"], "SOFTWARE_TECHNICAL_GUIDANCE"), mkNeed("n2", "Information Retrieval", "DOMAIN_EXPERTISE", ["Information Retrieval", "Semantic Search"], "RESEARCH_METHODOLOGY"), mkNeed("n3", "Research Gap Methodology", "RESEARCH_METHOD", ["Research Gap", "Literature Review", "Systematic Review"], "RESEARCH_GAP_VALIDATION")],
    },
    fixtureGrades: { A: 3, E: 3, B: 2, C: 1, D: 0, F: 0, G: 0, I: 0 },
  },
  {
    id: "s2", name: "Early-Stage Methodology & Literature Review",
    queryVec: [0.1, 0.15, 0.95, 0.05, 0.3, 0.1],
    project: {
      projectId: "s2", publicProjectId: "s2", stage: "PLANNING", wantedTerms: ["Research Methodology", "Literature Review", "Research Gap"], wantedMethods: ["Systematic Review"], wantedSupportTypes: ["RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION"], hasSufficientContext: true,
      needs: [mkNeed("n1", "Literature Review", "RESEARCH_METHOD", ["Literature Review", "Systematic Review"], "LITERATURE_REVIEW"), mkNeed("n2", "Research Question Formulation", "RESEARCH_METHOD", ["Research Methodology", "Research Methods"], "RESEARCH_DIRECTION")],
    },
    fixtureGrades: { B: 3, E: 2, D: 1, F: 1, A: 0, C: 0, G: 0, I: 0 },
  },
  {
    id: "s3", name: "Software Vulnerability Detection",
    queryVec: [0.2, 0.15, 0.2, 0.95, 0.05, 0.05],
    project: {
      projectId: "s3", publicProjectId: "s3", stage: "ACTIVE", wantedTerms: ["Software Engineering", "Cybersecurity", "Vulnerability Detection"], wantedMethods: ["Experimental Design"], wantedSupportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "EXPERIMENT_DESIGN"], hasSufficientContext: true,
      needs: [mkNeed("n1", "Software Security", "DOMAIN_EXPERTISE", ["Software Engineering", "Cybersecurity", "Vulnerability Detection"], "SOFTWARE_TECHNICAL_GUIDANCE"), mkNeed("n2", "Empirical Evaluation", "EVALUATION", ["Experimental Design", "Case Study"], "EXPERIMENT_DESIGN")],
    },
    fixtureGrades: { C: 3, E: 2, A: 1, B: 0, D: 0, F: 0, G: 0, I: 0 },
  },
  {
    id: "s4", name: "Educational Technology Qualitative Study",
    queryVec: [0.1, 0.05, 0.5, 0.05, 0.95, 0.05],
    project: {
      projectId: "s4", publicProjectId: "s4", stage: "PLANNING", wantedTerms: ["Education", "Educational Technology", "Qualitative Research"], wantedMethods: ["Qualitative Research", "Survey Design"], wantedSupportTypes: ["RESEARCH_METHODOLOGY", "ACADEMIC_WRITING"], hasSufficientContext: true,
      needs: [mkNeed("n1", "Education Domain", "DOMAIN_EXPERTISE", ["Education", "Educational Technology"], "RESEARCH_METHODOLOGY"), mkNeed("n2", "Qualitative & Survey Design", "RESEARCH_METHOD", ["Qualitative Research", "Survey Design"], "RESEARCH_METHODOLOGY")],
    },
    fixtureGrades: { D: 3, B: 2, A: 0, C: 0, E: 0, F: 0, G: 0, I: 0 },
  },
  {
    id: "s5", name: "Medical Education & AI in Healthcare",
    queryVec: [0.25, 0.1, 0.4, 0.05, 0.2, 0.95],
    project: {
      projectId: "s5", publicProjectId: "s5", stage: "ACTIVE", wantedTerms: ["AI in Healthcare", "Medical Education", "Systematic Review"], wantedMethods: ["Systematic Review"], wantedSupportTypes: ["DATA_ANALYSIS", "LITERATURE_REVIEW"], hasSufficientContext: true,
      needs: [mkNeed("n1", "Healthcare AI", "DOMAIN_EXPERTISE", ["AI in Healthcare", "Medical Education", "Clinical Evaluation"], "DATA_ANALYSIS"), mkNeed("n2", "Systematic Evidence Review", "RESEARCH_METHOD", ["Systematic Review", "Literature Review"], "LITERATURE_REVIEW")],
    },
    fixtureGrades: { F: 3, B: 2, D: 1, A: 0, C: 0, E: 0, G: 0, I: 0 },
  },
  {
    id: "s6", name: "No-Match Quantum Metallurgy (Abstention Case)",
    queryVec: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    project: {
      projectId: "s6", publicProjectId: "s6", stage: "PLANNING", wantedTerms: ["Quantum Metallurgy", "Superconducting Alloys"], wantedMethods: ["X-Ray Diffraction"], wantedSupportTypes: [], hasSufficientContext: true,
      needs: [mkNeed("n1", "Quantum Metallurgy", "DOMAIN_EXPERTISE", ["Quantum Metallurgy", "Superconducting Alloys"])],
    },
    fixtureGrades: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, I: 0 },
    expectAbstention: true,
  },
];

// Expand to 24 controlled scenarios by varying project stages and need subsets (no tuning on test set)
const SCENARIOS: EvalScenario[] = [
  ...BASE_SCENARIOS,
  ...BASE_SCENARIOS.map(s => ({ ...s, id: `${s.id}-early`, name: `${s.name} (Early Stage)`, project: { ...s.project, projectId: `${s.id}-early`, publicProjectId: `${s.id}-early`, stage: "PLANNING", wantedMethods: [] } })),
  ...BASE_SCENARIOS.map(s => ({ ...s, id: `${s.id}-active`, name: `${s.name} (Active Stage)`, project: { ...s.project, projectId: `${s.id}-active`, publicProjectId: `${s.id}-active`, stage: "ACTIVE" } })),
  ...BASE_SCENARIOS.map(s => ({ ...s, id: `${s.id}-writing`, name: `${s.name} (Writing Stage)`, project: { ...s.project, projectId: `${s.id}-writing`, publicProjectId: `${s.id}-writing`, stage: "WRITING" } })),
];

function keywordBaselineScore(project: ProjectRecommendationInput, cand: RecommendationCandidateProfile): number {
  const wanted = new Set(project.wantedTerms.map(normalizeResearchTerm));
  const pool = [...cand.expertiseAreas, ...cand.researchKeywords, ...cand.researchInterests, ...cand.skills].map(normalizeResearchTerm);
  if (!wanted.size) return 0;
  let hits = 0;
  for (const w of wanted) if (pool.includes(w)) hits++;
  return hits / wanted.size;
}

function dcg(grades: number[], k: number): number {
  return grades.slice(0, k).reduce((sum, g, idx) => sum + (Math.pow(2, g) - 1) / Math.log2(idx + 2), 0);
}

function evaluateMethod(
  name: string,
  rankFn: (scenario: EvalScenario) => Array<{ id: string; eligible: boolean; recommended: boolean }>,
) {
  let p1Sum = 0, p3Sum = 0, r3Sum = 0, ndcg3Sum = 0, mrrSum = 0;
  let nonAbstentionCount = 0;
  let abstentionCases = 0, abstainedCorrectly = 0;
  let eligibleRecCount = 0, totalRecCount = 0;

  for (const sc of SCENARIOS) {
    const ranked = rankFn(sc);
    const recommendedOnly = ranked.filter(r => r.recommended);
    for (const r of recommendedOnly) {
      totalRecCount++;
      if (r.eligible) eligibleRecCount++;
    }

    if (sc.expectAbstention) {
      abstentionCases++;
      if (recommendedOnly.length === 0) abstainedCorrectly++;
      continue;
    }

    nonAbstentionCount++;
    const eligibleRanked = ranked.filter(r => r.eligible);
    const grades = eligibleRanked.map(r => sc.fixtureGrades[r.id] ?? 0);
    const ideal = Object.entries(sc.fixtureGrades)
      .filter(([id]) => {
        const c = CANDIDATES.find(x => x.profile.lecturerId === id);
        return c ? evaluateLecturerEligibility(c.profile).canInvite : false;
      })
      .map(([, g]) => g)
      .sort((a, b) => b - a);

    const totalRelevant = ideal.filter(g => g >= 2).length;
    const relTop1 = (grades[0] ?? 0) >= 2 ? 1 : 0;
    const relTop3 = grades.slice(0, 3).filter(g => g >= 2).length;

    p1Sum += relTop1;
    p3Sum += relTop3 / 3;
    r3Sum += totalRelevant > 0 ? relTop3 / totalRelevant : 0;
    const idcg3 = dcg(ideal, 3);
    ndcg3Sum += idcg3 > 0 ? dcg(grades, 3) / idcg3 : 0;
    const firstRelIdx = grades.findIndex(g => g >= 2);
    mrrSum += firstRelIdx >= 0 ? 1 / (firstRelIdx + 1) : 0;
  }

  const fmt = (n: number) => Number(n.toFixed(4));
  return {
    method: name,
    scenariosTotal: SCENARIOS.length,
    scoredScenarios: nonAbstentionCount,
    precisionAt1: fmt(p1Sum / nonAbstentionCount),
    precisionAt3: fmt(p3Sum / nonAbstentionCount),
    recallAt3: fmt(r3Sum / nonAbstentionCount),
    ndcgAt3: fmt(ndcg3Sum / nonAbstentionCount),
    mrr: fmt(mrrSum / nonAbstentionCount),
    eligibleRecommendationRate: totalRecCount > 0 ? fmt(eligibleRecCount / totalRecCount) : 1,
    abstentionCorrectRate: abstentionCases > 0 ? fmt(abstainedCorrectly / abstentionCases) : 1,
  };
}

const baselineKeyword = evaluateMethod("Baseline 1 — Exact Keyword Overlap", sc =>
  CANDIDATES.map(c => {
    const elig = evaluateLecturerEligibility(c.profile);
    const score = keywordBaselineScore(sc.project, c.profile);
    return { id: c.profile.lecturerId, eligible: elig.canInvite, score, recommended: elig.canInvite && score > 0 };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id)),
);

const baselineSemantic = evaluateMethod("Baseline 2 — Synthetic Vector Cosine", sc =>
  CANDIDATES.map(c => {
    const elig = evaluateLecturerEligibility(c.profile);
    const sim = cosineSimilarity(sc.queryVec, c.profileVec) ?? 0;
    return { id: c.profile.lecturerId, eligible: elig.canInvite, score: sim, recommended: elig.canInvite && sim >= 0.45 };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id)),
);

const proposedHybrid = evaluateMethod("Proposed — Hybrid Need-Level Recommendation (mentor-hybrid-v1.0-experimental)", sc =>
  CANDIDATES.map(c => {
    const res = evaluateCandidateRecommendation(sc.project, c.profile, {
      projectQueryEmbedding: sc.queryVec.some(v => v > 0) ? sc.queryVec : null,
    });
    return {
      id: c.profile.lecturerId,
      eligible: res.recommendation.eligibility.canInvite,
      score: res.internalScore,
      recommended: res.recommendation.tier === "RECOMMENDED",
    };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id)),
);

console.log(JSON.stringify({
  disclaimer: "Controlled synthetic fixture benchmark (n=24 scenarios, 8 synthetic lecturer personas). NOT human expert validation.",
  results: [baselineKeyword, baselineSemantic, proposedHybrid],
}, null, 2));
