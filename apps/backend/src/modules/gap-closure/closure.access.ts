/**
 * Who may see or change what in the Gap Closure Protocol. The decisions are PURE functions (tested without a
 * database); the loaders at the bottom gather the facts from PostgreSQL and apply them.
 */
import type { ClosureLabel } from "@trend/shared-types";
import { isAdminSystemRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { capabilityService } from "../authorization/capability.service.js";
import { quoteAppearsIn } from "./closure.rules.js";

/* ------------------------------------------------------------------ */
/*  Pure rules                                                         */
/* ------------------------------------------------------------------ */

export type GapAccessLevel = "manager" | "member" | "none";

export interface GapAccessFacts {
  userId: string;
  gapOwnerId: string;
  projectOwnerId?: string | null;
  isActiveProjectMember?: boolean;
}

/** manager: the gap's creator or its project's owner; member: an ACTIVE project member; none: nobody else. */
export function gapAccessLevel(facts: GapAccessFacts): GapAccessLevel {
  if (facts.userId === facts.gapOwnerId || (facts.projectOwnerId && facts.userId === facts.projectOwnerId)) return "manager";
  return facts.isActiveProjectMember ? "member" : "none";
}

/** A calibration check is visible to the calibration's creator and to people allowed to validate gaps. */
export function canViewCalibrationCheck(facts: { userId: string; calibrationCreatorId: string; isAdmin: boolean; hasGapValidation: boolean }): boolean {
  return facts.userId === facts.calibrationCreatorId || facts.isAdmin || facts.hasGapValidation;
}

/** Documents can be labelled once screening finished (and again after a decision, which reopens the check). */
export const REVIEWABLE_STATUSES: readonly string[] = ["SCREENING", "DECIDED"];
export const DECIDABLE_STATUSES: readonly string[] = ["SCREENING", "DECIDED"];
export const isReviewableStatus = (status: string) => REVIEWABLE_STATUSES.includes(status);
export const isDecidableStatus = (status: string) => DECIDABLE_STATUSES.includes(status);

/** A deciding label on a decided check invalidates the decision; a second-reviewer label never does. */
export function reopensDecision(checkStatus: string, asSecondReviewer: boolean | undefined): boolean {
  return checkStatus === "DECIDED" && !asSecondReviewer;
}

/**
 * Message when a deciding label is unacceptable, null when fine. ANSWERS and PARTIAL need a quote that appears
 * verbatim in title + abstract; a second reviewer only records a label (there is no column for a second quote).
 */
export function reviewQuoteError(input: { label: ClosureLabel; quote?: string | null; title: string; abstractText?: string | null; asSecondReviewer?: boolean }): string | null {
  if (input.asSecondReviewer || input.label === "UNRELATED") return null;
  if (!input.quote?.trim()) return `A verbatim quote is required to label a document ${input.label}`;
  if (!quoteAppearsIn(input.quote, `${input.title}\n${input.abstractText ?? ""}`)) {
    return "The quote does not appear verbatim in the document title or abstract (at least 20 characters are required)";
  }
  return null;
}

/** The independent second reviewer needs a first label to compare with and must be a different person. */
export function secondReviewerError(input: { firstReviewerId?: string | null; firstLabel?: string | null; reviewerId: string }): string | null {
  if (!input.firstLabel || !input.firstReviewerId) return "A first reviewer must label this document before a second reviewer can";
  if (input.firstReviewerId === input.reviewerId) return "The second reviewer must be a different person from the first reviewer";
  return null;
}

/* ------------------------------------------------------------------ */
/*  Loaders                                                            */
/* ------------------------------------------------------------------ */

/** Database id of the caller; the token may carry a migrated legacy id. */
export async function resolveUserId(sub: string): Promise<string> {
  const parsed = parseDatabaseId(sub);
  if (!parsed) throw AppError.unauthorized();
  if (parsed.kind === "uuid") return parsed.value;
  const user = await getPrisma().user.findUnique({ where: { legacyMongoId: parsed.value }, select: { id: true } });
  if (!user) throw AppError.unauthorized();
  return user.id;
}

export function idWhere(value: string): { id: string } | { legacyMongoId: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

/** Project ids where the user is the owner or an ACTIVE member. */
export async function projectIdsOfUser(userId: string): Promise<string[]> {
  const prisma = getPrisma();
  const [owned, memberships] = await Promise.all([
    prisma.project.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.projectMember.findMany({ where: { userId, status: "ACTIVE" }, select: { projectId: true } }),
  ]);
  return [...new Set([...owned.map((row) => row.id), ...memberships.map((row) => row.projectId)])];
}

/** The project when the user owns it or is an ACTIVE member; 404 otherwise so private projects stay hidden. */
export async function requireProjectMember(projectParam: string, userId: string) {
  const project = await getPrisma().project.findFirst({ where: idWhere(projectParam) });
  const member = project && project.ownerId !== userId
    ? await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId } } })
    : null;
  if (!project || (project.ownerId !== userId && member?.status !== "ACTIVE")) throw AppError.notFound("Project not found");
  return project;
}

/** A gap with the caller's access level. 404 when the gap does not exist or the caller cannot see it. */
export async function loadGapForUser(gapParam: string, userId: string) {
  const prisma = getPrisma();
  const gap = await prisma.researchGap.findFirst({ where: idWhere(gapParam) });
  if (!gap) throw AppError.notFound("Research gap not found");
  let projectOwnerId: string | null = null;
  let isActiveProjectMember = false;
  if (gap.projectId && gap.userId !== userId) {
    const project = await prisma.project.findUnique({ where: { id: gap.projectId }, select: { ownerId: true } });
    projectOwnerId = project?.ownerId ?? null;
    if (project && project.ownerId !== userId) {
      const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: gap.projectId, userId } } });
      isActiveProjectMember = member?.status === "ACTIVE";
    }
  }
  const level = gapAccessLevel({ userId, gapOwnerId: gap.userId, projectOwnerId, isActiveProjectMember });
  if (level === "none") throw AppError.notFound("Research gap not found");
  return { gap, level };
}

/** True for admins and for ACTIVE users holding the GAP_VALIDATION capability. */
export async function hasValidationAuthority(userId: string): Promise<{ isAdmin: boolean; hasGapValidation: boolean }> {
  const [user, capabilities] = await Promise.all([
    getPrisma().user.findUnique({ where: { id: userId }, select: { systemRole: true, accountStatus: true } }),
    capabilityService.list(userId),
  ]);
  const active = user?.accountStatus === "ACTIVE";
  return { isAdmin: active && isAdminSystemRole(user?.systemRole), hasGapValidation: active && capabilities.includes("GAP_VALIDATION") };
}

export async function assertCanManageCalibrations(userId: string): Promise<void> {
  const { isAdmin, hasGapValidation } = await hasValidationAuthority(userId);
  if (!isAdmin && !hasGapValidation) throw AppError.forbidden("The GAP_VALIDATION capability is required to manage calibrations");
}

/**
 * A closure check with the caller's access. GAP target: the caller can access the gap (`level` says how);
 * CALIBRATION_QUESTION target: the calibration's creator or a GAP_VALIDATION holder. Everything else is a 404.
 */
export async function loadCheckForUser(checkId: string, userId: string) {
  const prisma = getPrisma();
  const check = await prisma.gapClosureCheck.findUnique({ where: { id: checkId } });
  if (!check) throw AppError.notFound("Closure check not found");
  if (check.targetKind === "GAP") {
    const { gap, level } = await loadGapForUser(check.targetId, userId).catch((error) => {
      if (error instanceof AppError && error.statusCode === 404) throw AppError.notFound("Closure check not found");
      throw error;
    });
    return { check, gap, level, calibration: null };
  }
  const question = await prisma.calibrationQuestion.findUnique({ where: { id: check.targetId } });
  const calibration = question ? await prisma.closureCalibration.findUnique({ where: { id: question.calibrationId } }) : null;
  if (!calibration) throw AppError.notFound("Closure check not found");
  const authority = calibration.createdById === userId ? { isAdmin: false, hasGapValidation: false } : await hasValidationAuthority(userId);
  if (!canViewCalibrationCheck({ userId, calibrationCreatorId: calibration.createdById, ...authority })) throw AppError.notFound("Closure check not found");
  return { check, gap: null, level: null, calibration };
}
