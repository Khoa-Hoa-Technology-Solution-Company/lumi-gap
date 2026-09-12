import { beforeEach, describe, expect, it, vi } from "vitest";
import { gapsService } from "../gaps.service.js";
import { GapAnalysisModel } from "../models/gap-analysis.model.js";

vi.mock("../models/gap-analysis.model.js", () => ({
  GapAnalysisModel: {
    findOne: vi.fn(),
  },
}));

describe("gapsService.getActiveAnalysis", () => {
  beforeEach(() => {
    vi.mocked(GapAnalysisModel.findOne).mockReset();
  });

  it("returns the latest queued or analyzing analysis owned by the user", async () => {
    const lean = vi.fn().mockResolvedValue({
      _id: "analysis-1",
      topic: "LLM evaluation",
      status: "analyzing",
      gapIds: ["gap-1"],
      selectedPaperIds: ["paper-1", "paper-2", "paper-3"],
      evidenceMode: "selected",
      yearFrom: 2020,
      yearTo: 2025,
      createdAt: new Date("2026-07-27T01:00:00.000Z"),
      updatedAt: new Date("2026-07-27T01:01:00.000Z"),
      errorMessage: undefined,
    });
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(GapAnalysisModel.findOne).mockReturnValue({ sort } as never);

    await expect(gapsService.getActiveAnalysis("user-1")).resolves.toEqual({
      id: "analysis-1",
      topic: "LLM evaluation",
      status: "analyzing",
      gapIds: ["gap-1"],
      selectedPaperIds: ["paper-1", "paper-2", "paper-3"],
      evidenceMode: "selected",
      yearFrom: 2020,
      yearTo: 2025,
      createdAt: "2026-07-27T01:00:00.000Z",
      updatedAt: "2026-07-27T01:01:00.000Z",
      errorMessage: undefined,
    });

    expect(GapAnalysisModel.findOne).toHaveBeenCalledWith({
      userId: "user-1",
      status: { $in: ["queued", "analyzing"] },
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it("returns null when the user has no active analysis", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    const sort = vi.fn().mockReturnValue({ lean });
    vi.mocked(GapAnalysisModel.findOne).mockReturnValue({ sort } as never);

    await expect(gapsService.getActiveAnalysis("user-1")).resolves.toBeNull();
  });
});

describe("gapsService.retryAnalysis", () => {
  beforeEach(() => {
    vi.mocked(GapAnalysisModel.findOne).mockReset();
    vi.restoreAllMocks();
  });

  it("re-enqueues a failed analysis with the exact prior evidence and scope", async () => {
    vi.mocked(GapAnalysisModel.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: "analysis-1",
        userId: "user-1",
        topic: "LLM evaluation",
        status: "failed",
        projectId: null,
        selectedPaperIds: ["paper-1", "paper-2", "paper-3"],
        evidenceMode: "selected",
        yearFrom: 2020,
        yearTo: 2025,
      }),
    } as never);
    const enqueue = vi.spyOn(gapsService, "enqueue").mockResolvedValue("analysis-2");

    await expect(gapsService.retryAnalysis("user-1", "analysis-1")).resolves.toBe("analysis-2");
    expect(enqueue).toHaveBeenCalledWith("user-1", {
      topic: "LLM evaluation",
      projectId: undefined,
      selectedPaperIds: ["paper-1", "paper-2", "paper-3"],
      evidenceMode: "selected",
      yearFrom: 2020,
      yearTo: 2025,
    });
  });

  it("rejects retry when the owned analysis is not failed", async () => {
    vi.mocked(GapAnalysisModel.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    await expect(gapsService.retryAnalysis("user-1", "analysis-1")).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
    });
  });
});
