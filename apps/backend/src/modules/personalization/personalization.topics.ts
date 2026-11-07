import { normalizeTerm } from "../taxonomy/taxonomy.normalize.js";
import { PERSONALIZATION } from "./personalization.constants.js";

/** One matchable term. `canonical` is the topic key it stands for (aliases and merged keywords map to a survivor). */
export interface VocabularyEntry {
  canonical: string;
  label: string;
  curated: boolean;
}
export type Vocabulary = Map<string, VocabularyEntry>;

export interface KeywordRow {
  id: string;
  keywordName: string;
  normalizedName: string;
  aliases: string[];
  status: string;
  mergedIntoId: string | null;
}

export interface VocabularySource {
  /** research_topics of ACTIVE research communities. */
  communityTopics: string[];
  keywords: KeywordRow[];
  /** users.research_interests and user_topic_follows.label, as typed. */
  userTerms: string[];
}

const wordCount = (term: string) => (term ? term.split(" ").length : 0);

function admitCurated(term: string): boolean {
  if (!term) return false;
  if (wordCount(term) > 1) return true;
  return term.length >= PERSONALIZATION.CURATED_MIN_LEN && !PERSONALIZATION.GENERIC_TERMS.includes(term);
}

/** R2: free text typed by a user only becomes a match term when it has at least two words. */
function admitUser(term: string): boolean {
  return wordCount(term) >= 2;
}

/** Pure. Builds V from raw rows; curated terms win over user terms; the first spelling seen is the label. */
export function buildVocabulary(source: VocabularySource): Vocabulary {
  const vocab: Vocabulary = new Map();
  const add = (raw: string, canonicalRaw: string, curated: boolean) => {
    const term = normalizeTerm(raw);
    const canonical = normalizeTerm(canonicalRaw);
    if (!term || !canonical) return;
    if (!(curated ? admitCurated(term) : admitUser(term))) return;
    const existing = vocab.get(term);
    if (existing && (existing.curated || !curated)) return;
    vocab.set(term, { canonical, label: existing?.label ?? canonicalRaw.trim(), curated });
  };

  for (const topic of source.communityTopics) add(topic, topic, true);

  const byId = new Map(source.keywords.map((keyword) => [keyword.id, keyword]));
  const survivor = (keyword: KeywordRow): KeywordRow | undefined => {
    let current: KeywordRow | undefined = keyword;
    for (let hops = 0; current && current.status === "merged" && hops < 5; hops += 1) {
      current = current.mergedIntoId ? byId.get(current.mergedIntoId) : undefined;
    }
    return current && current.status === "active" ? current : undefined;
  };
  for (const keyword of source.keywords) {
    if (keyword.status === "hidden") continue;
    const target = survivor(keyword);
    if (!target) continue;
    add(keyword.normalizedName, target.keywordName, true);
    for (const alias of keyword.aliases) add(alias, target.keywordName, true);
  }

  for (const raw of source.userTerms) add(raw, raw, false);
  return vocab;
}

/** Topic key a raw string stands for, or null when it is not in V. */
export function resolveTopicKey(raw: string, vocab: Vocabulary): string | null {
  return vocab.get(normalizeTerm(raw))?.canonical ?? null;
}

export function topicLabel(key: string, vocab: Vocabulary): string {
  for (const entry of vocab.values()) if (entry.canonical === key) return entry.label;
  return key;
}

/** Whole-phrase match on word boundaries: "nlp" matches "nlp for text" but not "nlpx". */
export function containsPhrase(normalizedText: string, normalizedTerm: string): boolean {
  if (!normalizedTerm) return false;
  return ` ${normalizedText} `.includes(` ${normalizedTerm} `);
}

/** Counts of every word n-gram (n <= maxWords) of an already-normalized text. */
export function phraseCounts(normalizedText: string, maxWords: number): Map<string, number> {
  const counts = new Map<string, number>();
  const words = normalizedText ? normalizedText.split(" ") : [];
  for (let start = 0; start < words.length; start += 1) {
    for (let length = 1; length <= maxWords && start + length <= words.length; length += 1) {
      const phrase = words.slice(start, start + length).join(" ");
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return counts;
}

function maxVocabularyWords(vocab: Vocabulary): number {
  let longest = 1;
  for (const term of vocab.keys()) longest = Math.max(longest, wordCount(term));
  return Math.min(longest, PERSONALIZATION.MAX_TERM_WORDS);
}

export interface PostTopicInput {
  tags: string[];
  title: string;
  body: string;
  /** Keyword names of the papers linked to the post (the linked keyword's name, else paper_keywords.keyword_name). */
  paperKeywordNames: string[];
}

export interface TopicRelevance {
  key: string;
  r: number;
}

export interface ExtractedTopics {
  /** Tag topics, r = 1.0. */
  topicKeys: string[];
  /** Everything else, as aligned arrays. */
  derivedKeys: string[];
  derivedWeights: number[];
}

/** Scans the title and the first BODY_SCAN_CHARS of the body once and exposes per-phrase counts. */
function scanText(input: PostTopicInput, vocab: Vocabulary) {
  const maxWords = maxVocabularyWords(vocab);
  return {
    title: phraseCounts(normalizeTerm(input.title), maxWords),
    body: phraseCounts(normalizeTerm(input.body.slice(0, PERSONALIZATION.BODY_SCAN_CHARS)), maxWords),
  };
}

/** Terms (as typed in V) a post matches by title or body, before the over-frequent filter. Used for corpus share. */
export function textMatchedTerms(input: PostTopicInput, vocab: Vocabulary): Set<string> {
  const scan = scanText(input, vocab);
  const matched = new Set<string>();
  for (const term of vocab.keys()) {
    if ((scan.title.get(term) ?? 0) >= 1 || (scan.body.get(term) ?? 0) >= PERSONALIZATION.BODY_MIN_OCCURRENCES) matched.add(term);
  }
  return matched;
}

/**
 * Terms matched by more than OVERFREQUENT_SHARE of the corpus. Only applies when the corpus has at least
 * OVERFREQUENT_MIN_CORPUS posts. They are skipped for title/body matching, never for tags, paper keywords or
 * community topics.
 */
export function overfrequentTerms(corpus: PostTopicInput[], vocab: Vocabulary): Set<string> {
  if (corpus.length < PERSONALIZATION.OVERFREQUENT_MIN_CORPUS) return new Set();
  const documentFrequency = new Map<string, number>();
  for (const post of corpus) {
    for (const term of textMatchedTerms(post, vocab)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const dropped = new Set<string>();
  for (const [term, count] of documentFrequency) if (count / corpus.length > PERSONALIZATION.OVERFREQUENT_SHARE) dropped.add(term);
  return dropped;
}

/** Pure. T(p) from the stored sources (tag 1.0, title 0.8, paper keyword 0.6, body 0.3); max per topic, cap 8. */
export function extractPostTopics(input: PostTopicInput, vocab: Vocabulary, dropped: ReadonlySet<string> = new Set()): ExtractedTopics {
  const best = new Map<string, number>();
  const offer = (key: string, r: number) => {
    if (r > (best.get(key) ?? 0)) best.set(key, r);
  };
  const { RELEVANCE } = PERSONALIZATION;

  for (const tag of input.tags) {
    const key = resolveTopicKey(tag, vocab);
    if (key) offer(key, RELEVANCE.tag);
  }
  for (const name of input.paperKeywordNames) {
    const key = resolveTopicKey(name, vocab);
    if (key) offer(key, RELEVANCE.paperKeyword);
  }
  const scan = scanText(input, vocab);
  for (const [term, entry] of vocab) {
    if (dropped.has(term)) continue;
    if ((scan.title.get(term) ?? 0) >= 1) offer(entry.canonical, RELEVANCE.title);
    else if ((scan.body.get(term) ?? 0) >= PERSONALIZATION.BODY_MIN_OCCURRENCES) offer(entry.canonical, RELEVANCE.body);
  }

  const ranked = [...best.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, PERSONALIZATION.MAX_TOPICS_PER_POST);
  const topicKeys = ranked.filter(([, r]) => r === RELEVANCE.tag).map(([key]) => key);
  const derived = ranked.filter(([, r]) => r !== RELEVANCE.tag);
  return { topicKeys, derivedKeys: derived.map(([key]) => key), derivedWeights: derived.map(([, r]) => r) };
}

export interface StoredPostTopics {
  topicKeys: string[];
  derivedTopicKeys: string[];
  derivedTopicWeights: number[];
  /** research_topics of the post's research community, as typed. */
  communityTopics: string[];
}

/** Pure. Full T(p) used for scoring: stored keys plus the research community's topics (r = 0.5), max per topic. */
export function postTopicRelevance(post: StoredPostTopics, vocab: Vocabulary): TopicRelevance[] {
  const best = new Map<string, number>();
  const offer = (key: string, r: number) => {
    if (r > (best.get(key) ?? 0)) best.set(key, r);
  };
  for (const key of post.topicKeys) offer(key, PERSONALIZATION.RELEVANCE.tag);
  post.derivedTopicKeys.forEach((key, index) => offer(key, Number(post.derivedTopicWeights[index] ?? PERSONALIZATION.RELEVANCE.body)));
  for (const topic of post.communityTopics) {
    const key = resolveTopicKey(topic, vocab) ?? normalizeTerm(topic);
    if (key) offer(key, PERSONALIZATION.RELEVANCE.communityTopic);
  }
  return [...best.entries()].map(([key, r]) => ({ key, r })).sort((left, right) => right.r - left.r || left.key.localeCompare(right.key));
}

/** True when stored keys/weights differ, so a recompute only writes rows that changed. */
export function topicsChanged(
  current: { topicKeys: string[]; derivedTopicKeys: string[]; derivedTopicWeights: number[] },
  next: ExtractedTopics,
): boolean {
  const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
  const sameNumbers = (left: readonly number[], right: readonly number[]) => left.length === right.length && left.every((value, index) => Math.abs(Number(value) - Number(right[index])) < 1e-6);
  return !sameStrings(current.topicKeys, next.topicKeys)
    || !sameStrings(current.derivedTopicKeys, next.derivedKeys)
    || !sameNumbers(current.derivedTopicWeights, next.derivedWeights);
}
