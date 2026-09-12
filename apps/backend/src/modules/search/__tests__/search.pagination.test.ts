import { describe, expect, it } from "vitest";
import { slicePage } from "../search.service.js";

describe("semantic search pagination", () => {
  it("returns the requested page without substituting the last page", () => {
    expect(slicePage([1, 2, 3], 99, 2)).toEqual({ items: [], total: 3 });
  });

  it("returns the expected in-range slice and stable total", () => {
    expect(slicePage([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], total: 5 });
  });
});
