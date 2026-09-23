import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { GapEvidenceRecordModel, GapValidationModel } from "../models/gap-validation.model.js";
import { ResearchGapModel } from "../models/research-gap.model.js";

const oid = () => new mongoose.Types.ObjectId();

describe("evidence-backed research gap invariants", () => {
  it("models gap confidence separately from research priority", () => {
    const gap = new ResearchGapModel({
      topic: "AI testing",
      normalizedTopic: "ai testing",
      title: "Industrial evidence gap",
      description: "Limited industrial evidence",
      rationale: "Important adoption decision",
      source: "standalone",
      userId: oid(),
      gapConfidence: "LOW",
      researchPriority: "HIGH",
    });
    expect(gap.validateSync()).toBeUndefined();
    expect(gap.gapConfidence).toBe("LOW");
    expect(gap.researchPriority).toBe("HIGH");
  });

  it("rejects unsupported gap types and validation actions", () => {
    const gap = new ResearchGapModel({ topic: "AI", normalizedTopic: "ai", title: "Gap", description: "Description", rationale: "Rationale", source: "standalone", userId: oid(), gapType: "MAGIC_AI_GAP" });
    expect(gap.validateSync()?.errors.gapType).toBeDefined();
    const validation = new GapValidationModel({ gapId: oid(), reviewerId: oid(), action: "AI_AUTO_VALIDATE", comment: "The model says this is true." });
    expect(validation.validateSync()?.errors.action).toBeDefined();
  });

  it("stores expert validation as append-only evidence", () => {
    expect(GapValidationModel.schema.path("action").options.immutable).toBe(true);
    expect(GapValidationModel.schema.path("comment").options.immutable).toBe(true);
  });

  it("keeps supporting and counter-evidence distinct and idempotent", () => {
    const index = GapEvidenceRecordModel.schema.indexes().find(([fields]) => fields.gapId === 1 && fields.paperId === 1 && fields.evidenceKind === 1);
    expect(index?.[1]).toMatchObject({ unique: true });
    const evidence = new GapEvidenceRecordModel({ gapId: oid(), paperId: oid(), evidenceKind: "COUNTER", explanation: "This study reports evidence in the allegedly missing context.", addedBy: oid() });
    expect(evidence.validateSync()).toBeUndefined();
  });
});
