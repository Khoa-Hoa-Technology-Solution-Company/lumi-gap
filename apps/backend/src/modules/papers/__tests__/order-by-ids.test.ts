import { describe, expect, it } from "vitest";
import { orderByIds } from "../paper.service.js";

describe("orderByIds", () => {
  it("returns refs in the requested id order, dropping misses", () => {
    const refs = [
      { id: "b", title: "B", publicationYear: 2021, authors: [] },
      { id: "a", title: "A", publicationYear: 2020, authors: [] },
    ];
    expect(orderByIds(refs, ["a", "missing", "b"]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
