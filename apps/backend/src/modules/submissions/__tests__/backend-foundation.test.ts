import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { AiRunModel } from "../../ai-jobs/ai-run.model.js";
import { SectionRevisionModel, WorkspaceSectionModel } from "../../workspaces/workspace.model.js";
import { ReviewerAssignmentModel, SubmissionRevisionModel } from "../submission.model.js";

const oid = () => new mongoose.Types.ObjectId();

describe("backend collaboration data invariants", () => {
  it("requires a SHA-256 checksum and hides original submission filenames by default", () => {
    const revision = new SubmissionRevisionModel({
      submissionId: oid(),
      revisionNumber: 1,
      uploadedBy: oid(),
      storageUri: "/uploads/revision.pdf",
      checksumSha256: "not-a-sha256",
      sizeBytes: 100,
      originalFileName: "identity-revealing-name.pdf",
    });

    expect(revision.validateSync()?.errors.checksumSha256).toBeDefined();
    expect(SubmissionRevisionModel.schema.path("originalFileName").options.select).toBe(false);
    expect(SubmissionRevisionModel.schema.path("storageUri").options.immutable).toBe(true);
  });

  it("defines one reviewer assignment per submission and reviewer", () => {
    const uniqueIndex = ReviewerAssignmentModel.schema.indexes().find(([fields]) =>
      fields.submissionId === 1 && fields.reviewerId === 1,
    );
    expect(uniqueIndex?.[1]).toMatchObject({ unique: true });
  });

  it("keeps section snapshots immutable and section versions positive", () => {
    expect(SectionRevisionModel.schema.path("content").options.immutable).toBe(true);
    const invalidSection = new WorkspaceSectionModel({
      workspaceId: oid(),
      title: "Introduction",
      content: "Draft",
      order: 0,
      version: 0,
      createdBy: oid(),
      updatedBy: oid(),
    });
    expect(invalidSection.validateSync()?.errors.version).toBeDefined();
  });

  it("rejects non-allowlisted AI job types and negative cost", () => {
    const run = new AiRunModel({
      ownerId: oid(),
      jobType: "arbitrary_remote_code",
      costUsd: -1,
    });
    const errors = run.validateSync()?.errors;
    expect(errors?.jobType).toBeDefined();
    expect(errors?.costUsd).toBeDefined();
  });
});
