import type { Community, CommunityRelatedPaper, ForumPost } from "./forum.js";

/**
 * Where a topic in the "For you" profile comes from. `profile` is read-only: it lives in the academic profile.
 * `community` = a topic of a research community the user joined. Precedence: followed > profile > community > inferred.
 */
export type InterestSource = "followed" | "profile" | "community" | "inferred";

export interface InterestTopic {
  key: string;
  label: string;
  source: InterestSource;
  /** W(u,t): 1 + s for followed/profile topics, s for inferred ones. */
  weight: number;
  /** s(u,t) in [0, 1]. */
  score: number;
  /** Number of distinct posts that contributed to the topic. */
  evidenceCount: number;
  lowConfidence: boolean;
  /** False when no discussion can match the term (it is not in the topic vocabulary). */
  matchable: boolean;
  /** For `community` topics: the most recently joined community that has the topic. */
  viaCommunity?: { id: string; name: string };
}

export interface InterestsResponse {
  topics: InterestTopic[];
  muted: Array<{ key: string; label: string }>;
}

export interface VocabularyTerm {
  key: string;
  label: string;
}

export type ForYouReasonKind = "followed" | "joined" | "inferred" | "lowConfidence" | "trending" | "new";
/** Posts: personal matches, else "explore" (trending or new posts). Papers: personal, else trending topics. */
export type ForYouPostsBasis = "personal" | "explore" | "none";
export type ForYouPapersBasis = "personal" | "trending" | "none";
export type ForYouBasis = ForYouPostsBasis | ForYouPapersBasis;

export interface ForYouPost extends ForumPost {
  reasonKind: ForYouReasonKind;
  /** The matched topic, or the community/category name for trending posts. */
  reasonTopic: { key: string; label: string };
  /** For `followed` reasons: a topic from the academic profile reads differently from one the user follows. */
  reasonSource?: InterestSource;
  /** For `joined` reasons: the community the topic comes from. */
  reasonCommunity?: { id: string; name: string };
  /** For `trending` entries: distinct readers and repliers in the last two weeks. */
  reasonStats?: { readers: number; replies: number };
}

/** Query of GET /personalization/for-you. `limit` is a whole number from 5 to 20; absent means 5. */
export interface ForYouQuery {
  limit?: number;
}

export interface ForYouResponse {
  postsBasis: ForYouPostsBasis;
  papersBasis: ForYouPapersBasis;
  posts: ForYouPost[];
  papers: CommunityRelatedPaper[];
}

/** A research community suggested by topic overlap with the profile (or by meaning when topics are not enough). */
export interface ForYouCommunity extends Community {
  matchedTopics: Array<{ key: string; label: string }>;
  matchReason: "topic" | "semantic";
}
