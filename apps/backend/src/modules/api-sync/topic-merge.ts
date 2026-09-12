import type { NormalizedTopic } from "./providers/openalex.normalizer.js";

type TopicLike = {
  [K in keyof NormalizedTopic]?: NormalizedTopic[K] | null;
} & { topicName?: string | null };

const RICH_TOPIC_FIELDS: Array<keyof NormalizedTopic> = [
  "openalexTopicId",
  "isPrimary",
  "subfieldId",
  "subfieldName",
  "fieldId",
  "fieldName",
  "domainId",
  "domainName",
];

export function shouldReplaceTopics(
  existingTopics: ArrayLike<TopicLike> | null | undefined,
  incomingTopics: ArrayLike<TopicLike> | null | undefined,
): boolean {
  const existing = toArray(existingTopics);
  const incoming = toArray(incomingTopics);
  if (incoming.length === 0) return false;
  if (incoming.length > existing.length) return true;

  const existingByKey = new Map(existing.map((topic) => [topicKey(topic), topic]));
  return incoming.some((topic) => {
    const current = existingByKey.get(topicKey(topic));
    if (!current) return true;
    return RICH_TOPIC_FIELDS.some((field) => hasValue(topic[field]) && !hasValue(current[field]));
  });
}

function toArray(topics: ArrayLike<TopicLike> | null | undefined): TopicLike[] {
  return topics ? Array.from(topics) : [];
}

function topicKey(topic: TopicLike): string {
  return (topic.openalexTopicId ?? topic.topicName ?? "").trim().toLowerCase();
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}
