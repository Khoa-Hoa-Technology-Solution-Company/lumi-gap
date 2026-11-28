import { describe, expect, it, vi } from "vitest";
import { buildScopedIntegrityEvidence, sanitizeIntegrityChecks } from "../review.service.js";

function createMockPrisma(overrides: {
  mentorAccess?: { permissions: string[] } | null;
  snapshotRecords?: Array<{ id: string; kind: string; version: number; content: unknown; createdAt: Date }>;
  attributionCheck?: { id: string; status: string; createdAt: Date } | null;
  declaredConflictCount?: number;
  latestAiPreReview?: {
    citationIssues?: string[];
    unsupportedClaims?: string[];
    reviewFocusAreas?: string[];
  } | null;
} = {}) {
  return {
    mentorAccess: {
      findFirst: vi.fn().mockResolvedValue(overrides.mentorAccess ?? null),
    },
    manuscriptIntegrityRecord: {
      findMany: vi.fn().mockResolvedValue(overrides.snapshotRecords ?? []),
    },
    manuscriptAttributionCheck: {
      findUnique: vi.fn().mockResolvedValue(overrides.attributionCheck ?? null),
    },
    submissionDeclaredConflict: {
      count: vi.fn().mockResolvedValue(overrides.declaredConflictCount ?? 0),
    },
    aiPreReview: {
      findFirst: vi.fn().mockResolvedValue(overrides.latestAiPreReview ?? null),
    },
  };
}

describe("Compact Research Integrity — Backend Sanitization & Evidence Scoping", () => {
  it("strips stale notes from CHECKED and NOT_APPLICABLE while trimming CONCERN notes (INT-09)", () => {
    const sanitized = sanitizeIntegrityChecks({
      authorship: { status: "CHECKED", note: "Stale concern note that must not persist" },
      ethics: { status: "NOT_APPLICABLE", note: "Old note from previous CONCERN state" },
      data: { status: "CONCERN", note: "  Missing data availability appendix in Section 4.  " },
      borrowing: { status: "CONCERN", note: "   " },
    });

    expect(sanitized).toEqual({
      authorship: { status: "CHECKED" },
      ethics: { status: "NOT_APPLICABLE" },
      data: { status: "CONCERN", note: "Missing data availability appendix in Section 4." },
      borrowing: { status: "CONCERN" },
    });
    expect(sanitizeIntegrityChecks(undefined)).toBeUndefined();
  });

  it("returns RESTRICTED for authorship when peer reviewer lacks mentor guidance and CONTRIBUTIONS_VIEW (SEC-01..04)", async () => {
    const prisma = createMockPrisma({
      mentorAccess: null,
      declaredConflictCount: 2,
    });

    const evidence = await buildScopedIntegrityEvidence({
      prisma: prisma as never,
      assignment: { id: "assign-1", reviewerId: "rev-1", mentorAccessId: null, conflictChecks: null },
      request: { origin: "DIRECT_INVITATION" },
      submission: {
        id: "sub-1",
        projectId: "proj-1",
        submissionType: "RESEARCH_PAPER",
        methodology: null,
        sourceReportId: null,
      },
      revision: {
        id: "rev-v1",
        revisionNumber: 1,
        contentType: "PDF",
        manuscriptSnapshotId: null,
        attributionCheckId: "attr-check-secret",
        integrityReportId: null,
      },
      authorCount: 3,
    });

    expect(evidence.authorship).toEqual({ access: "RESTRICTED", facts: [] });
    // Must not query private attribution check or snapshot records without permission/snapshotId
    expect(prisma.manuscriptAttributionCheck.findUnique).not.toHaveBeenCalled();
    expect(prisma.manuscriptIntegrityRecord.findMany).not.toHaveBeenCalled();
    // Conflicts exposes aggregate count only, never identities
    expect(evidence.conflicts).toEqual({
      access: "AVAILABLE",
      facts: [
        { label: "declared_conflicts_count", value: "2", tone: "neutral" },
        { label: "reviewer_coi_separate", value: "SEPARATE", tone: "info" },
      ],
    });
    expect(evidence.ai_disclosure).toEqual({ access: "EMPTY", facts: [] });
    expect(evidence.ethics).toEqual({ access: "EMPTY", facts: [] });
    expect(evidence.confidentiality).toEqual({ access: "EMPTY", facts: [] });
  });

  it("scopes snapshot records strictly to the assigned revision snapshot and surfaces authorized facts", async () => {
    const now = new Date("2026-11-25T10:00:00Z");
    const prisma = createMockPrisma({
      mentorAccess: { permissions: ["MENTOR_CHAT", "CONTRIBUTIONS_VIEW"] },
      attributionCheck: { id: "attr-1", status: "NEEDS_REVIEW", createdAt: now },
      declaredConflictCount: 0,
      snapshotRecords: [
        {
          id: "rec-cit",
          kind: "CITATION_AUDIT",
          version: 2,
          createdAt: now,
          content: {
            citedKeys: ["k1", "k2", "k3"],
            entries: [
              { metadata: "VERIFIED", evidence: { status: "OK" } },
              { metadata: "NEEDS_REVIEW", evidence: { status: "RETRACTED" } },
            ],
          },
        },
        {
          id: "rec-ai",
          kind: "AI_DECLARATION",
          version: 1,
          createdAt: now,
          content: {
            disclosure: "Used language polishing for abstract only.",
            externalUsage: [{ tool: "Grammarly", category: "EDITING" }],
          },
        },
        {
          id: "rec-rights",
          kind: "RIGHTS_DECLARATION",
          version: 1,
          createdAt: now,
          content: {
            restrictions: "Embargoed dataset — do not redistribute",
            thirdPartyContent: "Figure 2 adapted with permission",
            unresolvedQuestions: "Pending IRB exemption confirmation",
          },
        },
      ],
      latestAiPreReview: {
        citationIssues: ["Citation [4] year mismatch", "Unverified DOI in Ref [9]", "Third note trimmed"],
        unsupportedClaims: ["Claim in Section 3 lacks control baseline"],
      },
    });

    const evidence = await buildScopedIntegrityEvidence({
      prisma: prisma as never,
      assignment: { id: "assign-2", reviewerId: "mentor-1", mentorAccessId: "grant-1", conflictChecks: null },
      request: { origin: "MENTOR_GUIDANCE" },
      submission: {
        id: "sub-2",
        projectId: "proj-2",
        submissionType: "RESEARCH_PAPER",
        methodology: "Randomized crossover study",
        sourceReportId: null,
      },
      revision: {
        id: "rev-v2",
        revisionNumber: 2,
        contentType: "PDF",
        manuscriptSnapshotId: "snap-pinned-v2",
        attributionCheckId: "attr-1",
        integrityReportId: null,
      },
      authorCount: 4,
    });

    expect(prisma.manuscriptIntegrityRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "proj-2",
          snapshotId: "snap-pinned-v2",
        }),
      }),
    );

    expect(evidence.authorship).toEqual({
      access: "AVAILABLE",
      facts: [
        { label: "submission_authors", value: "4", tone: "neutral" },
        { label: "attribution_snapshot", value: "NEEDS_REVIEW", tone: "attention" },
      ],
    });
    expect(evidence.borrowing?.access).toBe("AVAILABLE");
    expect(evidence.borrowing?.advisoryNotes).toEqual([
      "Citation [4] year mismatch",
      "Unverified DOI in Ref [9]",
    ]);
    expect(evidence.sources?.facts).toEqual([
      { label: "citation_entries", value: "2", tone: "neutral" },
      { label: "citation_metadata_verified", value: "1/2", tone: "info" },
      { label: "citation_metadata_review", value: "1", tone: "attention" },
      { label: "citation_retracted_notice", value: "1", tone: "attention" },
    ]);
    expect(evidence.data?.facts).toEqual([
      { label: "assigned_artifact", value: "v2 (PDF)", tone: "neutral" },
      { label: "methodology_declared", value: "YES", tone: "info" },
      { label: "ai_unsupported_claims", value: "1", tone: "info" },
    ]);
    expect(evidence.ai_disclosure?.access).toBe("AVAILABLE");
    expect(evidence.ethics?.facts[0]).toMatchObject({ label: "unresolved_questions", tone: "attention" });
    expect(evidence.confidentiality?.facts.map((f) => f.label)).toEqual([
      "sharing_restrictions",
      "third_party_content",
    ]);
  });
});
