import { describe, expect, it } from "vitest";
import {
  FILTERED_PAPER_VECTOR_INDEX,
  PAPER_VECTOR_FILTER_PATHS,
  paperVectorIndexDefinition,
} from "../paper-vector-index.js";

describe("filtered paper vector index", () => {
  it("uses a versioned name so the legacy index remains available for rollback", () => {
    expect(FILTERED_PAPER_VECTOR_INDEX).toBe("paper_vector_index_v2");
  });

  it("indexes the embedding and every supported metadata prefilter", () => {
    const definition = paperVectorIndexDefinition();
    expect(definition.fields[0]).toEqual({
      type: "vector",
      path: "embedding",
      numDimensions: 768,
      similarity: "cosine",
    });

    const filterPaths = definition.fields
      .filter((field) => field.type === "filter")
      .map((field) => field.path);
    expect(filterPaths).toEqual(PAPER_VECTOR_FILTER_PATHS);
  });
});
