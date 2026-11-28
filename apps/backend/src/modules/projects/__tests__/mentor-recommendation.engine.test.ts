import { describe, expect, it } from "vitest";
import type { Project, ResearchPlan } from "../../../generated/prisma/client.js";
import type { ResearchSupportNeed } from "@trend/shared-types";
import {
  analyzeResearchNeedsDeterministic,
  buildAuthorizedNeedsContext,
} from "../research-needs-analysis.service.js";
import {
  evaluateCandidateRecommendation,
  evaluateLecturerEligibility,
  validateMentorAiExplanation,
  type ProjectRecommendationInput,
  type RecommendationCandidateProfile,
} from "../mentor-recommendation.engine.js";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    legacyMongoId: "6ab33f1537802fe30d38753b",
    title: "LumiGap 2",
    description: "Research methods that help students identify, distinguish and discover research gaps using Large Language Models and Information Retrieval.",
    researchField: "Software Engineering",
    researchAreas: ["Software Engineering", "Natural Language Processing"],
    researchKeywords: ["Research Gap", "Large Language Models", "Literature Review", "Information Retrieval"],
    researchClassification: {},
    publicSummary: null,
    createdById: null,
    creationKey: null,
    creationRequestHash: null,
    version: 1,
    researchStage: "DISCOVERY",
    taskBoardVersion: 1,
    screeningMode: "EXPLORATORY",
    screeningBlinded: false,
    inclusionCriteria: [],
    exclusionCriteria: [],
    status: "PLANNING",
    visibility: "PRIVATE",
    exportPolicy: "ALL_MEMBERS",
    aiDataPolicy: "ALLOW_PERSONAL_AI",
    externalLookupPolicy: "ALLOW_PUBLIC_INDEX",
    mentorshipDiscovery: "CLOSED",
    mentorshipSummary: null,
    mentorshipClassification: {},
    mentorshipExpertise: [],
    mentorshipResearchAreas: [],
    mentorshipNeeds: "",
    mentorshipSupportTypes: [],
    mentorshipMethodologies: [],
    mentorshipProfile: {},
    ownerId: "22222222-2222-4222-8222-222222222222",
    archivedAt: null,
    deletedAt: null,
    deletedById: null,
    purgeAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<RecommendationCandidateProfile> = {}): RecommendationCandidateProfile {
  return {
    lecturerId: "33333333-3333-4333-8333-333333333333",
    publicId: "33333333-3333-4333-8333-333333333333",
    fullName: "TS. Synthetic Lecturer",
    institutionName: "LumiGap Tech University (Demo)",
    positionTitle: "Lecturer",
    verifiedLecturer: true,
    profileVisible: true,
    acceptingNew: true,
    allowCollaborationRequests: true,
    activeProjectCount: 1,
    maxActiveProjects: 4,
    expertiseAreas: [],
    researchSpecializations: [],
    skills: [],
    researchMethods: [],
    researchKeywords: [],
    researchInterests: [],
    supportTypes: [],
    preferredTopics: [],
    preferredTopicIds: [],
    publications: [],
    ...overrides,
  };
}

const SAMPLE_NEEDS: ResearchSupportNeed[] = [
  {
    id: "need-llm",
    title: "Natural Language Processing & Large Language Models",
    description: "Scientific text processing with LLMs",
    category: "DOMAIN_EXPERTISE",
    priority: "ESSENTIAL",
    taxonomyNodeIds: ["topic-nlp"],
    supportType: "SOFTWARE_TECHNICAL_GUIDANCE",
    relatedTerms: ["Large Language Models", "Natural Language Processing", "LLM Evaluation"],
    rationale: "Project uses LLMs for scientific papers.",
    source: "GROUP_DECLARED",
    status: "CONFIRMED",
  },
  {
    id: "need-ir",
    title: "Information Retrieval & Semantic Search",
    description: "Retrieving and ranking relevant papers",
    category: "DOMAIN_EXPERTISE",
    priority: "IMPORTANT",
    taxonomyNodeIds: ["topic-ir"],
    supportType: "RESEARCH_METHODOLOGY",
    relatedTerms: ["Information Retrieval", "Semantic Search", "Ranking"],
    rationale: "Project retrieves supporting academic evidence.",
    source: "GROUP_DECLARED",
    status: "CONFIRMED",
  },
  {
    id: "need-gap",
    title: "Research Gap & Literature Review Methodology",
    description: "Distinguishing a valid research gap from single-paper limitations",
    category: "RESEARCH_METHOD",
    priority: "ESSENTIAL",
    taxonomyNodeIds: [],
    supportType: "RESEARCH_GAP_VALIDATION",
    relatedTerms: ["Research Gap", "Literature Review", "Systematic Review", "Research Methods"],
    rationale: "Early-stage team needs gap validation methodology.",
    source: "GROUP_DECLARED",
    status: "CONFIRMED",
  },
];

const SAMPLE_PROJECT_INPUT: ProjectRecommendationInput = {
  projectId: "11111111-1111-4111-8111-111111111111",
  publicProjectId: "6ab33f1537802fe30d38753b",
  stage: "DISCOVERY",
  wantedTerms: ["Large Language Models", "Information Retrieval", "Research Gap", "Software Engineering"],
  wantedMethods: ["Systematic Review"],
  wantedSupportTypes: ["RESEARCH_GAP_VALIDATION", "SOFTWARE_TECHNICAL_GUIDANCE"],
  needs: SAMPLE_NEEDS,
  hasSufficientContext: true,
  locale: "vi",
};

describe("Research Needs Analysis (deterministic & early-stage support)", () => {
  it("extracts structured suggested needs from early-stage project context without mutating ResearchPlan", () => {
    const project = makeProject();
    const ctx = buildAuthorizedNeedsContext(project, null, "vi");
    const needs = analyzeResearchNeedsDeterministic(ctx, {
      challenges: ["RESEARCH_GAP", "RESULT_EVALUATION"],
      locale: "vi",
    });

    expect(needs.length).toBeGreaterThanOrEqual(4);
    expect(needs.some(n => n.id === "need-nlp-llm")).toBe(true);
    expect(needs.some(n => n.id === "need-information-retrieval")).toBe(true);
    expect(needs.some(n => n.id === "challenge-research_gap")).toBe(true);
    expect(needs.every(n => n.status === "SUGGESTED" || n.status === "CONFIRMED")).toBe(true);
  });

  it("handles sparse early-stage projects gracefully and produces missing context hints", () => {
    const sparse = makeProject({
      title: "Test",
      description: null,
      researchField: null,
      researchAreas: [],
      researchKeywords: [],
    });
    const ctx = buildAuthorizedNeedsContext(sparse, null, "vi");
    expect(ctx.contextSummary.completeness).toBe("SPARSE");
    expect(ctx.missingContextHints.length).toBeGreaterThan(0);

    const needs = analyzeResearchNeedsDeterministic(ctx, { locale: "vi" });
    expect(needs.some(n => n.id === "need-early-stage-methodology")).toBe(true);
  });

  it("reads authorized ResearchPlan context without requiring all fields", () => {
    const project = makeProject({ description: null, researchKeywords: [] });
    const plan = {
      approach: "LITERATURE_REVIEW",
      problem: "Systematic review of educational technology interventions",
      objectives: ["Synthesize survey studies"],
      questions: ["What qualitative methods are used?"],
      scope: "",
      methodology: "Qualitative synthesis",
      searchStrategy: "Education, Qualitative Research",
    } as Pick<ResearchPlan, "approach" | "problem" | "objectives" | "questions" | "scope" | "methodology" | "searchStrategy">;

    const ctx = buildAuthorizedNeedsContext(project, plan, "en");
    expect(ctx.contextSummary.hasResearchPlan).toBe(true);
    expect(ctx.contextSummary.hasMethodology).toBe(true);
    const needs = analyzeResearchNeedsDeterministic(ctx, { locale: "en" });
    expect(needs.some(n => n.id === "need-education-qualitative")).toBe(true);
  });
});

describe("Hybrid Mentor Recommendation Engine", () => {
  it("ranks relevant NLP/IR lecturer above high-publication unrelated lecturer (publication count never dominates)", () => {
    const lecturerA = makeCandidate({
      lecturerId: "a",
      publicId: "a",
      fullName: "Lecturer A (NLP/IR)",
      expertiseAreas: ["Natural Language Processing", "Information Retrieval", "Large Language Models"],
      supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "EXPERIMENT_DESIGN"],
      publications: [
        {
          id: "pub-1",
          paperId: "pub-1",
          title: "Semantic Search with Large Language Models for Scientific Papers",
          abstractText: "We investigate Information Retrieval and Large Language Models to improve academic evidence ranking.",
          year: 2025,
          source: "openalex",
          attributionStatus: "LINKED_IDENTITY",
        },
      ],
    });

    const lecturerF = makeCandidate({
      lecturerId: "f",
      publicId: "f",
      fullName: "Lecturer F (Many Unrelated Papers)",
      expertiseAreas: ["Marine Biology", "Oceanography"],
      supportTypes: ["ACADEMIC_WRITING"],
      publications: Array.from({ length: 15 }, (_, idx) => ({
        id: `bio-${idx}`,
        paperId: `bio-${idx}`,
        title: `Coral Reef Ecosystems Study #${idx + 1}`,
        abstractText: "Marine biodiversity observations in tropical reefs.",
        year: 2024,
        source: "openalex",
        attributionStatus: "LINKED_IDENTITY" as const,
      })),
    });

    const resA = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerA);
    const resF = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerF);

    expect(resA.recommendation.tier).toBe("RECOMMENDED");
    expect(resA.internalScore).toBeGreaterThan(resF.internalScore);
    expect(resF.recommendation.abstained).toBe(true);
    expect(resF.recommendation.tier).toBe("INSUFFICIENT_INFO");
    expect(resA.publicationEvidence[0]?.evidenceScope).toBe("ABSTRACT");
    expect(resA.publicationEvidence[0]?.evidenceExcerpt).toContain("Information Retrieval");
  });

  it("allows lecturers without synchronized publications to be recommended via declared expertise & support", () => {
    const lecturerE = makeCandidate({
      lecturerId: "e",
      publicId: "e",
      fullName: "Lecturer E (No Publications)",
      expertiseAreas: ["Research Methods", "Literature Review", "Natural Language Processing"],
      researchMethods: ["Systematic Review", "Research Methods"],
      supportTypes: ["RESEARCH_GAP_VALIDATION", "LITERATURE_REVIEW", "RESEARCH_METHODOLOGY"],
      publications: [],
    });

    const resE = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerE);
    expect(resE.recommendation.tier).toBe("RECOMMENDED");
    expect(resE.recommendation.uncertainties.some(u => u.code === "NO_LINKED_PUBLICATIONS")).toBe(true);
    expect(resE.recommendation.evidenceCoverage.missingSignals.length).toBeGreaterThan(0);
  });

  it("separates eligibility & capacity from academic relevance (capacity-reached cannot be directly invited)", () => {
    const lecturerG = makeCandidate({
      lecturerId: "g",
      publicId: "g",
      fullName: "Lecturer G (Capacity Full)",
      activeProjectCount: 3,
      maxActiveProjects: 3,
      expertiseAreas: ["Natural Language Processing", "Information Retrieval", "Large Language Models"],
      supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE", "RESEARCH_GAP_VALIDATION"],
    });

    const elig = evaluateLecturerEligibility(lecturerG);
    expect(elig.canInvite).toBe(false);
    expect(elig.currentAvailability).toBe("CAPACITY_REACHED");
    expect(elig.remainingSlots).toBe(0);

    const resG = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerG);
    expect(resG.recommendation.eligibility.canInvite).toBe(false);
    expect(resG.recommendation.tier).not.toBe("RECOMMENDED");
    expect(resG.recommendation.uncertainties.some(u => u.code === "CAPACITY_REACHED")).toBe(true);
  });

  it("distinguishes title-only vs abstract vs uncertain authorship provenance accurately", () => {
    const lecturerJ = makeCandidate({
      lecturerId: "j",
      publicId: "j",
      fullName: "Lecturer J (Uncertain Attribution)",
      expertiseAreas: ["Software Engineering"],
      publications: [
        {
          id: "pub-title-only",
          title: "Information Retrieval Benchmarks for Students",
          abstractText: null,
          year: 2023,
          source: "MANUAL",
          attributionStatus: "UNCERTAIN_ATTRIBUTION",
        },
      ],
    });

    const resJ = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerJ);
    expect(resJ.publicationEvidence[0]?.evidenceScope).toBe("TITLE");
    expect(resJ.publicationEvidence[0]?.evidenceExcerpt).toBeUndefined();
    expect(resJ.publicationEvidence[0]?.attributionStatus).toBe("UNCERTAIN_ATTRIBUTION");
    expect(resJ.recommendation.uncertainties.some(u => u.code === "UNCERTAIN_AUTHORSHIP")).toBe(true);
  });

  it("keeps broad parent-category taxonomy match strictly weaker than specific topic match", () => {
    const projectWithTax: ProjectRecommendationInput = {
      ...SAMPLE_PROJECT_INPUT,
      classification: {
        nodeIds: ["field-cs", "topic-nlp"],
        keywordIds: [],
        skillIds: [],
        vocabularyVersion: "v1",
        nodes: [
          { id: "field-cs", level: "field", name: "Computer Science", parentId: null, externalId: null, source: "LOCAL", aliases: [], syncedAt: null, sourceVersion: null, labelVi: "Khoa học máy tính" },
          { id: "topic-nlp", level: "topic", name: "Natural Language Processing", parentId: "field-cs", externalId: null, source: "LOCAL", aliases: [], syncedAt: null, sourceVersion: null, labelVi: "Xử lý ngôn ngữ tự nhiên" },
        ],
        keywords: [],
      },
    };

    const broadOnly = makeCandidate({
      lecturerId: "broad",
      publicId: "broad",
      classification: {
        nodeIds: ["field-cs"],
        keywordIds: [],
        skillIds: [],
        vocabularyVersion: "v1",
        nodes: [
          { id: "field-cs", level: "field", name: "Computer Science", parentId: null, externalId: null, source: "LOCAL", aliases: [], syncedAt: null, sourceVersion: null, labelVi: "Khoa học máy tính" },
        ],
        keywords: [],
      },
    });
    const specific = makeCandidate({
      lecturerId: "spec",
      publicId: "spec",
      classification: projectWithTax.classification,
      expertiseAreas: ["Natural Language Processing"],
    });

    const resBroad = evaluateCandidateRecommendation(projectWithTax, broadOnly);
    const resSpec = evaluateCandidateRecommendation(projectWithTax, specific);
    expect(resSpec.dimensionScores.topicTaxonomy).toBeGreaterThan(resBroad.dimensionScores.topicTaxonomy);
    expect(resBroad.recommendation.uncertainties.some(u => u.code === "BROAD_TAXONOMY_ONLY")).toBe(true);
  });

  it("supports semantic cosine similarity when compatible embeddings are supplied and labels retrievalMode honestly", () => {
    const lecturerSem = makeCandidate({
      lecturerId: "sem",
      publicId: "sem",
      publications: [
        {
          id: "pub-sem",
          paperId: "pub-sem",
          title: "Neural Scholarly Document Matching",
          abstractText: "Vector representation for academic corpora.",
          year: 2025,
          source: "openalex",
          embedding: [0.9, 0.1, 0.0, 0.2],
          attributionStatus: "LINKED_IDENTITY",
        },
      ],
    });

    const withoutEmb = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerSem);
    const withEmb = evaluateCandidateRecommendation(SAMPLE_PROJECT_INPUT, lecturerSem, {
      projectQueryEmbedding: [0.88, 0.12, 0.01, 0.19],
    });

    expect(withoutEmb.recommendation.retrievalMode).toBe("HYBRID_TAXONOMY_LEXICAL");
    expect(withEmb.recommendation.retrievalMode).toBe("HYBRID_SEMANTIC");
    expect(withEmb.dimensionScores.semantic).toBeGreaterThan(0.95);
    expect(withEmb.publicationEvidence.length).toBe(1);
  });

  it("surfaces optional complementary mentor note when active mentor already covers other needs", () => {
    const methodLecturer = makeCandidate({
      lecturerId: "b",
      publicId: "b",
      fullName: "Lecturer B (Methodology)",
      expertiseAreas: ["Research Methods", "Literature Review"],
      researchMethods: ["Systematic Review"],
      supportTypes: ["RESEARCH_GAP_VALIDATION", "LITERATURE_REVIEW"],
    });
    const res = evaluateCandidateRecommendation(
      { ...SAMPLE_PROJECT_INPUT, coveredNeedIdsByActiveMentors: ["need-llm", "need-ir"] },
      methodLecturer,
    );
    expect(res.recommendation.complementaryNote).toContain("Research Gap");
  });

  it("rejects AI explanations with fabricated evidence IDs, percentages, or superlative quality claims", () => {
    const scored = evaluateCandidateRecommendation(
      SAMPLE_PROJECT_INPUT,
      makeCandidate({
        expertiseAreas: ["Natural Language Processing"],
        supportTypes: ["SOFTWARE_TECHNICAL_GUIDANCE"],
      }),
    );

    const fabricatedEvidence = validateMentorAiExplanation(
      {
        summary: "Nên ưu tiên tìm hiểu giảng viên này cho phần NLP.",
        needNotes: [{ needId: "need-llm", note: "Có căn cứ.", evidenceIds: ["ev-fabricated-999"] }],
        discussionQuestions: ["Thầy/cô có thể hỗ trợ phần LLM không?"],
        uncertainties: [],
      },
      scored,
    );
    expect(fabricatedEvidence).toBeNull();

    const percentageClaim = validateMentorAiExplanation(
      {
        summary: "Giảng viên đạt độ phù hợp 95% với dự án của nhóm.",
        needNotes: [],
        discussionQuestions: ["Lịch trao đổi thế nào?"],
        uncertainties: [],
      },
      scored,
    );
    expect(percentageClaim).toBeNull();

    const superlativeClaim = validateMentorAiExplanation(
      {
        summary: "Đây là giảng viên phù hợp nhất cho dự án.",
        needNotes: [],
        discussionQuestions: ["Lịch trao đổi thế nào?"],
        uncertainties: [],
      },
      scored,
    );
    expect(superlativeClaim).toBeNull();

    const validEvidenceId = scored.evidenceItems[0]?.id;
    expect(validEvidenceId).toBeTruthy();
    const valid = validateMentorAiExplanation(
      {
        summary: "Nên ưu tiên tìm hiểu giảng viên này nếu nhóm cần hỗ trợ về NLP theo thông tin khai báo.",
        needNotes: [{ needId: "need-llm", note: "Hồ sơ có chuyên môn khai báo về NLP.", evidenceIds: [validEvidenceId!] }],
        discussionQuestions: ["Thầy/cô có thể trao đổi thêm về phương pháp xác định Research Gap không?"],
        uncertainties: ["Chưa có hồ sơ công bố đồng bộ."],
      },
      scored,
    );
    expect(valid?.validated).toBe(true);
    expect(valid?.source).toBe("AI_VALIDATED");
  });
});
