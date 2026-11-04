/** Every tunable of the "For you" feature lives here, not in env vars. See .herdr/specs/personalized-for-you.md. */
export const PERSONALIZATION = {
  RECENT_BONUS_DAYS: 30,
  LOW_ACTIVITY_POSTS: 10,
  MIN_POSTS_ACTIVE: 3,
  MIN_STRONG_SIGNAL: 2,
  PROFILE_TOP_K: 10,
  MAX_TOPICS_PER_POST: 8,
  CANDIDATE_WINDOW_DAYS: 180,
  CANDIDATE_LIMIT: 200,
  FRESH_HALF_LIFE_DAYS: 14,
  FRESH_FLOOR: 0.3,
  FEED_SIZE: 5,
  /** W of a topic that only comes from a joined community is COMMUNITY_BASE_WEIGHT + (1 - COMMUNITY_BASE_WEIGHT) x s. */
  COMMUNITY_BASE_WEIGHT: 0.5,
  /** Trending needs this much heat AND this many distinct participants in the window. */
  MIN_TRENDING_HEAT: 3,
  MIN_TRENDING_PARTICIPANTS: 2,
  COMMUNITY_SUGGESTIONS: 6,
  COMMUNITY_EMBED_TTL_SECONDS: 86_400,
  MAX_PER_COMMUNITY: 2,
  PAPER_TOPICS: 3,
  PAPER_RESULTS: 5,
  TRENDING_DAYS: 14,
  OVERFREQUENT_SHARE: 0.15,
  OVERFREQUENT_MIN_CORPUS: 200,
  BODY_SCAN_CHARS: 2000,
  BODY_MIN_OCCURRENCES: 2,
  SINGLE_WORD_MIN_LEN: 4,
  CURATED_MIN_LEN: 2,
  MAX_FOLLOWS: 20,
  MAX_TERM_WORDS: 8,
  GENERIC_TERMS: [
    "simulation", "statistics", "optimisation", "optimization", "data", "model", "models",
    "analysis", "method", "methods", "system", "systems", "study", "research", "review",
  ] as readonly string[],
  PROFILE_CACHE_TTL_SECONDS: 600,
  /** Relevance r(p,t) per source. Community topics are joined at query time and never stored. */
  RELEVANCE: { tag: 1.0, title: 0.8, paperKeyword: 0.6, communityTopic: 0.5, body: 0.3 },
  /** Signal strength e(u,p). */
  SIGNAL_WEIGHT: { read: 1, vote: 2, reaction: 2, follow: 3, comment: 3, authored: 4 },
} as const;

export type SignalKind = keyof typeof PERSONALIZATION.SIGNAL_WEIGHT;
