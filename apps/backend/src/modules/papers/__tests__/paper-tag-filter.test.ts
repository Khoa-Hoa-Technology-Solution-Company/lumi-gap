import { beforeEach, describe, expect, it, vi } from "vitest";
import { paperService } from "../paper.service.js";

const m = vi.hoisted(() => ({
  paperFindMany: vi.fn(),
  paperCount: vi.fn(),
  paperTagFindMany: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    paper: { findMany: m.paperFindMany, count: m.paperCount },
    paperTag: { findMany: m.paperTagFindMany },
  }),
}));

const A = "123e4567-e89b-42d3-a456-426614174000";
const base = { page: 1, pageSize: 20 };

beforeEach(() => {
  vi.resetAllMocks();
  m.paperFindMany.mockResolvedValue([]);
  m.paperCount.mockResolvedValue(0);
  m.paperTagFindMany.mockResolvedValue([]);
});

describe("paperService.list tagIds filter", () => {
  it("restricts to papers carrying any requested tag, ignoring blocked rows and non-UUID ids", async () => {
    m.paperTagFindMany.mockResolvedValue([{ paperId: "p1" }, { paperId: "p2" }, { paperId: "p1" }]);

    await paperService.list({ ...base, tagIds: [A.toUpperCase(), "nope", A] });

    expect(m.paperTagFindMany).toHaveBeenCalledWith({
      where: { tagId: { in: [A] }, source: { not: "blocked" } },
      select: { paperId: true },
    });
    expect(m.paperFindMany.mock.calls[0]![0].where.id).toEqual({ in: ["p1", "p2"] });
  });

  it("matches nothing when tagIds were requested but none is a UUID", async () => {
    await paperService.list({ ...base, tagIds: ["nope"] });

    expect(m.paperTagFindMany).not.toHaveBeenCalled();
    expect(m.paperFindMany.mock.calls[0]![0].where.id).toEqual({ in: [] });
  });

  it("does nothing without tagIds", async () => {
    await paperService.list({ ...base, tagIds: [] });

    expect(m.paperTagFindMany).not.toHaveBeenCalled();
    expect(m.paperFindMany.mock.calls[0]![0].where.id).toBeUndefined();
  });
});
