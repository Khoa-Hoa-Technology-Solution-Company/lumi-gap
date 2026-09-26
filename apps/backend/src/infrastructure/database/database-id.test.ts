import { describe, expect, it } from "vitest";

import { parseDatabaseId, publicDatabaseId, requireDatabaseId } from "./database-id.js";

describe("database ID compatibility", () => {
  it("accepts and normalizes migrated legacy IDs", () => {
    expect(parseDatabaseId("64B000000000000000000001")).toEqual({
      kind: "legacyMongoId",
      value: "64b000000000000000000001",
    });
  });

  it("accepts UUIDs", () => {
    expect(parseDatabaseId("550e8400-e29b-41d4-a716-446655440000")).toEqual({
      kind: "uuid",
      value: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects malformed IDs", () => {
    expect(parseDatabaseId("not-an-id")).toBeNull();
    expect(() => requireDatabaseId("not-an-id")).toThrow(/UUID or a migrated 24-character legacy ID/);
  });

  it("keeps legacy public IDs stable", () => {
    expect(publicDatabaseId({
      id: "550e8400-e29b-41d4-a716-446655440000",
      legacyMongoId: "64b000000000000000000001",
    })).toBe("64b000000000000000000001");
    expect(publicDatabaseId({ id: "550e8400-e29b-41d4-a716-446655440000" }))
      .toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});
