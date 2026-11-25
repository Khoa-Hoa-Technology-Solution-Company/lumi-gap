import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { maintainScreeningCases } from "../screening-case-maintenance.js";
import { projectEvidenceService } from "../project-evidence.service.js";
import { projectEvidenceWorkspaceService } from "../project-evidence-workspace.service.js";
import { projectMentorshipService } from "../project-mentorship.service.js";
import { screeningQueue } from "../screening-slots.js";
import { withWorkspace } from "../workspace-access.js";
import { mentorPresets, type ScreeningChoice, type ScreeningRescreenReasonCategory, type ScreeningStageMode } from "@trend/shared-types";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));

const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) {
  throw new Error("Isolated test DB required");
}

describe.skipIf(!enabled).sequential("Re-screening & Decision Revision workflow (PostgreSQL)", () => {
  const db = getPrisma();
  const key = () => randomUUID();
  let owner: string, revA: string, revB: string, memberC: string, mentorUser: string, outsider: string;

  beforeAll(async () => {
    const users = [
      { name: "Project Owner", role: "RESEARCHER" as const, pos: "RESEARCH_STAFF" as const },
      { name: "Reviewer A", role: "RESEARCHER" as const, pos: "RESEARCH_STAFF" as const },
      { name: "Reviewer B", role: "RESEARCHER" as const, pos: "RESEARCH_STAFF" as const },
      { name: "Regular Member C", role: "RESEARCHER" as const, pos: "RESEARCH_STAFF" as const },
      { name: "Project Mentor", role: "LECTURER" as const, pos: "LECTURER" as const },
      { name: "Outsider User", role: "RESEARCHER" as const, pos: "RESEARCH_STAFF" as const },
    ];
    const ids: string[] = [];
    for (const u of users) {
      const created = await db.user.create({
        data: {
          fullName: u.name,
          email: `${key()}@example.invalid`,
          emailVerifiedAt: new Date(),
          onboardingCompletedAt: new Date(),
        },
      });
      await db.academicProfile.create({
        data: {
          userId: created.id,
          academicRole: u.role,
          primaryPosition: u.pos,
          ...(u.role === "LECTURER"
            ? { roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } }
            : {}),
        },
      });
      ids.push(created.id);
    }
    [owner, revA, revB, memberC, mentorUser, outsider] = ids as [string, string, string, string, string, string];
  });

  afterAll(disconnectPostgres);

  async function setupProject(opts: {
    mode?: ScreeningStageMode;
    fullText?: boolean;
    withMentor?: boolean;
    exclusionCriteria?: string[];
  } = {}) {
    const mode = opts.mode ?? "SINGLE_STAGE";
    const project = await createProjectFixture({
      data: {
        title: `Rescreen fixture ${key().slice(0, 6)}`,
        ownerId: owner,
        status: "ACTIVE",
        ...(opts.withMentor
          ? {
              mentorshipSummary: "Systematic review mentorship scope for isolated testing",
              mentorshipNeeds: "Methodology review",
              mentorshipDiscovery: "SEEKING_MENTOR",
            }
          : {}),
      },
    });
    await db.projectMember.createMany({
      data: [revA, revB, memberC].map(userId => ({ projectId: project.id, userId, status: "ACTIVE" })),
    });
    if (opts.withMentor) {
      const req = await projectMentorshipService.request(project.id, owner, {
        mentorUserId: mentorUser,
        message: "Please advise our research methodology",
        idempotencyKey: key(),
        access: { preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null },
      });
      await projectMentorshipService.accept(project.id, req.id, mentorUser, "Accepted advisory role", req.accessPolicy?.version);
    }
    const paper = await db.paper.create({
      data: {
        title: "Clinical LLM evaluation in systematic literature screening",
        abstractText: "This controlled study evaluates dual-reviewer clinical literature screening with transparent inclusion methods.",
        publicationYear: 2025,
        primaryProvider: "user",
        dataStatus: "active",
        ...(opts.fullText ? { openAccessUrl: "https://example.invalid/fulltext.pdf" } : {}),
      },
    });
    await db.projectPaper.create({
      data: { projectId: project.id, paperId: paper.id, addedById: owner },
    });
    await service.configure(project.id, owner, {
      screeningMode: mode,
      reviewMode: "INDEPENDENT",
      requiredReviewers: 2,
      consensusPolicy: "UNANIMOUS",
      expectedVersion: 0,
      aiAssisted: false,
      inclusionCriteria: ["Empirical evaluation study"],
      exclusionCriteria: opts.exclusionCriteria ?? ["Wrong study design", "Out of scope"],
      researchQuestions: ["RQ1: How effective is dual screening?"],
      clientKey: key(),
    });
    const started = await service.start(project.id, owner, {
      paperIds: [paper.id],
      phase: "TITLE_ABSTRACT",
      confirmRescreen: false,
      clientKey: key(),
    });
    const roundId = started.roundIds![0]!;
    await service.assign(project.id, owner, {
      roundIds: [roundId],
      reviewerIds: [revA, revB],
      mode: "MANUAL",
      dueAt: null,
      clientKey: key(),
    });
    return { projectId: project.id, paperId: paper.id, roundId };
  }

  type Fixture = Awaited<ReturnType<typeof setupProject>>;

  async function vote(f: Fixture, actor: string, decision: ScreeningChoice, roundId = f.roundId, exclusionReason = "Wrong study design") {
    const round = await service.detail(f.projectId, actor, roundId);
    const slot = round.assignments.find(a => a.id === round.myAssignmentId)!;
    return service.submit(f.projectId, actor, roundId, {
      assignmentId: slot.id,
      expectedRevision: slot.revision,
      decision,
      exclusionReason: decision === "EXCLUDE" ? exclusionReason : "",
      comment: decision === "INCLUDE" ? "Meets empirical evaluation inclusion criteria" : "Does not meet methodology requirement",
      fullTextReference: round.phase === "FULL_TEXT" ? "Full-text PDF section 3.2 methods" : undefined,
      confirmed: true,
      clientKey: key(),
    });
  }

  async function finalizeRound(f: Fixture, target: "INCLUDED" | "EXCLUDED" | "CLOSED_UNRESOLVED", roundId = f.roundId) {
    if (target === "INCLUDED") {
      await vote(f, revA, "INCLUDE", roundId);
      await vote(f, revB, "INCLUDE", roundId);
    } else if (target === "EXCLUDED") {
      await vote(f, revA, "EXCLUDE", roundId);
      await vote(f, revB, "EXCLUDE", roundId);
    } else {
      await vote(f, revA, "INCLUDE", roundId);
      await vote(f, revB, "EXCLUDE", roundId);
      const r = await service.detail(f.projectId, revA, roundId);
      const prop = await service.proposeAgreement(f.projectId, revA, roundId, {
        expectedVersion: r.version,
        decision: "CLOSED_UNRESOLVED",
        reason: "Hai reviewer chưa thể thống nhất cách diễn giải tiêu chí phương pháp",
        reviewIds: r.reviews.map(x => x.id),
        confirmed: true,
        retrieveFullText: false,
        clientKey: key(),
      });
      const r2 = await service.detail(f.projectId, revB, roundId);
      await service.confirmAgreement(f.projectId, revB, roundId, {
        expectedVersion: r2.version,
        proposalId: prop.id!,
        confirmed: true,
        clientKey: key(),
      });
    }
    return service.detail(f.projectId, owner, roundId);
  }

  async function rescreen(
    f: Fixture,
    actor: string,
    roundId: string,
    opts: {
      reasonCategory?: ScreeningRescreenReasonCategory;
      reason?: string;
      targetPhase?: "TITLE_ABSTRACT" | "FULL_TEXT";
      expectedVersion?: number;
      clientKey?: string;
    } = {}
  ) {
    const current = await service.detail(f.projectId, actor, roundId);
    return service.reopenUnresolved(f.projectId, actor, roundId, {
      expectedVersion: opts.expectedVersion ?? current.version,
      reasonCategory: opts.reasonCategory ?? "NEW_INFORMATION",
      reason: opts.reason ?? "Phát hiện thông tin phương pháp mới sau khi đọc kỹ toàn văn",
      ...(opts.targetPhase ? { targetPhase: opts.targetPhase } : {}),
      clientKey: opts.clientKey ?? key(),
    });
  }

  // ── PERMISSION TESTS (1–7) ─────────────────────────────────────────────────
  describe("Permission Tests (Phase 2 & 13.1-7)", () => {
    it("1. Assigned Reviewer A can reopen a finalized paper without approval", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");
      const viewA = await service.detail(f.projectId, revA, f.roundId);
      expect(viewA.canReopenUnresolved).toBe(true);

      const opened = await rescreen(f, revA, f.roundId, {
        reasonCategory: "NEW_INFORMATION",
        reason: "Reviewer A phát hiện dữ liệu phương pháp mới cần xem lại",
      });
      const round2 = await service.detail(f.projectId, revA, opened.roundId!);
      expect(round2.number).toBe(2);
      expect(round2.rescreening).toBe(true);
      expect(round2.rescreenContext?.openedById).toBe(revA);
      expect(round2.rescreenContext?.reasonCategory).toBe("NEW_INFORMATION");
    });

    it("2. Assigned Reviewer B can reopen a finalized paper without approval", async () => {
      const f = await setupProject();
      await finalizeRound(f, "EXCLUDED");
      const viewB = await service.detail(f.projectId, revB, f.roundId);
      expect(viewB.canReopenUnresolved).toBe(true);

      const opened = await rescreen(f, revB, f.roundId, {
        reasonCategory: "PREVIOUS_DECISION_ERROR",
        reason: "Reviewer B nhận thấy bài báo đáp ứng tiêu chí đưa vào",
      });
      const round2 = await service.detail(f.projectId, revB, opened.roundId!);
      expect(round2.number).toBe(2);
      expect(round2.rescreenContext?.openedById).toBe(revB);
      expect(round2.rescreenContext?.reasonCategory).toBe("PREVIOUS_DECISION_ERROR");
    });

    it("3 & 4. Project Owner can reopen, but CANNOT vote on behalf of reviewers when unassigned", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");
      const opened = await rescreen(f, owner, f.roundId, {
        reasonCategory: "CRITERIA_CHANGED",
        reason: "Tiêu chí đối tượng nghiên cứu được làm rõ trong cuộc họp nhóm",
      });
      const round2Owner = await service.detail(f.projectId, owner, opened.roundId!);
      expect(round2Owner.canReview).toBe(false);
      expect(round2Owner.myAssignmentId).toBeNull();
      const slotA = round2Owner.assignments.find(a => a.reviewerId === revA)!;

      // Owner attempting to submit using Reviewer A's assignmentId must be rejected (403)
      await expect(
        service.submit(f.projectId, owner, opened.roundId!, {
          assignmentId: slotA.id,
          expectedRevision: slotA.revision,
          decision: "EXCLUDE",
          exclusionReason: "Wrong study design",
          comment: "Owner trying to vote for Reviewer A",
          confirmed: true,
          clientKey: key(),
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("5. Unassigned regular project member cannot reopen (403) and sees canReopenUnresolved=false", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");
      const viewC = await service.detail(f.projectId, memberC, f.roundId);
      expect(viewC.canReopenUnresolved).toBe(false);

      await expect(rescreen(f, memberC, f.roundId)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("6 & 7. Mentor without screening authority and outsider are rejected on backend", async () => {
      const f = await setupProject({ withMentor: true });
      const finalized = await finalizeRound(f, "INCLUDED");

      await expect(
        service.reopenUnresolved(f.projectId, mentorUser, f.roundId, {
          expectedVersion: finalized.version,
          reasonCategory: "OTHER",
          reason: "Mentor attempting unauthorized reopen",
          clientKey: key(),
        })
      ).rejects.toMatchObject({ statusCode: 404 });

      await expect(
        service.reopenUnresolved(f.projectId, outsider, f.roundId, {
          expectedVersion: finalized.version,
          reasonCategory: "OTHER",
          reason: "Outsider attempting unauthorized reopen",
          clientKey: key(),
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── RE-SCREENING TRANSITIONS, BLINDING & STAGE ACCURACY (8–18) ─────────────
  describe("Re-screening Transitions, Blinding & Stage Accuracy (Phase 5-7 & 13.8-18)", () => {
    it.each([
      { label: "8. Included -> Re-screen -> Excluded", from: "INCLUDED" as const, votes: ["EXCLUDE", "EXCLUDE"] as [ScreeningChoice, ScreeningChoice], expected: "EXCLUDED" },
      { label: "9. Excluded -> Re-screen -> Included", from: "EXCLUDED" as const, votes: ["INCLUDE", "INCLUDE"] as [ScreeningChoice, ScreeningChoice], expected: "INCLUDED" },
      { label: "10. Closed Without Consensus -> Re-screen -> Included", from: "CLOSED_UNRESOLVED" as const, votes: ["INCLUDE", "INCLUDE"] as [ScreeningChoice, ScreeningChoice], expected: "INCLUDED" },
      { label: "11. Included -> Re-screen -> Included", from: "INCLUDED" as const, votes: ["INCLUDE", "INCLUDE"] as [ScreeningChoice, ScreeningChoice], expected: "INCLUDED" },
      { label: "12. Included -> Re-screen -> Conflict", from: "INCLUDED" as const, votes: ["INCLUDE", "EXCLUDE"] as [ScreeningChoice, ScreeningChoice], expected: "CONSENSUS_REQUIRED" },
    ])("$label (with Blind Screening & published result preservation)", async t => {
      const f = await setupProject();
      await finalizeRound(f, t.from);
      const opened = await rescreen(f, revA, f.roundId);
      const r2 = opened.roundId!;

      // 13. While Round 2 has 0 or 1 vote, published result stays at t.from and Blind Screening holds
      await vote(f, revA, t.votes[0], r2);
      const blindB = await service.detail(f.projectId, revB, r2);
      expect(blindB.rescreening).toBe(true);
      expect(blindB.publishedResult?.status).toBe(t.from);
      expect(blindB.hiddenReviews).toBe(true);
      expect(blindB.reviews).toHaveLength(0);
      // Reopen reason IS visible even while ballots are blinded, without leaking revA's ballot
      const histB = await service.history(f.projectId, revB, r2, 1, "HISTORY");
      expect(histB.items.some(i => i.type === "RESCREENING_STARTED" && i.details?.reason)).toBe(true);
      expect(histB.items.some(i => i.type === "REVIEW_SUBMITTED" && i.details !== null)).toBe(false);

      await vote(f, revB, t.votes[1], r2);
      const after = await service.detail(f.projectId, revA, r2);
      expect(after.status).toBe(t.expected);
      if (t.expected === "CONSENSUS_REQUIRED") {
        expect(after.rescreening).toBe(true);
        expect(after.publishedResult?.status).toBe("INCLUDED");
      } else {
        expect(after.rescreening).toBe(false);
        expect(after.finalDecision?.decision).toBe(t.expected);
      }
    });

    it("14 & 15. Prevents duplicate active rounds, stores structured reason without mutating project protocol", async () => {
      const f = await setupProject();
      const finalized = await finalizeRound(f, "INCLUDED");
      const settingsBefore = await service.config(f.projectId, owner);

      const opened = await rescreen(f, revA, f.roundId, {
        reasonCategory: "CRITERIA_CHANGED",
        reason: "Cần đối chiếu lại theo tiêu chí năm xuất bản mới thảo luận",
      });
      // Re-submitting reopen on old round fails (409)
      await expect(
        service.reopenUnresolved(f.projectId, revB, f.roundId, {
          expectedVersion: finalized.version,
          reasonCategory: "OTHER",
          reason: "Second attempt on old round",
          clientKey: key(),
        })
      ).rejects.toMatchObject({ statusCode: 409 });
      // Opening another round while Round 2 is in progress also fails (409)
      const r2 = await service.detail(f.projectId, owner, opened.roundId!);
      await expect(
        service.reopenUnresolved(f.projectId, owner, opened.roundId!, {
          expectedVersion: r2.version,
          reasonCategory: "OTHER",
          reason: "Attempt while round 2 is pending",
          clientKey: key(),
        })
      ).rejects.toMatchObject({ statusCode: 409 });

      expect(await db.screeningRound.count({ where: { projectId: f.projectId, paperId: f.paperId, active: true } })).toBe(1);
      // Project settings were NOT silently modified
      const settingsAfter = await service.config(f.projectId, owner);
      expect(settingsAfter.settings.version).toBe(settingsBefore.settings.version);
      expect(settingsAfter.settings.inclusionCriteria).toEqual(settingsBefore.settings.inclusionCriteria);
      expect(r2.rescreenContext).toMatchObject({
        reasonCategory: "CRITERIA_CHANGED",
        reason: "Cần đối chiếu lại theo tiêu chí năm xuất bản mới thảo luận",
        previousRoundNumber: 1,
        previousStatus: "INCLUDED",
      });
    });

    it("16 & 17. Handles removed reviewer safely: retains active reviewer, opens slot in queue, allows Owner replacement", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");
      // Reviewer B leaves project before re-screening
      await db.projectMember.update({
        where: { projectId_userId: { projectId: f.projectId, userId: revB } },
        data: { status: "REMOVED" },
      });

      const opened = await rescreen(f, revA, f.roundId);
      const r2Owner = await service.detail(f.projectId, owner, opened.roundId!);
      expect(r2Owner.assignments.map(a => a.reviewerId)).toEqual([revA]);
      expect(r2Owner.canAssignReviewers).toBe(true);
      expect(r2Owner.rescreenContext?.removedReviewerIds).toContain(revB);

      // Open slot is surfaced in Screening Queue for eligible Member C
      const queueC = await withWorkspace(f.projectId, memberC, {}, c => screeningQueue(c));
      expect(queueC.some(q => q.roundId === opened.roundId)).toBe(true);

      // Owner was notified because a reviewer slot needs replacement
      expect(await db.notification.count({
        where: { targetUuid: f.projectId, userId: owner, title: "Có vòng đánh giá lại bài báo cần thực hiện" },
      })).toBe(1);

      // Owner assigns Member C as replacement reviewer (still exactly 2 reviewers, never a 3rd)
      await service.assign(f.projectId, owner, {
        roundIds: [opened.roundId!],
        mode: "MANUAL",
        reviewerIds: [revA, memberC],
        dueAt: null,
        clientKey: key(),
      });
      const r2After = await service.detail(f.projectId, owner, opened.roundId!);
      expect(r2After.assignments.map(a => a.reviewerId).sort()).toEqual([revA, memberC].sort());
    });

    it("18. Stage accuracy (Phase 5 Cases B, C, D, F): reopens correct stage and safely invalidates dependent stage", async () => {
      // Case B & C: Two-stage paper passes Title/Abstract -> Excluded at Full-text -> Re-screen opens Full-text (keeps Abstract untouched)
      const f = await setupProject({ mode: "TWO_STAGE", fullText: true });
      await vote(f, revA, "INCLUDE");
      await vote(f, revB, "INCLUDE");
      const ftRound = await db.screeningRound.findFirstOrThrow({
        where: { projectId: f.projectId, paperId: f.paperId, active: true },
      });
      expect(ftRound.phase).toBe("FULL_TEXT");
      await service.assign(f.projectId, owner, { roundIds: [ftRound.id], mode: "MANUAL", reviewerIds: [revA, revB], dueAt: null, clientKey: key() });
      await finalizeRound(f, "EXCLUDED", ftRound.id);

      const ftRescreen = await rescreen(f, revA, ftRound.id, { reasonCategory: "PREVIOUS_DECISION_ERROR", reason: "Đọc lại phần thí nghiệm toàn văn" });
      const ftRound3 = await service.detail(f.projectId, revA, ftRescreen.roundId!);
      expect(ftRound3.phase).toBe("FULL_TEXT");
      expect(ftRound3.number).toBe(3);

      // Finalize Full-text Round 3 as INCLUDED, then test Case F (reopen parent TITLE_ABSTRACT stage)
      await finalizeRound(f, "INCLUDED", ftRound3.id);
      const ftView = await service.detail(f.projectId, revA, ftRound3.id);
      expect(ftView.canRescreenStages).toEqual(["FULL_TEXT", "TITLE_ABSTRACT"]);

      const caseF = await rescreen(f, revA, ftRound3.id, {
        targetPhase: "TITLE_ABSTRACT",
        reasonCategory: "NEW_INFORMATION",
        reason: "Kiểm tra lại phạm vi nghiên cứu ngay từ vòng tóm tắt",
      });
      const absRound4 = await service.detail(f.projectId, revA, caseF.roundId!);
      expect(absRound4.phase).toBe("TITLE_ABSTRACT");
      expect(absRound4.rescreenContext?.invalidatedRoundIds).toContain(ftRound3.id);
      // Old Full-text round history & ballots are preserved, marked invalidated
      const oldFt = await service.detail(f.projectId, revA, ftRound3.id);
      expect(oldFt.invalidated).toBe(true);
      expect(oldFt.reviews).toHaveLength(2);
      expect(oldFt.finalDecision?.decision).toBe("INCLUDED");

      // Case D: Two-stage paper Excluded at Title/Abstract -> Re-screened -> Included -> advances to FULL_TEXT (NOT final included!)
      const fD = await setupProject({ mode: "TWO_STAGE", fullText: true });
      await finalizeRound(fD, "EXCLUDED");
      // Cannot jump forward to FULL_TEXT from TITLE_ABSTRACT
      await expect(rescreen(fD, revA, fD.roundId, { targetPhase: "FULL_TEXT" })).rejects.toMatchObject({ statusCode: 400 });
      const dRescreen = await rescreen(fD, revA, fD.roundId);
      await vote(fD, revA, "INCLUDE", dRescreen.roundId!);
      await vote(fD, revB, "INCLUDE", dRescreen.roundId!);
      const activeAfterD = await db.screeningRound.findFirstOrThrow({
        where: { projectId: fD.projectId, paperId: fD.paperId, active: true },
      });
      expect(activeAfterD.phase).toBe("FULL_TEXT");
      expect(activeAfterD.status).toBe("NOT_REVIEWED");
      expect((await service.workspaceSummary(fD.projectId, revA)).acceptedPapers).toHaveLength(0);
    });
  });

  // ── DECISION, HISTORY, TWO-REVIEWER NO-CONSENSUS & INTEGRATION (19–33) ─────
  describe("History, No-Consensus & Cross-Module Integration (Phase 9-11 & 13.19-33)", () => {
    it("19-25 & 33. Enforces ballot ownership, preserves full history, uses 2-reviewer Closed Without Consensus, never auto-excludes on expiry", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");
      const opened = await rescreen(f, revA, f.roundId);
      const r2 = opened.roundId!;

      // Reviewer A cannot submit Reviewer B's assignment
      const r2View = await service.detail(f.projectId, revA, r2);
      const slotB = r2View.assignments.find(a => a.reviewerId === revB)!;
      await expect(
        service.submit(f.projectId, revA, r2, {
          assignmentId: slotB.id,
          expectedRevision: slotB.revision,
          decision: "EXCLUDE",
          exclusionReason: "Wrong study design",
          comment: "Trying to vote as Reviewer B",
          confirmed: true,
          clientKey: key(),
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      // Disagreement in Round 2 -> Conflict Resolution + Overdue does NOT auto-exclude
      await vote(f, revA, "INCLUDE", r2);
      await vote(f, revB, "EXCLUDE", r2);
      await db.screeningRound.update({
        where: { id: r2 },
        data: { consensusStartedAt: new Date(Date.now() - 50 * 3600000), consensusDeadline: new Date(Date.now() - 2 * 3600000) },
      });
      await maintainScreeningCases();
      const afterExpiry = await service.detail(f.projectId, revA, r2);
      expect(afterExpiry.status).toBe("CONSENSUS_REQUIRED");
      expect(afterExpiry.finalDecision).toBeNull();

      // Mutual 2-reviewer Closed Without Consensus
      const prop = await service.proposeAgreement(f.projectId, revA, r2, {
        expectedVersion: afterExpiry.version,
        decision: "CLOSED_UNRESOLVED",
        reason: "Hai reviewer giữ hai quan điểm phương pháp khác nhau sau khi đối chiếu",
        reviewIds: afterExpiry.reviews.map(x => x.id),
        confirmed: true,
        retrieveFullText: false,
        clientKey: key(),
      });
      const r2ForB = await service.detail(f.projectId, revB, r2);
      await service.confirmAgreement(f.projectId, revB, r2, {
        expectedVersion: r2ForB.version,
        proposalId: prop.id!,
        confirmed: true,
        clientKey: key(),
      });
      const closed = await service.detail(f.projectId, revA, r2);
      expect(closed.status).toBe("CLOSED_UNRESOLVED");
      expect(closed.closureDetails?.actorType).toBe("REVIEWERS");

      // Both Round 2 and Round 1 are retrievable in full history
      const allRounds = await service.rounds(f.projectId, revA, f.paperId, 1);
      expect(allRounds.total).toBe(2);
      expect(allRounds.items[0]?.number).toBe(2);
      expect(allRounds.items[0]?.status).toBe("CLOSED_UNRESOLVED");
      expect(allRounds.items[1]?.number).toBe(1);
      expect(allRounds.items[1]?.status).toBe("INCLUDED");
      expect(allRounds.items[1]?.finalDecision?.decision).toBe("INCLUDED");
    });

    it("26-32. Integrates cleanly with Library, Evidence, Evidence Matrix, LaTeX Citations, PRISMA, Notifications & Work Queue", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");

      // Create & accept an Evidence item while INCLUDED
      const ev = await projectEvidenceService.create(f.projectId, revA, {
        paperId: f.paperId,
        claim: "Dual screening lowers error rate significantly",
        quotation: "evaluates dual-reviewer clinical literature screening",
        locator: "Abstract",
        context: "Clinical studies",
        methodology: "Controlled experiment",
        population: "Medical literature",
        results: "Reduced screening errors",
        limitations: "Single domain",
        themes: ["Screening"],
        origin: "HUMAN",
        clientKey: key(),
      });
      await projectEvidenceService.review(f.projectId, owner, ev.id, {
        expectedVersion: ev.version,
        state: "ACCEPTED",
        rationale: "Verified directly against abstract",
        sourceConfirmed: true,
      });

      // Create a LaTeX manuscript citing this paper
      const draft = await db.draftWorkspace.create({
        data: { projectId: f.projectId, name: "Main Manuscript", writingMode: "LATEX", createdById: owner },
      });
      const docTex = new Y.Doc();
      docTex.getText("content").insert(0, "See prior work \\cite{clinical2025}.");
      const docBib = new Y.Doc();
      docBib.getText("content").insert(0, `% lumigap-paper:${f.paperId}\n@article{clinical2025, title={Clinical LLM}, year={2025}}`);
      const texFile = await db.manuscriptFile.create({
        data: { workspaceId: draft.id, path: "main.tex", kind: "TEXT", crdtState: Buffer.from(Y.encodeStateAsUpdate(docTex)), createdById: owner },
      });
      const bibFile = await db.manuscriptFile.create({
        data: { workspaceId: draft.id, path: "references.bib", kind: "TEXT", crdtState: Buffer.from(Y.encodeStateAsUpdate(docBib)), createdById: owner },
      });

      // Open re-screening (by Owner) -> both revA and revB notified & appear in Work Queue
      const retryKey = key();
      const opened = await rescreen(f, owner, f.roundId, { clientKey: retryKey });
      // Idempotent retry creates no duplicate round or duplicate notifications
      const retried = await rescreen(f, owner, f.roundId, { clientKey: retryKey });
      expect(retried.roundId).toBe(opened.roundId);

      // 31. Notifications sent accurately once per assigned reviewer
      expect(await db.notification.count({
        where: { targetUuid: f.projectId, userId: revA, title: "Có vòng đánh giá lại bài báo cần thực hiện" },
      })).toBe(1);
      expect(await db.notification.count({
        where: { targetUuid: f.projectId, userId: revB, title: "Có vòng đánh giá lại bài báo cần thực hiện" },
      })).toBe(1);
      expect(await db.notification.count({
        where: { targetUuid: f.projectId, userId: memberC, title: "Có vòng đánh giá lại bài báo cần thực hiện" },
      })).toBe(0);

      // 32. Work Queue shows new round immediately for Reviewer A & B
      const summaryA = await service.workspaceSummary(f.projectId, revA);
      expect(summaryA.automaticTasks?.some(t => t.roundId === opened.roundId && t.actionType === "REVIEW" && !t.endedAt)).toBe(true);
      expect(summaryA.workPapers?.find(w => w.roundId === opened.roundId)?.rescreening).toBe(true);

      // 26 & 30. While in progress: Library INCLUDED filter & summary AND PRISMA keep INCLUDED (no double count + rescreening warning!)
      const boardMid = await service.board(f.projectId, owner, { page: 1, pageSize: 20, q: "", filter: "ALL", status: "INCLUDED" });
      expect(boardMid.items).toHaveLength(1);
      expect(boardMid.librarySummary?.selected).toBe(1);
      expect(boardMid.librarySummary?.rescreening).toBe(1);

      const analyticsMid = await service.analytics(f.projectId, owner);
      expect(analyticsMid.rescreeningPapers).toBe(1);
      expect(analyticsMid.prismaSummary?.identified).toBe(1);
      expect(analyticsMid.prismaSummary?.included).toBe(1);
      expect(analyticsMid.prismaSummary?.excluded).toBe(0);
      expect(analyticsMid.prismaSummary?.rescreeningInProgress).toBe(1);

      // Complete Round 2 as EXCLUDED
      await finalizeRound(f, "EXCLUDED", opened.roundId!);

      // 26. Library INCLUDED filter now empty, EXCLUDED filter has the paper
      const boardIncl = await service.board(f.projectId, owner, { page: 1, pageSize: 20, q: "", filter: "ALL", status: "INCLUDED" });
      expect(boardIncl.items).toHaveLength(0);
      expect(boardIncl.librarySummary?.selected).toBe(0);
      expect(boardIncl.librarySummary?.excluded).toBe(1);
      expect(boardIncl.librarySummary?.rescreening).toBe(0);

      // 27. Evidence was NOT deleted, but marked PENDING needing review
      const evAfter = await db.projectEvidenceItem.findUniqueOrThrow({ where: { id: ev.id } });
      expect(evAfter.reviewState).toBe("PENDING");
      expect(evAfter.reviewRationale).toContain("Kết quả sàng lọc nguồn đã thay đổi");

      // 28. Evidence Matrix reflects current Included set (ELIGIBLE=0) while keeping historical evidence accessible (ALL=1)
      const matrixEligible = await projectEvidenceWorkspaceService.get(f.projectId, owner, { q: "", page: 1, pageSize: 20, eligibility: "ELIGIBLE" });
      expect(matrixEligible.items).toHaveLength(0);
      const matrixAll = await projectEvidenceWorkspaceService.get(f.projectId, owner, { q: "", page: 1, pageSize: 20, eligibility: "ALL" });
      expect(matrixAll.items).toHaveLength(1);
      expect(matrixAll.items[0]?.eligible).toBe(false);
      expect(matrixAll.items[0]?.extractionCount).toBe(1);

      // 29. LaTeX citations and BibTeX were NEVER deleted
      const texAfter = await db.manuscriptFile.findUniqueOrThrow({ where: { id: texFile.id } });
      const bibAfter = await db.manuscriptFile.findUniqueOrThrow({ where: { id: bibFile.id } });
      expect(texAfter.deletedAt).toBeNull();
      expect(bibAfter.deletedAt).toBeNull();
      const checkTex = new Y.Doc();
      Y.applyUpdate(checkTex, new Uint8Array(texAfter.crdtState!));
      expect(checkTex.getText("content").toString()).toContain("\\cite{clinical2025}");

      // 30. PRISMA counts 1 paper total (NO double counting across Round 1 & Round 2!)
      const analyticsAfter = await service.analytics(f.projectId, owner);
      expect(analyticsAfter.rescreeningPapers).toBe(0);
      expect(analyticsAfter.prismaSummary?.identified).toBe(1);
      expect(analyticsAfter.prismaSummary?.included).toBe(0);
      expect(analyticsAfter.prismaSummary?.excluded).toBe(1);
      expect(analyticsAfter.prismaSummary?.closedUnresolved).toBe(0);
      expect(analyticsAfter.prismaSummary?.excludedByStage.TITLE_ABSTRACT.count).toBe(1);
    });
  });

  // ── CONCURRENT CASES (Phase 11.1-9) ────────────────────────────────────────
  describe("Concurrent Safety Cases (Phase 11)", () => {
    it("serializes concurrent Reviewer A + Reviewer B reopen and Owner + Reviewer reopen to exactly 1 active round", async () => {
      const f1 = await setupProject();
      const fin1 = await finalizeRound(f1, "INCLUDED");
      const raceAB = await Promise.allSettled([
        service.reopenUnresolved(f1.projectId, revA, f1.roundId, { expectedVersion: fin1.version, reasonCategory: "NEW_INFORMATION", reason: "Reviewer A concurrent reopen", clientKey: key() }),
        service.reopenUnresolved(f1.projectId, revB, f1.roundId, { expectedVersion: fin1.version, reasonCategory: "NEW_INFORMATION", reason: "Reviewer B concurrent reopen", clientKey: key() }),
      ]);
      expect(raceAB.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.screeningRound.count({ where: { projectId: f1.projectId, paperId: f1.paperId, active: true } })).toBe(1);

      const f2 = await setupProject();
      const fin2 = await finalizeRound(f2, "EXCLUDED");
      const raceOwnerRev = await Promise.allSettled([
        service.reopenUnresolved(f2.projectId, owner, f2.roundId, { expectedVersion: fin2.version, reasonCategory: "PREVIOUS_DECISION_ERROR", reason: "Owner concurrent reopen", clientKey: key() }),
        service.reopenUnresolved(f2.projectId, revA, f2.roundId, { expectedVersion: fin2.version, reasonCategory: "PREVIOUS_DECISION_ERROR", reason: "Reviewer A concurrent reopen", clientKey: key() }),
      ]);
      expect(raceOwnerRev.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.screeningRound.count({ where: { projectId: f2.projectId, paperId: f2.paperId, active: true } })).toBe(1);
    });

    it("keeps active re-screening round protocol immutable when project screening criteria are updated mid-round", async () => {
      const f = await setupProject();
      await finalizeRound(f, "INCLUDED");
      const opened = await rescreen(f, revA, f.roundId);
      const before = await service.detail(f.projectId, revA, opened.roundId!);
      const cfg = await service.config(f.projectId, owner);

      await service.configure(f.projectId, owner, {
        screeningMode: "SINGLE_STAGE",
        reviewMode: "INDEPENDENT",
        requiredReviewers: 2,
        consensusPolicy: "UNANIMOUS",
        expectedVersion: cfg.settings.version,
        aiAssisted: false,
        inclusionCriteria: ["Updated inclusion criteria v2"],
        exclusionCriteria: ["Updated exclusion criteria v2"],
        researchQuestions: ["RQ1: Updated"],
        clientKey: key(),
      });

      const during = await service.detail(f.projectId, revA, opened.roundId!);
      expect(during.settings.version).toBe(before.settings.version);
      expect(during.settings.inclusionCriteria).toEqual(["Empirical evaluation study"]);
    });
  });
});
