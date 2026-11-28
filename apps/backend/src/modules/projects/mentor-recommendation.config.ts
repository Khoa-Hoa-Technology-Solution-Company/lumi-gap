/**
 * Versioned, configurable experimental ranking parameters for Academic Mentor Recommendation.
 *
 * IMPORTANT: These weights are experimental starting parameters for transparent,
 * reproducible decision support — NOT validated academic standards.
 * Missing signals are tracked separately as uncertainty, never coerced into zero competence.
 */

export const MENTOR_RECOMMENDATION_VERSION = "mentor-rec-v2.0";
export const MENTOR_RANKING_CONFIG_VERSION = "mentor-hybrid-v1.0-experimental";
export const MENTOR_NEEDS_ANALYSIS_VERSION = "mentor-needs-v1.0";
export const MENTOR_AI_EXPLANATION_PROMPT_VERSION = "mentor-explain-v1.0";

export interface MentorRankingWeights {
  topicTaxonomy: number;
  publicationEvidence: number;
  declaredSupport: number;
  methodology: number;
  researchStage: number;
}

export interface MentorRankingConfig {
  version: string;
  weights: MentorRankingWeights;
  /** Weight of semantic cosine similarity inside topic/publication relevance when compatible embeddings exist. */
  semanticBlendWeight: number;
  /** Cap on per-need publication contribution so paper count never dominates ranking. */
  maxEffectiveRelevantPapers: number;
  /** Broad parent-only taxonomy match receives strictly lower weight than specific topic/subfield match. */
  taxonomyLevelMultipliers: {
    topic: number;
    subfield: number;
    field: number;
    domain: number;
  };
  /** Minimum relevance score required to place an eligible lecturer in RECOMMENDED tier (otherwise EXPLORE / abstention). */
  recommendedThreshold: number;
  /** Minimum relevance score below which the engine abstains from prioritizing a candidate. */
  abstentionThreshold: number;
  /** Maximum recommended lecturers highlighted at the top before ordinary discovery. */
  maxHighlightedRecommended: number;
}

export const DEFAULT_MENTOR_RANKING_CONFIG: MentorRankingConfig = {
  version: MENTOR_RANKING_CONFIG_VERSION,
  weights: {
    topicTaxonomy: 0.30,
    publicationEvidence: 0.25,
    declaredSupport: 0.20,
    methodology: 0.15,
    researchStage: 0.10,
  },
  semanticBlendWeight: 0.35,
  maxEffectiveRelevantPapers: 3,
  taxonomyLevelMultipliers: {
    topic: 1.0,
    subfield: 0.72,
    field: 0.42,
    domain: 0.18,
  },
  recommendedThreshold: 0.32,
  abstentionThreshold: 0.12,
  maxHighlightedRecommended: 5,
};

/**
 * Phrases prohibited in AI-generated recommendation explanations because they make
 * unsupported personal judgments, uncalibrated certainty claims, or quality rankings.
 */
export const PROHIBITED_EXPLANATION_PATTERNS: readonly RegExp[] = [
  /\b\d{1,3}\s*%/,
  /giảng viên (?:phù hợp|xuất sắc|giỏi|tốt) nhất/i,
  /\bbest (?:mentor|supervisor|lecturer|match)\b/i,
  /\bguaranteed (?:fit|suitability|success)\b/i,
  /\bchắc chắn (?:phù hợp|thành công|có thể hỗ trợ)\b/i,
  /\bnăng lực (?:cao|thấp|kém)\b/i,
  /\bchuyên môn không đủ\b/i,
  /\bchất lượng hướng dẫn đã được xác minh\b/i,
  /\bindependently verified (?:expertise|quality|mentoring)\b/i,
  /\b(?:h-index|impact factor|citation count)\b/i,
];
