export const LEGACY_PAPER_VECTOR_INDEX = "paper_vector_index";
export const FILTERED_PAPER_VECTOR_INDEX = "paper_vector_index_v2";

export const PAPER_VECTOR_FILTER_PATHS = [
  "_id",
  "dataStatus",
  "publicationYear",
  "paperKind",
  "openAccessStatus",
  "primaryProvider",
  "journalName",
  "language",
  "citationCount",
  "topics.topicName",
  "topics.openalexTopicId",
  "topics.subfieldName",
  "topics.subfieldId",
  "topics.fieldName",
  "topics.fieldId",
  "topics.domainName",
  "topics.domainId",
] as const;

export function paperVectorIndexDefinition() {
  return {
    fields: [
      {
        type: "vector" as const,
        path: "embedding",
        numDimensions: 768,
        similarity: "cosine" as const,
      },
      ...PAPER_VECTOR_FILTER_PATHS.map((path) => ({
        type: "filter" as const,
        path,
      })),
    ],
  };
}
