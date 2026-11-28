import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_NAMESPACE,
  DEMO_PROJECT_KEYS,
  buildSyntheticPdf,
  computePolicyHash,
  demoId,
} from "../../../../prisma/seed-lecturer-workspace.js";

describe("Lecturer Workspace demo seed invariants & synthetic PDF builder", () => {
  it("generates deterministic UUIDv4-formatted identifiers isolated by namespace", () => {
    const a = demoId("project:lw-ai-edu");
    const b = demoId("project:lw-ai-edu");
    const c = demoId("project:lw-med-llm");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(DEMO_NAMESPACE).toBe("lumigap-lecturer-workspace-demo-v2");
  });

  it("computes canonical order-independent prospective policy hashes", () => {
    const h1 = computePolicyHash("ADVISOR", ["TASKS_VIEW", "OVERVIEW_VIEW", "MENTOR_CHAT"], "2027-01-01T00:00:00.000Z");
    const h2 = computePolicyHash("ADVISOR", ["MENTOR_CHAT", "OVERVIEW_VIEW", "TASKS_VIEW", "TASKS_VIEW"], "2027-01-01T00:00:00.000Z");
    const h3 = computePolicyHash("OBSERVER", ["MENTOR_CHAT", "OVERVIEW_VIEW", "TASKS_VIEW"], "2027-01-01T00:00:00.000Z");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });

  it("covers representative student, lecturer, verification, and privacy personas safely", () => {
    const keys = DEMO_ACCOUNTS.map(a => a.key);
    expect(new Set(keys).size).toBe(DEMO_ACCOUNTS.length);
    expect(DEMO_ACCOUNTS.some(a => a.role === "lecturer" && a.verified && a.available)).toBe(true);
    expect(DEMO_ACCOUNTS.some(a => a.role === "lecturer" && a.verified && !a.available)).toBe(true);
    expect(DEMO_ACCOUNTS.some(a => a.role === "lecturer" && !a.verified && !a.pendingVerification)).toBe(true);
    expect(DEMO_ACCOUNTS.some(a => a.role === "lecturer" && a.pendingVerification)).toBe(true);
    expect(DEMO_ACCOUNTS.some(a => a.profileVisibility === "PRIVATE")).toBe(true);
    expect(DEMO_PROJECT_KEYS.length).toBeGreaterThanOrEqual(10);
  });

  it("produces valid synthetic PDF bytes for local introductory document fixtures", async () => {
    const bytes = await buildSyntheticPdf(
      "Đề cương tóm tắt (Demo)",
      "Tài liệu giới thiệu an toàn",
      ["Mục tiêu 1: Đánh giá trợ lý AI", "Mục tiêu 2: Kiểm chứng thực nghiệm"],
    );
    expect(bytes.byteLength).toBeGreaterThan(400);
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });
});
