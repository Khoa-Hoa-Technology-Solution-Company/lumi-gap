import type { Prisma } from "../../generated/prisma/client.js";
import type {
  ProjectAiDataPolicy,
  ProjectAuditEventCategory,
  ProjectAuditEventsPage,
  ProjectAuditEventsQuery,
  ProjectExportPolicy,
  ProjectExternalLookupPolicy,
  ProjectSecurityEventView,
  ProjectSecurityOverview,
  ProjectVisibility,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "./audit.service.js";

const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[_-]?key|authorization|cookie|encrypted|rawcontent|latexsource|content_snapshot)/i;

const AUDIT_CATEGORY_EVENT_TYPES: Record<ProjectAuditEventCategory, readonly string[]> = {
  MEMBERSHIP: [
    "MEMBER_JOINED",
    "MEMBER_LEFT",
    "MEMBER_REMOVED",
    "OWNERSHIP_TRANSFERRED",
    "MEMBER_CREDIT_UPDATED",
    "CREDIT_ROLES_CONFIRMED",
    "MENTOR_FEEDBACK_HANDLED",
  ],
  MANUSCRIPT: [
    "MANUSCRIPT_SNAPSHOT_SAVED",
    "MANUSCRIPT_SOFT_DELETED",
    "MANUSCRIPT_RESTORED_FROM_TRASH",
    "MANUSCRIPT_SUBMISSION_SNAPSHOT_CREATED",
    "MANUSCRIPT_AI_ACCEPTED",
    "MANUSCRIPT_REMOTE_BOUND",
    "MANUSCRIPT_REMOTE_APPLIED",
    "GITHUB_REPOSITORY_INITIALIZED",
    "MENTOR_MANUSCRIPT_PREPARED",
    "PRIVATE_SOURCE_UPLOADED",
    "MANUSCRIPT_ATTRIBUTION_SAVED",
    "MANUSCRIPT_ATTRIBUTION_DECIDED",
    "AUTHORSHIP_UPDATED",
    "AUTHORSHIP_CONFIRMED",
    "CITATION_VERIFIED",
    "EXTERNAL_AI_DECLARED",
    "MANUSCRIPT_INTEGRITY_RECORDED",
    "MANUSCRIPT_INTEGRITY_ACKNOWLEDGED",
  ],
  ACCESS_EXPORT: [
    "MANUSCRIPT_PDF_DOWNLOADED",
    "MANUSCRIPT_FILE_DOWNLOADED",
    "MANUSCRIPT_SOURCE_EXPORTED",
    "PROJECT_SOURCE_EXPORTED",
    "SUBMISSION_REVISION_DOWNLOADED",
    "ALLOCATION_EXPORTED",
    "CONTRIBUTION_EVIDENCE_EXPORTED",
    "CREDIT_STATEMENT_EXPORTED",
    "MANUSCRIPT_INTEGRITY_EXPORTED",
    "ATTRIBUTION_REVIEW_PDF_READ",
  ],
  SETTINGS_PRIVACY: [
    "PROJECT_VISIBILITY_CHANGED",
    "PROJECT_SECURITY_POLICY_CHANGED",
  ],
  INTEGRITY_SECURITY: [
    "INTEGRITY_CASE_OPENED",
    "INTEGRITY_CASE_RESPONDED",
    "INTEGRITY_CASE_ESCALATED",
    "INTEGRITY_CASE_RESOLVED",
    "PROJECT_LEAK_CONTAINMENT_APPLIED",
  ],
};

export function classifyAuditEvent(eventType: string): ProjectAuditEventCategory {
  for (const [category, types] of Object.entries(AUDIT_CATEGORY_EVENT_TYPES) as Array<[ProjectAuditEventCategory, readonly string[]]>) {
    if (types.includes(eventType)) return category;
  }
  if (eventType.includes("MEMBER") || eventType.includes("OWNERSHIP") || eventType.includes("MENTOR")) return "MEMBERSHIP";
  if (eventType.includes("DOWNLOAD") || eventType.includes("EXPORT")) return "ACCESS_EXPORT";
  if (eventType.includes("POLICY") || eventType.includes("VISIBILITY")) return "SETTINGS_PRIVACY";
  if (eventType.includes("INTEGRITY") || eventType.includes("LEAK")) return "INTEGRITY_SECURITY";
  return "MANUSCRIPT";
}

function parseDateBound(raw: string | undefined, endOfDay: boolean): Date | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = new Date(isDateOnly ? `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function resolveLedgerAccess(projectInput: string, actorInput: string) {
  const db = getPrisma();
  const pId = parseDatabaseId(projectInput);
  const aId = parseDatabaseId(actorInput);
  if (!pId || !aId) throw AppError.badRequest("Invalid identifier");

  const [project, actor] = await Promise.all([
    db.project.findUnique({ where: pId.kind === "uuid" ? { id: pId.value } : { legacyMongoId: pId.value } }),
    db.user.findUnique({
      where: aId.kind === "uuid" ? { id: aId.value } : { legacyMongoId: aId.value },
      select: { id: true, isActive: true, accountStatus: true, systemRole: true },
    }),
  ]);
  if (!project || project.deletedAt || !actor || !actor.isActive || actor.accountStatus !== "ACTIVE") {
    throw AppError.notFound("Project not found");
  }

  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: actor.id } },
  });
  const isOwner = project.ownerId === actor.id;
  const isAdmin = actor.systemRole === "ADMIN";
  const isActiveMember = isOwner || member?.status === "ACTIVE";
  if (!isActiveMember && !isAdmin) {
    throw AppError.notFound("Project not found");
  }

  const allowedVisibilities = isOwner || isAdmin
    ? ["PROJECT_TEAM", "OWNER_ADMIN", "CONTRIBUTOR_SCOPED"]
    : ["PROJECT_TEAM", "CONTRIBUTOR_SCOPED"];

  return { db, project, actor, isOwner, isAdmin, isActiveMember, allowedVisibilities };
}

async function hydrateLedgerRows(
  db: ReturnType<typeof getPrisma>,
  rows: Array<{
    id: string;
    eventType: string;
    actorId: string | null;
    resourceKind: string;
    resourceId: string | null;
    artifactVersion: string | null;
    checksumSha256: string | null;
    reason: string | null;
    visibility: string;
    createdAt: Date;
    metadata: unknown;
  }>,
): Promise<ProjectSecurityEventView[]> {
  const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
  const users = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
    : [];
  const people = new Map(users.map((u) => [u.id, { id: u.id, name: u.fullName || "Researcher" }]));

  return rows.map((row) => {
    const rawMeta = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {}) as Record<string, unknown>;
    const cleanMeta = sanitizeMetadata(rawMeta);
    return {
      id: row.id,
      type: row.eventType,
      category: classifyAuditEvent(row.eventType),
      actor: row.actorId ? (people.get(row.actorId) ?? { id: row.actorId, name: "Researcher" }) : null,
      entityKind: row.resourceKind,
      entityId: row.resourceId,
      artifactVersion: row.artifactVersion && /^\d+$/.test(row.artifactVersion) ? Number(row.artifactVersion) : null,
      checksumSha256: row.checksumSha256,
      reason: row.reason,
      visibility: row.visibility,
      createdAt: row.createdAt.toISOString(),
      summary: summarizeLedgerEvent(row.eventType, row.resourceKind, row.reason, cleanMeta),
      metadata: cleanMeta,
    };
  });
}

function sanitizeMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string") {
      result[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 25).map((item) =>
        typeof item === "string" ? item.slice(0, 200) : typeof item === "number" || typeof item === "boolean" ? item : String(item),
      );
    }
  }
  return result;
}

export interface RecordResearchLedgerInput {
  projectId: string;
  actorId?: string | null;
  eventType: string;
  resourceKind: string;
  resourceId?: string | null;
  artifactVersion?: string | number | null;
  previousVersionRef?: string | null;
  currentVersionRef?: string | null;
  checksumSha256?: string | null;
  reason?: string | null;
  visibility?: "PROJECT_TEAM" | "OWNER_ADMIN" | "CONTRIBUTOR_SCOPED";
  retentionClass?: "RESEARCH_EVIDENCE" | "SECURITY_AUDIT" | "ATTRIBUTION_RECORD";
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}

function summarizeLedgerEvent(eventType: string, resourceKind: string, reason: string | null, metadata: Record<string, unknown>): string {
  const label = eventType.replace(/_/g, " ").toLowerCase();
  const base = `${label.charAt(0).toUpperCase()}${label.slice(1)} (${resourceKind})`;
  if (reason && reason.trim()) return `${base} — ${reason.trim()}`;
  if (typeof metadata.summary === "string" && metadata.summary.trim()) return `${base} — ${metadata.summary.trim()}`;
  return base;
}

export function assertCanExportProjectSource(
  project: { id: string; ownerId: string; exportPolicy?: string | null },
  actorId: string,
): void {
  const policy = project.exportPolicy ?? "ALL_MEMBERS";
  if (policy === "OWNER_ONLY" && project.ownerId !== actorId) {
    throw AppError.forbidden("Source and bundle exports are restricted to the project owner by project security policy");
  }
}

export const researchLedgerService = {
  async record(input: RecordResearchLedgerInput): Promise<void> {
    const cleanMetadata = sanitizeMetadata(input.metadata);
    const artifactVersion =
      input.artifactVersion !== undefined && input.artifactVersion !== null
        ? String(input.artifactVersion).slice(0, 80)
        : null;
    const checksum =
      input.checksumSha256 && /^[a-f0-9]{64}$/i.test(input.checksumSha256)
        ? input.checksumSha256.toLowerCase()
        : null;

    const data = {
      projectId: input.projectId,
      actorId: input.actorId ?? null,
      eventType: input.eventType.slice(0, 48),
      resourceKind: input.resourceKind.slice(0, 32),
      resourceId: input.resourceId ? String(input.resourceId).slice(0, 120) : null,
      artifactVersion,
      previousVersionRef: input.previousVersionRef ? String(input.previousVersionRef).slice(0, 120) : null,
      currentVersionRef: input.currentVersionRef ? String(input.currentVersionRef).slice(0, 120) : null,
      checksumSha256: checksum,
      reason: input.reason ? input.reason.slice(0, 1000) : null,
      visibility: input.visibility ?? "PROJECT_TEAM",
      retentionClass: input.retentionClass ?? "RESEARCH_EVIDENCE",
      metadata: cleanMetadata as Prisma.InputJsonValue,
    };

    if (input.tx) {
      await input.tx.researchEvidenceEvent.create({ data });
      await input.tx.auditLog.create({
        data: {
          userId: input.actorId ?? null,
          actionName: `research_ledger.${input.eventType.toLowerCase()}`,
          targetTableName: input.resourceKind.toLowerCase(),
          targetRecordId: data.resourceId ?? input.projectId,
          details: {
            projectId: input.projectId,
            artifactVersion,
            checksumSha256: checksum,
            reason: data.reason,
            ...cleanMetadata,
          } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    try {
      await getPrisma().researchEvidenceEvent?.create({ data });
    } catch (err) {
      logger.warn({ err, eventType: input.eventType, projectId: input.projectId }, "research evidence ledger write failed");
    }

    await auditService.log(`research_ledger.${input.eventType.toLowerCase()}`, {
      userId: input.actorId ?? undefined,
      targetTableName: input.resourceKind.toLowerCase(),
      targetRecordId: data.resourceId ?? input.projectId,
      details: {
        projectId: input.projectId,
        artifactVersion,
        checksumSha256: checksum,
        reason: data.reason,
        ...cleanMetadata,
      },
    });
  },

  async getProjectSecurityOverview(projectInput: string, actorInput: string, limit = 40): Promise<ProjectSecurityOverview> {
    const { db, project, isOwner, isActiveMember, allowedVisibilities } = await resolveLedgerAccess(projectInput, actorInput);
    const boundedLimit = Math.min(100, Math.max(0, limit));
    const eventScope = { projectId: project.id, visibility: { in: allowedVisibilities } };

    const [activeMembers, formerMembers, activeMentors, countedEvents, latestRow, ledgerRows] = await Promise.all([
      db.projectMember.count({ where: { projectId: project.id, status: "ACTIVE" } }),
      db.projectMember.count({ where: { projectId: project.id, status: { in: ["REMOVED", "LEFT"] } } }),
      db.mentorRelationship.count({ where: { projectId: project.id, status: "ACTIVE" } }),
      typeof db.researchEvidenceEvent.count === "function"
        ? db.researchEvidenceEvent.count({ where: eventScope })
        : Promise.resolve<number | null>(null),
      boundedLimit === 0 && typeof db.researchEvidenceEvent.findFirst === "function"
        ? db.researchEvidenceEvent.findFirst({
            where: eventScope,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { createdAt: true },
          })
        : Promise.resolve(null),
      boundedLimit > 0
        ? db.researchEvidenceEvent.findMany({
            where: eventScope,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: boundedLimit,
          })
        : Promise.resolve([]),
    ]);

    const totalEventCount = countedEvents ?? ledgerRows.length;

    const recentEvents = await hydrateLedgerRows(db, ledgerRows);
    const latestEventAt = ledgerRows[0]?.createdAt?.toISOString() ?? latestRow?.createdAt?.toISOString() ?? null;

    const exportPolicy = ((project.exportPolicy as ProjectExportPolicy) || "ALL_MEMBERS");
    const aiDataPolicy = ((project.aiDataPolicy as ProjectAiDataPolicy) || "ALLOW_PERSONAL_AI");
    const externalLookupPolicy = ((project.externalLookupPolicy as ProjectExternalLookupPolicy) || "ALLOW_PUBLIC_INDEX");

    return {
      projectId: project.id,
      visibility: (project.visibility as ProjectVisibility) || "PRIVATE",
      exportPolicy,
      aiDataPolicy,
      externalLookupPolicy,
      canManage: isOwner && project.status !== "ARCHIVED",
      canExportSource: exportPolicy === "ALL_MEMBERS" ? isActiveMember : isOwner,
      activeMemberCount: Math.max(1, activeMembers),
      formerMemberCount: formerMembers,
      activeMentorCount: activeMentors,
      totalEventCount,
      latestEventAt,
      recentEvents,
    };
  },

  async listProjectAuditEvents(
    projectInput: string,
    actorInput: string,
    query: ProjectAuditEventsQuery = {},
  ): Promise<ProjectAuditEventsPage> {
    const { db, project, allowedVisibilities } = await resolveLedgerAccess(projectInput, actorInput);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.ResearchEvidenceEventWhereInput = {
      projectId: project.id,
      visibility: { in: allowedVisibilities },
    };

    if (query.category && AUDIT_CATEGORY_EVENT_TYPES[query.category]) {
      where.eventType = { in: [...AUDIT_CATEGORY_EVENT_TYPES[query.category]] };
    }

    const fromDate = parseDateBound(query.from, false);
    const toDate = parseDateBound(query.to, true);
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    const search = query.q?.trim();
    if (search) {
      const matchingUsers = await db.user.findMany({
        where: { fullName: { contains: search, mode: "insensitive" } },
        select: { id: true },
        take: 50,
      });
      const matchingUserIds = matchingUsers.map((u) => u.id);
      where.OR = [
        { eventType: { contains: search, mode: "insensitive" } },
        { resourceKind: { contains: search, mode: "insensitive" } },
        { resourceId: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        ...(matchingUserIds.length ? [{ actorId: { in: matchingUserIds } }] : []),
      ];
    }

    const [total, rows] = await Promise.all([
      db.researchEvidenceEvent.count({ where }),
      db.researchEvidenceEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = await hydrateLedgerRows(db, rows);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
      },
    };
  },
};
