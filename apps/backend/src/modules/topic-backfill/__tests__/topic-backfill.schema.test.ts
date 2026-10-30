import { describe, expect, it } from "vitest";
import {
  AdminBackfillRequestSchema, ListBackfillRunsQuerySchema, SearchBackfillRequestSchema,
} from "../dto/topic-backfill.schema.js";

const ID = "00000000-0000-4000-8000-000000000001";

describe("topic backfill schemas", () => {
  it("lets the user route ask for a topic, subfield or keyword", () => {
    for (const targetKind of ["topic", "subfield", "keyword"]) {
      expect(SearchBackfillRequestSchema.safeParse({ targetKind, targetId: ID }).success).toBe(true);
    }
  });

  it("rejects a tag, a taxonomy field or an unknown kind on the user route", () => {
    for (const targetKind of ["tag", "field", "domain", "author"]) {
      expect(SearchBackfillRequestSchema.safeParse({ targetKind, targetId: ID }).success).toBe(false);
    }
  });

  it("rejects a target id that is not a UUID", () => {
    expect(SearchBackfillRequestSchema.safeParse({ targetKind: "topic", targetId: "T10028" }).success).toBe(false);
  });

  it("does not let the user route set a budget", () => {
    const parsed = SearchBackfillRequestSchema.parse({ targetKind: "topic", targetId: ID, maxNewPapers: 5000 });
    expect(parsed).not.toHaveProperty("maxNewPapers");
  });

  it("accepts a tag and an optional integer budget on the admin route", () => {
    expect(AdminBackfillRequestSchema.safeParse({ targetKind: "tag", targetId: ID }).success).toBe(true);
    expect(AdminBackfillRequestSchema.safeParse({ targetKind: "tag", targetId: ID, maxNewPapers: 500 }).success).toBe(true);
    expect(AdminBackfillRequestSchema.safeParse({ targetKind: "tag", targetId: ID, maxNewPapers: 0 }).success).toBe(false);
    expect(AdminBackfillRequestSchema.safeParse({ targetKind: "tag", targetId: ID, maxNewPapers: 1.5 }).success).toBe(false);
    expect(AdminBackfillRequestSchema.safeParse({ targetKind: "tag", targetId: ID, maxNewPapers: "10" }).success).toBe(false);
  });

  it("parses list filters with pagination defaults", () => {
    expect(ListBackfillRunsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(ListBackfillRunsQuerySchema.parse({ state: "failed", targetKind: "tag", targetId: ID, page: "2" }))
      .toMatchObject({ state: "failed", targetKind: "tag", page: 2 });
    expect(ListBackfillRunsQuerySchema.safeParse({ state: "paused" }).success).toBe(false);
  });
});
