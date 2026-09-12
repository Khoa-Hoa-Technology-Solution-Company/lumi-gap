import type { OpenAlexTopic, OpenAlexTopicLevel, OpenAlexWork } from "./openalex.types.js";
import { normalizeAcademicTitle } from "../../../common/text/academic-text.js";

type DetectedBy = "openalex" | "ai" | "user";
type PaperKind = "article" | "proceedings" | "preprint" | "review" | "book-chapter" | "other";
type OpenAccessStatus = "gold" | "green" | "hybrid" | "bronze" | "closed" | "unknown";

/**
 * The provider-agnostic shape the sync service upserts into `research_papers`.
 * Matches the PaperModel schema field-for-field (minus server-managed fields).
 */
export interface NormalizedPaper {
  externalIds: {
    doi?: string;
    openalexId?: string;
  };
  title: string;
  abstractText?: string;
  authors: {
    displayName: string;
    position: number;
    isCorresponding: boolean;
    affiliation?: string;
  }[];
  journalName?: string;
  publicationYear: number;
  publicationDate?: Date;
  paperKind: PaperKind;
  language: string;
  textSearchLanguage: "none";
  openAccessStatus: OpenAccessStatus;
  openAccessUrl?: string;
  licenseName?: string;
  citationCount: number;
  fwci?: number;
  citationNormalizedPercentile?: {
    value: number;
    isInTop1Percent?: boolean;
    isInTop10Percent?: boolean;
  };
  keywords: { keywordName: string; detectedBy: DetectedBy; confidence?: number }[];
  topics: NormalizedTopic[];
  referencedWorks: string[];
  relatedWorks: string[];
  relatedWorksCount: number;
  primaryProvider: "openalex";
}

export interface NormalizedTopic {
  openalexTopicId?: string;
  topicName: string;
  detectedBy: DetectedBy;
  confidence?: number;
  isPrimary?: boolean;
  subfieldId?: string;
  subfieldName?: string;
  fieldId?: string;
  fieldName?: string;
  domainId?: string;
  domainName?: string;
}

/** Convert one OpenAlex Work into the normalized paper shape. Pure & permissive. */
export function normalizeOpenAlexWork(w: OpenAlexWork): NormalizedPaper {
  return {
    externalIds: {
      doi: stripPrefix(w.doi, "https://doi.org/")?.toLowerCase(),
      openalexId: stripPrefix(w.id, "https://openalex.org/"),
    },
    title: normalizeTitle(w.title, w.display_name),
    abstractText: reconstructAbstract(w.abstract_inverted_index),
    authors: (w.authorships ?? []).map((a, i) => ({
      displayName: a.author?.display_name?.trim() ?? "Unknown",
      position: i,
      isCorresponding: a.is_corresponding ?? a.author_position === "first",
      affiliation: a.institutions?.[0]?.display_name,
    })),
    journalName: w.primary_location?.source?.display_name ?? undefined,
    publicationYear: w.publication_year ?? 0,
    publicationDate: w.publication_date ? new Date(w.publication_date) : undefined,
    paperKind: mapPaperKind(w.type),
    language: normalizeLanguage(w.language),
    textSearchLanguage: "none",
    openAccessStatus: mapOpenAccessStatus(w.open_access?.oa_status),
    openAccessUrl:
      w.open_access?.oa_url ??
      w.best_oa_location?.pdf_url ??
      w.best_oa_location?.landing_page_url ??
      undefined,
    licenseName: w.primary_location?.license ?? undefined,
    citationCount: w.cited_by_count ?? 0,
    fwci: typeof w.fwci === "number" ? w.fwci : undefined,
    citationNormalizedPercentile: normalizeCitationPercentile(w.citation_normalized_percentile),
    keywords: (w.keywords ?? [])
      .filter((k) => k.display_name)
      .map((k) => ({
        keywordName: k.display_name!.trim(),
        detectedBy: "openalex" as const,
        confidence: k.score,
      })),
    topics: normalizeTopics(w),
    referencedWorks: (w.referenced_works ?? []).map((r) => stripPrefix(r, "https://openalex.org/")!),
    relatedWorks: (w.related_works ?? []).map((r) => stripPrefix(r, "https://openalex.org/")!),
    relatedWorksCount: w.related_works?.length ?? 0,
    primaryProvider: "openalex",
  };
}

function normalizeLanguage(language: string | null | undefined): string {
  const normalized = language?.trim().toLowerCase();
  return normalized && /^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : "und";
}

function normalizeCitationPercentile(
  value?: OpenAlexWork["citation_normalized_percentile"],
): NormalizedPaper["citationNormalizedPercentile"] {
  if (typeof value?.value !== "number") return undefined;
  return {
    value: Math.max(0, Math.min(1, value.value)),
    isInTop1Percent: value.is_in_top_1_percent ?? undefined,
    isInTop10Percent: value.is_in_top_10_percent ?? undefined,
  };
}

function normalizeTopics(w: OpenAlexWork): NormalizedTopic[] {
  const primaryTopic = w.primary_topic?.display_name ? w.primary_topic : undefined;
  const primaryKey = primaryTopic ? topicKey(primaryTopic) : undefined;
  const topics = [...(primaryTopic ? [primaryTopic] : []), ...(w.topics ?? [])];
  const seen = new Set<string>();
  const normalized: NormalizedTopic[] = [];

  for (const topic of topics) {
    if (!topic.display_name) continue;
    const key = topicKey(topic);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      openalexTopicId: openAlexEntityId(topic.id),
      topicName: topic.display_name.trim(),
      detectedBy: "openalex",
      confidence: topic.score,
      isPrimary: primaryKey === key,
      ...topicLevel("subfield", topic.subfield),
      ...topicLevel("field", topic.field),
      ...topicLevel("domain", topic.domain),
    });
  }

  return normalized;
}

function topicKey(topic: OpenAlexTopic): string {
  return openAlexEntityId(topic.id) ?? topic.display_name?.trim().toLowerCase() ?? "";
}

function topicLevel(
  level: "subfield" | "field" | "domain",
  value?: OpenAlexTopicLevel | null,
): Partial<NormalizedTopic> {
  if (!value) return {};
  const prefix = level;
  return {
    [`${prefix}Id`]: openAlexEntityId(value.id),
    [`${prefix}Name`]: value.display_name?.trim(),
  } as Partial<NormalizedTopic>;
}

/**
 * OpenAlex stores abstracts as an inverted index { word: [positions] }.
 * Rebuild the original text by placing each word at its positions.
 */
export function reconstructAbstract(idx?: Record<string, number[]> | null): string | undefined {
  if (!idx || Object.keys(idx).length === 0) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : undefined;
}

function stripPrefix(value: string | null | undefined, prefix: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function openAlexEntityId(value: string | null | undefined): string | undefined {
  const stripped = stripPrefix(value, "https://openalex.org/");
  if (!stripped) return undefined;
  return stripped.split("/").filter(Boolean).at(-1);
}

function mapPaperKind(type?: string | null): PaperKind {
  switch (type) {
    case "article":
      return "article";
    case "review":
      return "review";
    case "preprint":
      return "preprint";
    case "book-chapter":
      return "book-chapter";
    case "proceedings-article":
    case "proceedings":
      return "proceedings";
    default:
      return "other";
  }
}

function mapOpenAccessStatus(status?: string): OpenAccessStatus {
  switch (status) {
    case "gold":
    case "diamond": // treat diamond OA as gold for our enum
      return "gold";
    case "green":
      return "green";
    case "hybrid":
      return "hybrid";
    case "bronze":
      return "bronze";
    case "closed":
      return "closed";
    default:
      return "unknown";
  }
}

function normalizeTitle(title?: string | null, displayName?: string | null): string {
  return normalizeAcademicTitle(title?.trim() || displayName?.trim());
}
