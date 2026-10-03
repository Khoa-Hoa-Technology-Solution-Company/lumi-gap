// Discovery is navigation, never scientific evidence or a confidence signal.
const genericTerms = new Set("a an the and or of to in on for with from by is are be this that how what should can does do beyond research computing discussion evaluation outcomes defined study paper methods method using use vi và là các của cho trong một những như với nghiên cứu".split(" "));

export function forumDiscoveryTerms(title: string): string[] {
  return [...new Set(title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => word.length >= 4 && !genericTerms.has(word)).slice(0, 10);
}

export function forumDiscoveryTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.toLowerCase()))].filter((tag) => !genericTerms.has(tag));
}

export type ForumDiscoveryReason = "SAME_PAPER" | "SAME_GAP" | "SHARED_TAGS" | "SIMILAR_TOPIC" | "SAME_COMMUNITY" | "RECENT_DISCUSSION";
type Topic = { title: string; tags: string[]; linkedPaperId?: string; linkedResearchGapId?: string };
export function forumRelatedReason(source: Topic, candidate: Topic): { reason: ForumDiscoveryReason; score: number } | undefined {
  if (source.linkedPaperId && source.linkedPaperId === candidate.linkedPaperId) return { reason: "SAME_PAPER", score: 100 };
  if (source.linkedResearchGapId && source.linkedResearchGapId === candidate.linkedResearchGapId) return { reason: "SAME_GAP", score: 90 };
  const tags = new Set(forumDiscoveryTags(source.tags));
  const sharedTags = forumDiscoveryTags(candidate.tags).filter((tag) => tags.has(tag)).length;
  if (sharedTags) return { reason: "SHARED_TAGS", score: 50 + sharedTags };
  const terms = new Set(forumDiscoveryTerms(source.title));
  const sharedTerms = forumDiscoveryTerms(candidate.title).filter((term) => terms.has(term)).length;
  if (sharedTerms >= 2) return { reason: "SIMILAR_TOPIC", score: 10 + sharedTerms };
  return undefined;
}
