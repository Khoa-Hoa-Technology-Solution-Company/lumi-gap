import { describe, expect, it } from "vitest";
import { screeningPageSchema } from "../dto/screening.schema.js";

describe("screening queue HTTP query contract", () => {
  it.each(["ALL", "UNCLAIMED", "LAST_SLOT"])("accepts the web queue query with slots=%s", slots => {
    const query = screeningPageSchema.parse({ filter: "QUEUE", page: "1", pageSize: "12", q: "", slots });
    expect(query).toMatchObject({ filter: "QUEUE", page: 1, pageSize: 12, q: "", slots });
  });
  it("preserves clients without a slots filter", () => {
    expect(screeningPageSchema.parse({ filter: "QUEUE" }).slots).toBe("ALL");
  });
  it.each([{ slots: "INVALID" }, { slots: ["ALL", "LAST_SLOT"] }, { slots: "ALL", unknown: "value" }])("rejects malformed and unknown query parameters: %j", query => {
    expect(screeningPageSchema.safeParse({ filter: "QUEUE", ...query }).success).toBe(false);
  });
});
