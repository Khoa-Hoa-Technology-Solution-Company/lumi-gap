import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../common/exceptions/app-error.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PAPER_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    paper: { findUnique: vi.fn() },
    report: { findUnique: vi.fn() },
    bookmark: { findMany: vi.fn() },
  },
  paper: vi.fn(),
  report: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../papers/paper.service.js", () => ({ paperService: { getById: mocks.paper } }));
vi.mock("../../reports/report.service.js", () => ({ reportService: { getById: mocks.report } }));

import { bookmarkService } from "../bookmark.service.js";

function saved(paperId: string | null, reportId: string | null) {
  return {
    id: "44444444-4444-4444-8444-444444444444", legacyMongoId: null,
    paperId, reportId, note: "Read for the project",
    createdAt: new Date("2026-10-06T00:00:00Z"), updatedAt: new Date("2026-10-06T00:00:00Z"),
  };
}

describe("bookmark library response", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ id: USER_ID, legacyMongoId: null });
    mocks.prisma.paper.findUnique.mockResolvedValue({ id: PAPER_ID, legacyMongoId: null });
    mocks.prisma.report.findUnique.mockResolvedValue({ id: REPORT_ID, legacyMongoId: null });
  });

  it("returns saved paper details so My Library can render and search the item", async () => {
    mocks.prisma.bookmark.findMany.mockResolvedValue([saved(PAPER_ID, null)]);
    const paper = { id: PAPER_ID, title: "Evaluating LLM code review", authors: [], abstractText: "A comparison study" };
    mocks.paper.mockResolvedValue(paper);

    const [bookmark] = await bookmarkService.list(USER_ID);

    expect(bookmark).toMatchObject({ targetKind: "paper", targetId: PAPER_ID, paperDetail: paper, note: "Read for the project" });
    expect(mocks.paper).toHaveBeenCalledWith(PAPER_ID, { userId: USER_ID });
  });

  it("returns saved report details after checking the user's report access", async () => {
    mocks.prisma.bookmark.findMany.mockResolvedValue([saved(null, REPORT_ID)]);
    const report = { id: REPORT_ID, query: "code review", topic: "Software Engineering" };
    mocks.report.mockResolvedValue(report);

    expect(await bookmarkService.list(USER_ID)).toEqual([
      expect.objectContaining({ targetKind: "report", reportDetail: report }),
    ]);
    expect(mocks.report).toHaveBeenCalledWith(USER_ID, REPORT_ID);
  });

  it("omits papers that are no longer visible and reports the user can no longer access", async () => {
    mocks.prisma.bookmark.findMany.mockResolvedValue([saved(PAPER_ID, null), saved(null, REPORT_ID)]);
    mocks.paper.mockResolvedValue(null);
    mocks.report.mockRejectedValue(AppError.notFound("Report not found"));

    expect(await bookmarkService.list(USER_ID)).toEqual([]);
  });

  it("does not disguise report loading failures as an empty library", async () => {
    mocks.prisma.bookmark.findMany.mockResolvedValue([saved(null, REPORT_ID)]);
    mocks.report.mockRejectedValue(new Error("Database unavailable"));

    await expect(bookmarkService.list(USER_ID)).rejects.toThrow("Database unavailable");
  });
});
