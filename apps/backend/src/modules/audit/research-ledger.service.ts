import type { Prisma } from "../../generated/prisma/client.js";
import type {
  ProjectAiDataPolicy,
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
    if (!project || !actor || !actor.isActive || actor.accountStatus !== "ACTIVE") {
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

    const [activeMembers, formerMembers, activeMentors, ledgerRows] = await Promise.all([
      db.projectMember.count({ where: { projectId: project.id, status: "ACTIVE" } }),
      db.projectMember.count({ where: { projectId: project.id, status: { in: ["REMOVED", "LEFT"] } } }),
      db.mentorRelationship.count({ where: { projectId: project.id, status: "ACTIVE" } }),
      db.researchEvidenceEvent.findMany({
        where: { projectId: project.id, visibility: { in: allowedVisibilities } },
        orderBy: { createdAt: "desc" },
        take: Math.min(100, Math.max(1, limit)),
      }),
    ]);

    const actorIds = [...new Set(ledgerRows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
    const users = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const people = new Map(users.map((u) => [u.id, { id: u.id, name: u.fullName || "Researcher" }]));

    const recentEvents: ProjectSecurityEventView[] = ledgerRows.map((row) => {
      const meta = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {}) as Record<string, unknown>;
      return {
        id: row.id,
        type: row.eventType,
        actor: row.actorId ? (people.get(row.actorId) ?? { id: row.actorId, name: "Researcher" }) : null,
        entityKind: row.resourceKind,
        entityId: row.resourceId,
        artifactVersion: row.artifactVersion && /^\d+$/.test(row.artifactVersion) ? Number(row.artifactVersion) : null,
        checksumSha256: row.checksumSha256,
        reason: row.reason,
        visibility: row.visibility,
        createdAt: row.createdAt.toISOString(),
        summary: summarizeLedgerEvent(row.eventType, row.resourceKind, row.reason, meta),
      };
    });

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
      recentEvents,
    };
  },
};
