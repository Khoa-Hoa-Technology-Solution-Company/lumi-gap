import type { ScreeningRound, ScreeningAssignment } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { jsonSnapshot, type WorkspaceContext } from "./workspace-access.js";
import { screeningPeople } from "./screening-assignments.js";

export const CLAIM_HOURS = 24; // Existing project policy, including full text. No per-user limit.
export const occupiedScreeningSlot = (a: Pick<ScreeningAssignment, "submittedAt" | "dueAt" | "active">, now = new Date()) =>
  a.active && Boolean(a.submittedAt || !a.dueAt || a.dueAt > now);

export function assertScreeningCapacity(round: Pick<ScreeningRound, "legacyNeedsAudit" | "settings">) {
  const s = round.settings as { reviewMode?: string; requiredReviewers?: number };
  if (round.legacyNeedsAudit || s.reviewMode !== "COLLABORATIVE" &&
      (s.reviewMode === "SIMPLE" ? s.requiredReviewers !== 1 : s.requiredReviewers !== 2)) {
    throw AppError.conflict("Cần rà soát dữ liệu cũ. Chủ dự án cần xác nhận mở vòng mới; các phiếu và quyết định cũ được giữ trong lịch sử");
  }
}

/** Called under the project write lock. Reads use the same server deadline predicate. */
export async function expireScreeningClaims(c: WorkspaceContext) {
  const rows = await c.tx.screeningAssignment.findMany({ where: {
    projectId: c.project.id, active: true, submittedAt: null, dueAt: { lte: new Date() },
  } });
  for (const a of rows) {
    await c.tx.screeningAssignment.update({ where: { id: a.id }, data: { active: false } });
    await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: a.roundId,
      actorId: c.actorId, type: "CLAIM_EXPIRED", details: jsonSnapshot({ assignmentId: a.id, reviewerId: a.reviewerId, revision: a.revision, dueAt: a.dueAt }) } });
  }
}

export function invalidScreeningMetadata(paper: { title: string; journalName: string | null; paperKind: string | null }) {
  const normalize = (v: string) => v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  return !paper.title.trim() || Boolean(paper.journalName && normalize(paper.title) === normalize(paper.journalName)) || ["journal", "paratext"].includes(paper.paperKind ?? "");
}

export interface ProposerEligibilityResult {
  eligible: boolean;
  isProposer: boolean;
  proposerExcluded: boolean;
  proposerId: string | null;
  otherEligibleCount: number;
  smallTeam: boolean;
  hasException: boolean;
  exceptionDetails?: Record<string, unknown> | null;
  reason?: string;
}

/**
 * Proposer-aware reviewer eligibility rule:
 * - When a project has >= 2 other eligible reviewers besides the paper's original proposer,
 *   the proposer should NOT normally evaluate their own proposed paper (to reduce bias and distribute work).
 * - For small teams (< 2 other eligible reviewers, i.e. 1 or 2 members total), the proposer remains eligible to claim 1 slot.
 * - If an auditable exception was granted for that round, the proposer may claim even in >= 3 member teams.
 */
export async function checkProposerEligibility(
  c: WorkspaceContext,
  paperId: string,
  actorId: string,
  roundId?: string,
  preloadedPeople?: Array<{ id: string; name: string }>,
  preloadedProposerId?: string | null
): Promise<ProposerEligibilityResult> {
  const proposerId = preloadedProposerId !== undefined
    ? preloadedProposerId
    : (await c.tx.projectPaper.findUnique({
        where: { projectId_paperId: { projectId: c.project.id, paperId } },
        select: { addedById: true },
      }))?.addedById ?? null;

  const isProposer = Boolean(proposerId && proposerId === actorId);
  const people = preloadedPeople ?? (await screeningPeople(c));
  const otherEligibleCount = proposerId ? people.filter(p => p.id !== proposerId).length : people.length;
  const smallTeam = otherEligibleCount < 2;

  if (!isProposer) {
    return {
      eligible: true,
      isProposer: false,
      proposerExcluded: false,
      proposerId,
      otherEligibleCount,
      smallTeam,
      hasException: false,
    };
  }

  // Small teams (< 2 other eligible reviewers, i.e. team has 1 or 2 members total)
  if (smallTeam) {
    return {
      eligible: true,
      isProposer: true,
      proposerExcluded: false,
      proposerId,
      otherEligibleCount,
      smallTeam: true,
      hasException: false,
    };
  }

  // 3+ members: Check if an auditable exception was granted for this round
  let hasException = false;
  let exceptionDetails: Record<string, unknown> | null = null;
  if (roundId) {
    const audit = await c.tx.screeningAudit.findFirst({
      where: {
        projectId: c.project.id,
        roundId,
        type: "PROPOSER_EXCEPTION_GRANTED",
      },
      orderBy: { createdAt: "desc" },
    });
    if (audit) {
      const details = audit.details as Record<string, unknown>;
      if (!details?.proposerId || details.proposerId === proposerId) {
        hasException = true;
        exceptionDetails = details;
      }
    }
  }

  if (hasException) {
    return {
      eligible: true,
      isProposer: true,
      proposerExcluded: false,
      proposerId,
      otherEligibleCount,
      smallTeam: false,
      hasException: true,
      exceptionDetails,
    };
  }

  return {
    eligible: false,
    isProposer: true,
    proposerExcluded: true,
    proposerId,
    otherEligibleCount,
    smallTeam: false,
    hasException: false,
    reason: "Nhóm có từ 3 thành viên đủ điều kiện trở lên, bài bạn đề xuất cần được 2 thành viên khác đánh giá độc lập để đảm bảo tính khách quan.",
  };
}

/** One eligibility and priority calculation shared by queue, claim-next and My Work. */
export async function screeningQueue(c: WorkspaceContext) {
  const rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true,
    legacyNeedsAudit: false, unblindedAt: null, status: { in: ["NOT_REVIEWED", "IN_REVIEW"] } } });
  const [assignments, links, people, papers, audits] = await Promise.all([
    c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId: { in: rounds.map(r => r.id) }, active: true } }),
    c.tx.projectPaper.findMany({ where: { projectId: c.project.id }, select: { paperId: true, addedById: true } }),
    screeningPeople(c),
    c.tx.paper.findMany({ where: { id: { in: rounds.map(r => r.paperId) } }, select: { id: true, title: true, journalName: true, paperKind: true } }),
    c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: { in: rounds.map(r => r.id) }, type: "PROPOSER_EXCEPTION_GRANTED" } }),
  ]);
  const live = new Set(people.map(p => p.id)), now = new Date();
  const byRound = new Map<string, ScreeningAssignment[]>();
  for (const a of assignments) if (occupiedScreeningSlot(a, now) && (a.submittedAt || live.has(a.reviewerId))) {
    const rows = byRound.get(a.roundId) ?? []; rows.push(a); byRound.set(a.roundId, rows);
  }
  const byPaper = new Map(papers.map(p => [p.id, p]));
  const proposers = new Map(links.map(l => [l.paperId, l.addedById]));
  const exceptionRounds = new Set(audits.map(a => a.roundId).filter(Boolean));

  return rounds.flatMap(r => {
    const s = r.settings as { reviewMode?: string; requiredReviewers: number }, occupied = byRound.get(r.id) ?? [];
    const paper = byPaper.get(r.paperId);
    if (!live.has(c.actorId) || !paper || invalidScreeningMetadata(paper) || s.reviewMode === "COLLABORATIVE" ||
        (s.reviewMode === "SIMPLE" ? s.requiredReviewers !== 1 : s.requiredReviewers !== 2) ||
        occupied.length >= s.requiredReviewers || occupied.some(a => a.reviewerId === c.actorId)) return [];

    const proposerId = proposers.get(r.paperId);
    const otherEligibleCount = proposerId ? people.filter(p => p.id !== proposerId).length : people.length;
    const isProposer = Boolean(proposerId && proposerId === c.actorId);
    const hasException = exceptionRounds.has(r.id);

    // If actor is proposer and team has >= 2 other eligible reviewers, exclude unless exception granted
    if (isProposer && otherEligibleCount >= 2 && !hasException) {
      return [];
    }

    return [{ roundId: r.id, paperId: r.paperId, completedCount: occupied.filter(a => a.submittedAt).length,
      occupiedCount: occupied.length, isOtherProposer: !isProposer, createdAt: r.createdAt }];
  }).sort((a, b) => b.completedCount - a.completedCount || b.occupiedCount - a.occupiedCount ||
    Number(b.isOtherProposer) - Number(a.isOtherProposer) || a.createdAt.getTime() - b.createdAt.getTime() || a.roundId.localeCompare(b.roundId));
}

export async function claimScreeningSlot(c: WorkspaceContext, round: ScreeningRound) {
  assertScreeningCapacity(round);
  await expireScreeningClaims(c);
  if (!round.active || round.unblindedAt || !["NOT_REVIEWED", "IN_REVIEW"].includes(round.status))
    throw AppError.conflict("Vòng không còn nhận reviewer thường. Dùng quy trình thảo luận hoặc phân xử khi cần");
  const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: round.paperId }, select: { title: true, journalName: true, paperKind: true } });
  if (invalidScreeningMetadata(paper)) throw AppError.conflict("Kiểm tra thông tin bài báo trước khi nhận đánh giá");
  const s = round.settings as { reviewMode?: string; requiredReviewers: number };
  if (s.reviewMode === "COLLABORATIVE") throw AppError.conflict("Dự án đang dùng quy trình cộng tác lịch sử");
  const people = await screeningPeople(c);
  const peopleSet = new Set(people.map(p => p.id));
  if (!peopleSet.has(c.actorId)) throw AppError.forbidden("Bạn không đủ điều kiện nhận suất đánh giá trong dự án này");

  // Proposer-aware reviewer eligibility check
  const eligibility = await checkProposerEligibility(c, round.paperId, c.actorId, round.id, people);
  if (!eligibility.eligible) {
    throw AppError.forbidden(eligibility.reason || "Nhóm có từ 3 thành viên đủ điều kiện trở lên, bài bạn đề xuất cần được 2 thành viên khác đánh giá độc lập để đảm bảo tính khách quan.");
  }

  const rows = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId: round.id, active: true } });
  const occupied = rows.filter(a => occupiedScreeningSlot(a) && (a.submittedAt || peopleSet.has(a.reviewerId)));
  const own = occupied.find(a => a.reviewerId === c.actorId);
  if (own?.submittedAt) throw AppError.conflict("Bạn đã gửi phiếu cho vòng này");
  if (own) return { paperId: round.paperId, roundId: round.id, assignmentId: own.id, dueAt: own.dueAt?.toISOString() ?? null };
  if (occupied.length >= s.requiredReviewers) throw AppError.conflict("Đã đủ reviewer. Vui lòng chọn bài khác trong hàng đợi");
  // Eligibility reads exclude unavailable people. Persist their unfinished release
  // under the same project lock before the database capacity trigger checks the claim.
  for (const stale of rows.filter(a => !a.submittedAt && !peopleSet.has(a.reviewerId))) {
    await c.tx.screeningAssignment.update({ where: { id: stale.id }, data: { active: false } });
    await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: round.id, actorId: c.actorId,
      type: "ASSIGNMENT_REVOKED", details: { assignmentId: stale.id, reviewerId: stale.reviewerId, reason: "REVIEWER_UNAVAILABLE", revision: stale.revision } } });
  }
  const dueAt = new Date(Date.now() + CLAIM_HOURS * 3600000);
  const a = await c.tx.screeningAssignment.upsert({ where: { roundId_reviewerId: { roundId: round.id, reviewerId: c.actorId } },
    create: { projectId: c.project.id, roundId: round.id, reviewerId: c.actorId, dueAt }, update: { active: true, dueAt } });
  await c.tx.screeningRound.update({ where: { id: round.id }, data: { status: "IN_REVIEW", version: { increment: 1 } } });
  return { paperId: round.paperId, roundId: round.id, assignmentId: a.id, dueAt: dueAt.toISOString() };
}
