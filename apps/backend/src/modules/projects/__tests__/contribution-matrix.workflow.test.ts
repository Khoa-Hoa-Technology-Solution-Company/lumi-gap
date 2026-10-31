import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { allocationService as allocations } from "../allocation.service.js";
import { workContributionsService as work } from "../work-contributions.service.js";
import { projectTasksService as tasks } from "../project-tasks.service.js";
import { projectService } from "../project.service.js";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";
import type { ContributionMatrixCategoryInput } from "@trend/shared-types";

describe.sequential("Contribution Matrix + Supporting Evidence + Member Confirmation workflow (PostgreSQL)", () => {
  const db = getPrisma();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let memberA: string; // Project owner / coordinator
  let memberB: string;
  let memberC: string;
  let outsider: string;

  async function createPerson(name: string) {
    const u = await db.user.create({
      data: {
        fullName: name,
        email: `matrix-${name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID()}@example.org`,
        emailVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
      },
    });
    createdUserIds.push(u.id);
    await db.academicProfile.create({
      data: {
        userId: u.id,
        primaryPosition: "RESEARCH_STAFF",
        academicRole: "RESEARCHER",
      },
    });
    return u.id;
  }

  async function createThreeMemberProject() {
    // Ensure deterministic ID ordering for A, B, C regardless of random UUID order
    const p = await createProjectFixture({
      data: {
        title: "Evidence-Based Matrix Project",
        ownerId: memberA,
        visibility: "PRIVATE",
        status: "ACTIVE",
        createdAt: new Date(Date.now() - 7 * 86400000),
      },
    });
    createdProjectIds.push(p.id);
    await db.projectMember.create({ data: { projectId: p.id, userId: memberB, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: p.id, userId: memberC, status: "ACTIVE" } });
    return p.id;
  }

  beforeAll(async () => {
    memberA = await createPerson("Member A");
    memberB = await createPerson("Member B");
    memberC = await createPerson("Member C");
    outsider = await createPerson("Outsider");
  });

  afterAll(async () => {
    for (const pid of createdProjectIds) {
      await db.notification.deleteMany({ where: { targetUuid: pid } }).catch(() => undefined);
      await db.projectActivity.deleteMany({ where: { projectId: pid } }).catch(() => undefined);
    }
  });

  function buildExampleMatrixCategories(evidenceIdsByCategory?: Partial<Record<string, string[]>>): ContributionMatrixCategoryInput[] {
    return [
      {
        category: "CONCEPTUALIZATION_METHODOLOGY",
        weightBasisPoints: 2500, // 25%
        evidenceIds: evidenceIdsByCategory?.CONCEPTUALIZATION_METHODOLOGY ?? [],
        shares: [
          { userId: memberA, basisPoints: 5000, rationale: "Formulated research questions and protocol" },
          { userId: memberB, basisPoints: 3000, rationale: "Co-designed methodology" },
          { userId: memberC, basisPoints: 2000, rationale: "Reviewed protocol design" },
        ],
      },
      {
        category: "LITERATURE_DATA",
        weightBasisPoints: 2000, // 20%
        evidenceIds: evidenceIdsByCategory?.LITERATURE_DATA ?? [],
        shares: [
          { userId: memberA, basisPoints: 4000, rationale: "Screened primary corpus" },
          { userId: memberB, basisPoints: 4000, rationale: "Curated benchmark dataset" },
          { userId: memberC, basisPoints: 2000, rationale: "Extracted literature matrix rows" },
        ],
      },
      {
        category: "EXECUTION_VALIDATION",
        weightBasisPoints: 3500, // 35%
        evidenceIds: evidenceIdsByCategory?.EXECUTION_VALIDATION ?? [],
        shares: [
          { userId: memberA, basisPoints: 6000, rationale: "Implemented core experiments and validation" },
          { userId: memberB, basisPoints: 3000, rationale: "Performed statistical analysis" },
          { userId: memberC, basisPoints: 1000, rationale: "Verified reproducibility scripts" },
        ],
      },
      {
        category: "WRITING_REVISION",
        weightBasisPoints: 2000, // 20%
        evidenceIds: evidenceIdsByCategory?.WRITING_REVISION ?? [],
        shares: [
          { userId: memberA, basisPoints: 2000, rationale: "Drafted methodology section" },
          { userId: memberB, basisPoints: 5000, rationale: "Drafted main manuscript and results" },
          { userId: memberC, basisPoints: 3000, rationale: "Edited discussion and references" },
        ],
      },
    ];
  }

  it("collects categorized supporting evidence, deduplicates refs, and handles deleted source artifacts gracefully", async () => {
    const projectId = await createThreeMemberProject();
    const task = await tasks.save(projectId, memberA, {
      title: "Run ablation experiments",
      description: "Complete ablation study across 3 datasets",
      status: "DONE",
      blockedReason: "",
      assigneeId: memberA,
      milestoneId: null,
      dueAt: null,
      link: null,
      clientKey: crypto.randomUUID(),
    });

    // Submit evidence with duplicate task ref — should be deduplicated automatically
    const ev = await work.save(projectId, memberA, {
      title: "Ablation experiment execution",
      description: "Executed ablation runs and validated statistical significance across seeds",
      category: "EXECUTION_VALIDATION",
      source: "WORKSPACE",
      workDate: new Date().toISOString(),
      participants: [
        { userId: memberA, roles: ["SOFTWARE", "VALIDATION"] },
        { userId: memberB, roles: ["FORMAL_ANALYSIS"] },
      ],
      evidence: "Experiment logs and evaluation tables in repository",
      evidenceRefs: [
        { kind: "TASK", id: task.id },
        { kind: "TASK", id: task.id },
      ],
      clientKey: crypto.randomUUID(),
    });

    expect(ev.category).toBe("EXECUTION_VALIDATION");
    expect(ev.evidenceRefs).toHaveLength(1);
    expect(ev.evidenceRefDetails).toEqual([
      { kind: "TASK", id: task.id, available: true, label: null },
    ]);

    // Soft-delete the underlying task and verify evidence inspection handles unavailable artifact gracefully
    await db.projectTask.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });

    const afterDelete = await work.detail(projectId, memberA, ev.id);
    expect(afterDelete.evidenceRefs).toEqual([{ kind: "TASK", id: task.id }]);
    expect(afterDelete.evidenceRefDetails).toEqual([
      {
        kind: "TASK",
        id: task.id,
        available: false,
        label: "Artifact unavailable or removed from project",
      },
    ]);
  });

  it("executes the full workflow: Collect Evidence -> Propose Matrix (A 45.5%, B 36%, C 18.5%) -> Dispute -> Revise -> Confirm -> Finalize -> Version History", async () => {
    const projectId = await createThreeMemberProject();

    // 1. Collect Evidence
    const evConcept = await work.save(projectId, memberA, {
      title: "Research protocol & gap formulation",
      description: "Formulated core research questions and experimental methodology",
      category: "CONCEPTUALIZATION_METHODOLOGY",
      source: "MANUAL",
      workDate: new Date().toISOString(),
      participants: [
        { userId: memberA, roles: ["CONCEPTUALIZATION", "METHODOLOGY"] },
        { userId: memberB, roles: ["METHODOLOGY"] },
      ],
      evidence: "Approved research protocol v1",
      evidenceRefs: [],
      clientKey: crypto.randomUUID(),
    });
    await work.submit(projectId, memberA, evConcept.id, 1);

    const period = await allocations.createPeriod(projectId, memberA, {
      title: "Phase 1 — Full Research Cycle",
      description: "Agreed contribution matrix evaluation for Phase 1",
      scope: "Conceptualization, literature, execution, and manuscript drafting",
      periodStart: new Date(Date.now() - 3 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });

    // 2. Reject invalid matrix submission (weights not summing to 100%)
    const invalidCategories = buildExampleMatrixCategories();
    invalidCategories[0]!.weightBasisPoints = 1000; // Total weight = 85%
    const badDraft = await allocations.draft(projectId, memberA, period.id, {
      matrix: { categories: invalidCategories },
      rationale: "Draft with incomplete category weights that must fail on submit",
      clientKey: crypto.randomUUID(),
    });
    await expect(allocations.submit(projectId, memberA, badDraft.id, badDraft.draftVersion)).rejects.toMatchObject({
      statusCode: 400,
    });

    // 3. Edit draft with valid 4-category matrix (25% / 20% / 35% / 20%)
    const validCategories = buildExampleMatrixCategories({
      CONCEPTUALIZATION_METHODOLOGY: [evConcept.id],
    });
    const edited = await allocations.edit(projectId, memberA, badDraft.id, {
      matrix: { categories: validCategories },
      rationale: "Agreed 4-category contribution matrix based on documented Phase 1 deliverables",
      expectedVersion: badDraft.draftVersion,
    });

    const submittedV1 = await allocations.submit(projectId, memberA, edited.id, edited.draftVersion);
    expect(submittedV1.status).toBe("AWAITING_APPROVAL");
    expect(submittedV1.matrix).not.toBeNull();

    // Verify exact formula calculation: A = 45.5% (4550 bp), B = 36% (3600 bp), C = 18.5% (1850 bp)
    const shareMapV1 = new Map(submittedV1.shares.map((s) => [s.userId, s.basisPoints]));
    expect(shareMapV1.get(memberA)).toBe(4550);
    expect(shareMapV1.get(memberB)).toBe(3600);
    expect(shareMapV1.get(memberC)).toBe(1850);
    expect(submittedV1.shares.reduce((sum, s) => sum + s.basisPoints, 0)).toBe(10000);

    // 4. Prevent finalization while required confirmations are missing
    const afterA = await allocations.decide(projectId, memberA, submittedV1.id, {
      decision: "APPROVE",
      explanation: "",
    });
    expect(afterA.status).toBe("AWAITING_APPROVAL");
    expect(afterA.finalizedAt).toBeNull();

    const afterB = await allocations.decide(projectId, memberB, submittedV1.id, {
      decision: "APPROVE",
      explanation: "",
    });
    expect(afterB.status).toBe("AWAITING_APPROVAL");
    expect(afterB.finalizedAt).toBeNull();

    // 5. Member C disputes the allocation with a reason (and submits additional evidence)
    const evWritingC = await work.save(projectId, memberC, {
      title: "Additional reviewer response & discussion revision",
      description: "Completed literature comparison table and discussion section revisions",
      category: "WRITING_REVISION",
      source: "MANUAL",
      workDate: new Date().toISOString(),
      participants: [{ userId: memberC, roles: ["WRITING_REVIEW_EDITING"] }],
      evidence: "Revision diff in manuscript draft",
      evidenceRefs: [],
      clientKey: crypto.randomUUID(),
    });
    await work.submit(projectId, memberC, evWritingC.id, 1);

    const disputedV1 = await allocations.decide(projectId, memberC, submittedV1.id, {
      decision: "DISPUTE",
      explanation: "My writing and literature synthesis contribution is documented in the new evidence record.",
    });
    expect(disputedV1.status).toBe("DISPUTED");
    expect(disputedV1.finalizedAt).toBeNull();

    // Cannot export an unfinalized/disputed revision
    await expect(allocations.export(projectId, memberA, disputedV1.id)).rejects.toMatchObject({
      statusCode: 409,
    });

    // 6. Propose Revised Allocation (v2) linking C's new evidence, and all 3 members confirm
    const v2Categories = buildExampleMatrixCategories({
      CONCEPTUALIZATION_METHODOLOGY: [evConcept.id],
      WRITING_REVISION: [evWritingC.id],
    });
    const draftV2 = await allocations.draft(projectId, memberA, period.id, {
      matrix: { categories: v2Categories },
      rationale: "Revision v2 incorporating Member C's additional writing evidence and team consensus",
      clientKey: crypto.randomUUID(),
    });
    expect(draftV2.revision).toBe(2);
    const submittedV2 = await allocations.submit(projectId, memberA, draftV2.id, draftV2.draftVersion);

    await allocations.decide(projectId, memberA, submittedV2.id, { decision: "APPROVE", explanation: "" });
    await allocations.decide(projectId, memberB, submittedV2.id, { decision: "APPROVE", explanation: "" });
    const finalizedV2 = await allocations.decide(projectId, memberC, submittedV2.id, {
      decision: "APPROVE",
      explanation: "Confirmed after reviewing linked writing evidence",
    });

    expect(finalizedV2.status).toBe("FINALIZED");
    expect(finalizedV2.finalizedAt).not.toBeNull();
    expect(finalizedV2.finalizedBy?.id).toBe(memberC);
    expect(finalizedV2.proposedBy?.id).toBe(memberA);

    // 7. Recording new task/activity events does NOT alter finalized or agreed percentages
    await tasks.save(projectId, memberC, {
      title: "Post-finalization formatting task",
      description: "Formatted bibliography entries",
      status: "DONE",
      blockedReason: "",
      assigneeId: memberC,
      milestoneId: null,
      dueAt: null,
      link: null,
      clientKey: crypto.randomUUID(),
    });
    const recheckedV2 = await allocations.detail(projectId, memberA, finalizedV2.id);
    expect(new Map(recheckedV2.shares.map((s) => [s.userId, s.basisPoints]))).toEqual(
      new Map([
        [memberA, 4550],
        [memberB, 3600],
        [memberC, 1850],
      ]),
    );

    // 8. Reopen through a new version (v3) without deleting v2 or v1 history, and test concurrent finalization
    const draftV3 = await allocations.draft(projectId, memberA, period.id, {
      matrix: { categories: v2Categories },
      rationale: "Amendment v3 after final documentation review, preserving v1 and v2 history",
      clientKey: crypto.randomUUID(),
    });
    expect(draftV3.revision).toBe(3);
    const submittedV3 = await allocations.submit(projectId, memberA, draftV3.id, draftV3.draftVersion);

    await allocations.decide(projectId, memberA, submittedV3.id, { decision: "APPROVE", explanation: "" });
    const concurrentResults = await Promise.all([
      allocations.decide(projectId, memberB, submittedV3.id, { decision: "APPROVE", explanation: "" }),
      allocations.decide(projectId, memberC, submittedV3.id, { decision: "APPROVE", explanation: "" }),
    ]);
    expect(concurrentResults.some((r) => r.status === "FINALIZED")).toBe(true);

    const history = await allocations.history(projectId, memberA, period.id);
    expect(history.map((h) => ({ revision: h.revision, status: h.status }))).toEqual([
      { revision: 3, status: "FINALIZED" },
      { revision: 2, status: "SUPERSEDED" },
      { revision: 1, status: "DISPUTED" },
    ]);

    // Evidence records remain intact across all allocation revisions
    const allWork = await work.list(projectId, memberA, { page: 1, pageSize: 20, q: "", filter: "TEAM" });
    expect(allWork.total).toBe(2);
  });

  it("prevents unauthorized modifications and blocks confirming on another member's behalf over HTTP", async () => {
    const projectId = await createThreeMemberProject();
    const period = await allocations.createPeriod(projectId, memberA, {
      title: "Security Verification Scope",
      description: "Testing permission boundaries and HTTP payload strictness",
      scope: "Full team verification",
      periodStart: new Date(Date.now() - 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });

    // Non-owner member cannot create or propose an allocation draft
    await expect(
      allocations.draft(projectId, memberB, period.id, {
        matrix: { categories: buildExampleMatrixCategories() },
        rationale: "Unauthorized member attempt to propose allocation",
        clientKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Outsider cannot view or decide
    const draft = await allocations.draft(projectId, memberA, period.id, {
      matrix: { categories: buildExampleMatrixCategories() },
      rationale: "Authorized coordinator matrix proposal for HTTP verification",
      clientKey: crypto.randomUUID(),
    });
    const submitted = await allocations.submit(projectId, memberA, draft.id, draft.draftVersion);

    await expect(allocations.detail(projectId, outsider, submitted.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    const app = express();
    app.use(express.json());
    app.use("/projects", projectRouter);
    app.use(errorHandler);
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;

    const sessionId = crypto.randomUUID();
    await db.refreshToken.create({
      data: {
        userId: memberB,
        familyId: sessionId,
        tokenHash: hashOpaqueToken(crypto.randomUUID()),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const token = tokenService.signAccessToken({ sub: memberB, systemRole: "USER", sessionId }).token;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    try {
      // Attempt by memberB to confirm on memberC's behalf by injecting userId in body -> rejected with 400
      const spoofed = await fetch(
        `http://127.0.0.1:${port}/projects/${projectId}/contributions/revisions/${submitted.id}/decisions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ decision: "APPROVE", userId: memberC }),
        },
      );
      expect(spoofed.status).toBe(400);

      // Valid confirmation by memberB
      const validResp = await fetch(
        `http://127.0.0.1:${port}/projects/${projectId}/contributions/revisions/${submitted.id}/decisions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ decision: "APPROVE", explanation: "Confirmed my matrix shares" }),
        },
      );
      expect(validResp.status).toBe(200);
      const body = (await validResp.json()) as { data: { status: string; matrix: { memberTotals: { userId: string; basisPoints: number }[] } } };
      expect(body.data.status).toBe("AWAITING_APPROVAL");
      expect(body.data.matrix.memberTotals.find((m) => m.userId === memberA)?.basisPoints).toBe(4550);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("handles member departure and new member joining during an active proposal", async () => {
    const projectId = await createThreeMemberProject();
    // Member C leaves before the proposal is drafted, but had membership during the period -> retained in roster
    await projectService.removeMemberFromProject(projectId, memberC, memberA);
    const period = await allocations.createPeriod(projectId, memberA, {
      title: "Membership Transition Scope",
      description: "Includes departed member C who was active during the period",
      scope: "Research work across membership change",
      periodStart: new Date(Date.now() - 2 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });
    expect(period.roster.map((p) => p.id)).toContain(memberC);

    const draft = await allocations.draft(projectId, memberA, period.id, {
      matrix: { categories: buildExampleMatrixCategories() },
      rationale: "Proposal preserving departed member C's agreed share",
      clientKey: crypto.randomUUID(),
    });
    const submitted = await allocations.submit(projectId, memberA, draft.id, draft.draftVersion);

    // Now a 4th member joins with a backdated joinedAt inside the period -> roster changed -> next decision marks proposal DISPUTED
    const memberD = await createPerson("Member D");
    await db.projectMember.create({
      data: {
        projectId,
        userId: memberD,
        status: "ACTIVE",
        joinedAt: new Date(Date.now() - 3600000),
      },
    });

    const afterRosterChange = await allocations.decide(projectId, memberA, submitted.id, {
      decision: "APPROVE",
      explanation: "",
    });
    expect(afterRosterChange.status).toBe("DISPUTED");
  });

  it("preserves legacy contribution records and ensures project contribution never auto-assigns publication authorship", async () => {
    const projectId = await createThreeMemberProject();

    // Insert a legacy academic contribution proposal
    const legacy = await db.projectContributionProposal.create({
      data: {
        projectId,
        contributorId: memberB,
        proposedById: memberA,
        roles: ["CONCEPTUALIZATION", "WRITING_ORIGINAL_DRAFT"],
        title: "Legacy 2025 Contribution Record",
        description: "Historical contribution recorded before Contribution Matrix v1",
        source: "LEGACY",
        status: "CONFIRMED",
        confirmationRequiredFrom: "CONTRIBUTOR",
        confirmedById: memberB,
        confirmedAt: new Date(Date.now() - 86400000),
      },
    });
    await db.contributionParticipant.create({
      data: {
        proposalId: legacy.id,
        userId: memberB,
        roles: ["CONCEPTUALIZATION", "WRITING_ORIGINAL_DRAFT"],
      },
    });

    // Legacy record is preserved and its category is deterministically inferred
    const legacyDetail = await work.detail(projectId, memberA, legacy.id);
    expect(legacyDetail.id).toBe(legacy.id);
    expect(legacyDetail.source).toBe("LEGACY");
    expect(legacyDetail.category).toBe("CONCEPTUALIZATION_METHODOLOGY");
    expect(legacyDetail.canManage).toBe(false);

    // Finalize a project contribution matrix where Member A has 45.5%, B has 36%, C has 18.5%
    const period = await allocations.createPeriod(projectId, memberA, {
      title: "Authorship Independence Scope",
      description: "Verifying project contribution does not auto-assign publication authorship",
      scope: "Project-wide research contribution",
      periodStart: new Date(Date.now() - 2 * 86400000).toISOString(),
      periodEnd: new Date().toISOString(),
      clientKey: crypto.randomUUID(),
    });
    const draft = await allocations.draft(projectId, memberA, period.id, {
      matrix: { categories: buildExampleMatrixCategories() },
      rationale: "Internal project contribution agreement separate from publication authorship",
      clientKey: crypto.randomUUID(),
    });
    const submitted = await allocations.submit(projectId, memberA, draft.id, draft.draftVersion);
    await allocations.decide(projectId, memberA, submitted.id, { decision: "APPROVE", explanation: "" });
    await allocations.decide(projectId, memberB, submitted.id, { decision: "APPROVE", explanation: "" });
    const finalized = await allocations.decide(projectId, memberC, submitted.id, { decision: "APPROVE", explanation: "" });
    expect(finalized.status).toBe("FINALIZED");

    // Exported snapshot explicitly documents that it does not determine authorship eligibility or author order
    const exported = await allocations.export(projectId, memberA, finalized.id);
    expect(exported.meaning).toContain("Not a grade, legal entitlement, authorship eligibility, author order");

    // No publication submission or author ordering is automatically created or modified by finalizing project contribution
    const submissionsCount = await db.submission.count({ where: { projectId } });
    expect(submissionsCount).toBe(0);
  });
});
