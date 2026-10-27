import { describe, expect, it } from "vitest";
import { ListProjectChatQuerySchema } from "../dto/project-chat.schema.js";

describe("project AI history query validation", () => {
  it("retains private history and 50 messages as defaults", () => {
    expect(ListProjectChatQuerySchema.parse({})).toEqual({ limit: 50, scope: "private" });
  });
  it("accepts bounded page sizes and public database cursors", () => {
    for (const beforeId of [crypto.randomUUID(), "0123456789abcdef01234567"]) {
      expect(ListProjectChatQuerySchema.parse({ limit: "100", scope: "team", beforeId })).toEqual({ limit: 100, scope: "team", beforeId });
    }
  });
  it("rejects invalid cursors, scopes, and page sizes", () => {
    for (const input of [{ beforeId: "invalid" }, { beforeId: [crypto.randomUUID()] }, { scope: "general" }, { limit: "0" }, { limit: "101" }, { limit: "1.5" }]) {
      expect(ListProjectChatQuerySchema.safeParse(input).success).toBe(false);
    }
  });
});
