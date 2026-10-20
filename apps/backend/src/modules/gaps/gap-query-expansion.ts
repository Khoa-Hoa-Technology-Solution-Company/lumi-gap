/**
 * Query expansion for gap evidence retrieval, without an LLM. PURE — no I/O.
 *
 * One query ("LLM feedback for second-language writing in higher education") ranks papers that match all of it best,
 * so the pack misses work on two of its three facets. The topic is split into facets at prepositions/conjunctions
 * (English and Vietnamese); with 3 or more facets, each sub-query drops one facet. The lists are merged by
 * reciprocal rank fusion (Cormack et al. 2009), the same RRF the retriever uses.
 */

const SPLITTERS = new Set([
  "for", "in", "of", "on", "with", "and", "or", "via", "using", "through", "among", "across", "to", "into", "from", "by", "at", "vs", "versus", "within", "towards", "toward",
  "trong", "cho", "và", "của", "với", "về", "tại", "bằng", "qua", "hoặc", "đối", "giữa",
]);
const ARTICLES = new Set(["a", "an", "the"]);
/** Sub-queries added on top of the full topic. */
export const MAX_SUBQUERIES = 3;
const RRF_K = 60;

/** Facets of a topic: runs of words between splitter words or punctuation, original casing kept. */
export function topicFacets(topic: string): string[] {
  const facets: string[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length) facets.push(current.join(" ")); current = []; };
  for (const token of topic.split(/(\s+|[,;:()/|]+)/u)) {
    const word = token.trim();
    if (!word || /^[,;:()/|]+$/u.test(word)) { if (word) flush(); continue; }
    const lower = word.toLowerCase();
    if (SPLITTERS.has(lower)) { flush(); continue; }
    if (ARTICLES.has(lower)) continue;
    current.push(word);
  }
  flush();
  return facets;
}

/** The full topic first, then up to MAX_SUBQUERIES leave-one-out sub-queries (dropping the last facet first). */
export function expandTopicQueries(topic: string): string[] {
  const base = topic.trim(), facets = topicFacets(base);
  if (facets.length < 3) return [base];
  const seen = new Set([base.toLowerCase()]), queries = [base];
  for (let drop = facets.length - 1; drop >= 0 && queries.length <= MAX_SUBQUERIES; drop--) {
    const query = facets.filter((_, index) => index !== drop).join(" ");
    if (!seen.has(query.toLowerCase())) { seen.add(query.toLowerCase()); queries.push(query); }
  }
  return queries;
}

/**
 * Merges ranked lists by RRF (sum of 1 / (60 + rank)); a paper keeps its best retrieval score. Returns at most
 * `limit` papers, best fused rank first; ties keep the earlier list's order.
 */
export function fuseByRrf<T extends { id: string; score: number }>(lists: T[][], limit: number): T[] {
  const fused = new Map<string, { item: T; rrf: number; order: number }>();
  let order = 0;
  for (const list of lists) {
    list.forEach((item, index) => {
      const previous = fused.get(item.id);
      const rrf = (previous?.rrf ?? 0) + 1 / (RRF_K + index + 1);
      fused.set(item.id, { item: previous && previous.item.score >= item.score ? previous.item : item, rrf, order: previous?.order ?? order++ });
    });
  }
  return [...fused.values()].sort((a, b) => b.rrf - a.rrf || a.order - b.order).slice(0, limit).map((entry) => entry.item);
}
