import { describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../evaluation.service.js";
import { ResearchGapModel } from "../../gaps/models/research-gap.model.js";

vi.mock("../../gaps/models/research-gap.model.js", () => ({
  ResearchGapModel: {
    countDocuments: vi.fn(),
  },
}));

describe("evaluationRepository", () => {
  it("counts only probe-backed gaps as evidence-backed", async () => {
    vi.mocked(ResearchGapModel.countDocuments).mockResolvedValue(3 as never);

    await evaluationRepository.countEvidenceBackedGaps();

    expect(ResearchGapModel.countDocuments).toHaveBeenCalledWith({
      status: "active",
      supportingPaperIds: { $exists: true, $ne: [] },
      "probe.topicA": { $exists: true, $ne: "" },
      "probe.topicB": { $exists: true, $ne: "" },
      evidenceConfidence: { $gte: 0.5 },
    });
  });
});
