import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CreateIntegrityCaseInput,
  IntegrityCaseKind,
  IntegrityCaseStatus,
  IntegrityContainmentAction,
  IntegrityTargetKind,
  ResearchIntegrityCaseView,
  ResearchIntegrityEventView,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { jsonSnapshot, workspaceId, workspacePeople, type WorkspaceContext } from "./workspace-access.js";

import type { Prisma } from "../../generated/prisma/client.js";
type Db = Prisma.TransactionClient;

const VALID_KINDS: IntegrityCaseKind[] = [
  "CONTRIBUTION_DISPUTE",
  "ATTRIBUTION_DISPUTE",
  "DATA_LEAK_INCIDENT",
];

const VALID_TARGET_KINDS: IntegrityTargetKind[] = [
  "WORK_CONTRIBUTION",
  "ALLOCATION_REVISION",
  "MANUSCRIPT_ATTRIBUTION",
  "MANUSCRIPT",
  "PAPER_FILE",
  "MENTOR_SHARE",
  "PROJECT",
];

export const createIntegrityCaseSchema = z
  .object({
    kind: z.enum(["CONTRIBUTION_DISPUTE", "ATTRIBUTION_DISPUTE", "DATA_LEAK_INCIDENT"]),
    targetKind: z.enum([
      "WORK_CONTRIBUTION",
      "ALLOCATION_REVISION",
      "MANUSCRIPT_ATTRIBUTION",
      "MANUSCRIPT",
      "PAPER_FILE",
      "MENTOR_SHARE",
      "PROJECT",
    ]),
    targetId: z.string().trim().max(120).nullable().optional(),
    respondentUserId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(5).max(10000),
    evidenceRefs: z
      .array(
        z.object({
          kind: z.string().trim().max(40),
          id: z.string().trim().max(120),
          label: z.string().trim().max(200).optional(),
        }),
      )
      .max(50)
      .optional()
      .default([]),
  })
  .strict();

export const respondIntegrityCaseSchema = z
  .object({
    note: z.string().trim().min(2).max(5000),
  })
  .strict();

export const containLeakIncidentSchema = z
  .object({
    actions: z
      .array(
        z.enum([
          "RESTRICT_EXPORT_OWNER_ONLY",
          "SET_PROJECT_PRIVATE",
          "REVOKE_ACTIVE_MENTOR_SHARES",
          "RESTRICT_AI_PLATFORM_ONLY",
        ]),
      )
      .min(1)
      .max(4),
    note: z.string().trim().max(2000).optional().default(""),
  })
  .strict();

export const resolveIntegrityCaseSchema = z
  .object({
    resolutionSummary: z.string().trim().min(5).max(5000),
    resultingStatus: z.enum(["RESOLVED", "CLOSED"]).optional().default("RESOLVED"),
  })
  .strict();

export const escalateIntegrityCaseSchema = z
  .object({
    reason: z.string().trim().min(5).max(2000),
  })
  .strict();

export const researchIntegrityService = {
  async listCases(
    projectInput: string,
    actorInput: string,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView[]> {
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Project not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
      });
      const isOwner = project.ownerId === actorRow.id;
      const isActiveMember = isOwner || membership?.status === "ACTIVE";
      const isAdmin = systemRole === "ADMIN";

      const where =
        isActiveMember || isAdmin
          ? { projectId: project.id }
          : {
              projectId: project.id,
              OR: [{ reporterId: actorRow.id }, { respondentUserId: actorRow.id }],
            };

      const rows = await tx.researchIntegrityCase.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (rows.length === 0 && !isActiveMember && !isAdmin) {
        const periods = await tx.projectMembershipPeriod.findMany({
          where: { projectId: project.id, userId: actorRow.id },
        });
        const mentor = await tx.mentorAccess.findFirst({
          where: { projectId: project.id, mentorUserId: actorRow.id },
        });
        if (periods.length === 0 && !mentor) throw AppError.notFound("Project not found");
      }

      return Promise.all(
        rows.map(row => this.hydrateCase(tx, project, row, actorRow.id, systemRole)),
      );
    });
  },

  async getCase(
    projectInput: string,
    actorInput: string,
    caseId: string,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView> {
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Case not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const row = await tx.researchIntegrityCase.findFirst({
        where: { id: caseId, projectId: project.id },
      });
      if (!row) throw AppError.notFound("Case not found");

      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
      });
      const isOwner = project.ownerId === actorRow.id;
      const isActiveMember = isOwner || membership?.status === "ACTIVE";
      const isAdmin = systemRole === "ADMIN";
      const isInvolved = row.reporterId === actorRow.id || row.respondentUserId === actorRow.id;

      if (!isActiveMember && !isAdmin && !isInvolved) {
        throw AppError.notFound("Case not found");
      }

      return this.hydrateCase(tx, project, row, actorRow.id, systemRole);
    });
  },

  async createCase(
    projectInput: string,
    actorInput: string,
    rawInput: CreateIntegrityCaseInput,
  ): Promise<ResearchIntegrityCaseView> {
    const input = createIntegrityCaseSchema.parse(rawInput);
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Project not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });

      const [membership, periods, mentorAccess] = await Promise.all([
        tx.projectMember.findUnique({
          where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
        }),
        tx.projectMembershipPeriod.findMany({
          where: { projectId: project.id, userId: actorRow.id },
        }),
        tx.mentorAccess.findFirst({
          where: { projectId: project.id, mentorUserId: actorRow.id },
        }),
      ]);

      const isEligibleFiler =
        project.ownerId === actorRow.id ||
        Boolean(membership) ||
        periods.length > 0 ||
        Boolean(mentorAccess);
      if (!isEligibleFiler) {
        throw AppError.notFound("Project not found");
      }

      if (input.respondentUserId) {
        await assertActiveProjectAccount(tx, input.respondentUserId);
      }

      let preservedSnapshot: Record<string, unknown> | null = null;
      if (input.kind === "DATA_LEAK_INCIDENT") {
        const [recentAudits, currentPolicies] = await Promise.all([
          tx.researchEvidenceEvent.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
          tx.project.findUniqueOrThrow({
            where: { id: project.id },
            select: {
              visibility: true,
              exportPolicy: true,
              aiDataPolicy: true,
              externalLookupPolicy: true,
            },
          }),
        ]);
        preservedSnapshot = {
          incidentReportedAt: new Date().toISOString(),
          policies: currentPolicies,
          recentAuditEventIds: recentAudits.map(a => a.id),
          reporterExplanation: input.description,
        };
      }

      const created = await tx.researchIntegrityCase.create({
        data: {
          projectId: project.id,
          kind: input.kind,
          status: "REPORTED",
          reporterId: actorRow.id,
          respondentUserId: input.respondentUserId || null,
          targetKind: input.targetKind,
          targetId: input.targetId || null,
          title: input.title,
          description: input.description,
          evidenceRefs: jsonSnapshot(input.evidenceRefs),
          preservedSnapshot: preservedSnapshot ? jsonSnapshot(preservedSnapshot) : undefined,
        },
      });

      await tx.researchIntegrityEvent.create({
        data: {
          caseId: created.id,
          projectId: project.id,
          actorId: actorRow.id,
          action: "REPORTED",
          note: input.title,
          metadata: { kind: input.kind, targetKind: input.targetKind },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId: actorRow.id,
        eventType: "INTEGRITY_CASE_OPENED",
        resourceKind: "INTEGRITY_CASE",
        resourceId: created.id,
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
        metadata: {
          kind: input.kind,
          targetKind: input.targetKind,
          title: input.title,
          respondentUserId: input.respondentUserId,
        },
      });

      return this.hydrateCase(tx, project, created, actorRow.id);
    });
  },

  async respondCase(
    projectInput: string,
    actorInput: string,
    caseId: string,
    rawInput: z.infer<typeof respondIntegrityCaseSchema>,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView> {
    const input = respondIntegrityCaseSchema.parse(rawInput);
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Case not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const row = await tx.researchIntegrityCase.findFirst({
        where: { id: caseId, projectId: project.id },
      });
      if (!row) throw AppError.notFound("Case not found");

      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
      });
      const isOwner = project.ownerId === actorRow.id;
      const isActiveMember = isOwner || membership?.status === "ACTIVE";
      const isAdmin = systemRole === "ADMIN";
      const isInvolved = row.reporterId === actorRow.id || row.respondentUserId === actorRow.id;

      if (!isActiveMember && !isAdmin && !isInvolved) {
        throw AppError.notFound("Case not found");
      }

      await tx.researchIntegrityEvent.create({
        data: {
          caseId: row.id,
          projectId: project.id,
          actorId: actorRow.id,
          action: "RESPONSE_ADDED",
          note: input.note,
        },
      });

      if (row.status === "REPORTED") {
        await tx.researchIntegrityCase.update({
          where: { id: row.id },
          data: { status: "UNDER_REVIEW" },
        });
      }

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId: actorRow.id,
        eventType: "INTEGRITY_CASE_RESPONDED",
        resourceKind: "INTEGRITY_CASE",
        resourceId: row.id,
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
        metadata: { caseId: row.id, noteLength: input.note.length },
      });

      const updated = await tx.researchIntegrityCase.findUniqueOrThrow({ where: { id: row.id } });
      return this.hydrateCase(tx, project, updated, actorRow.id, systemRole);
    });
  },

  async containLeakIncident(
    projectInput: string,
    actorInput: string,
    caseId: string,
    rawInput: z.infer<typeof containLeakIncidentSchema>,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView> {
    const input = containLeakIncidentSchema.parse(rawInput);
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Case not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const row = await tx.researchIntegrityCase.findFirst({
        where: { id: caseId, projectId: project.id },
      });
      if (!row) throw AppError.notFound("Case not found");
      if (row.kind !== "DATA_LEAK_INCIDENT") {
        throw AppError.badRequest("Containment actions apply to suspected data leak incidents only");
      }

      const isOwner = project.ownerId === actorRow.id;
      const isAdmin = systemRole === "ADMIN";
      if (!isOwner && !isAdmin) {
        throw AppError.forbidden("Only the project owner or administrator can apply containment");
      }

      const projectUpdates: Record<string, string> = {};
      if (input.actions.includes("RESTRICT_EXPORT_OWNER_ONLY")) {
        projectUpdates.exportPolicy = "OWNER_ONLY";
      }
      if (input.actions.includes("SET_PROJECT_PRIVATE")) {
        projectUpdates.visibility = "PRIVATE";
      }
      if (input.actions.includes("RESTRICT_AI_PLATFORM_ONLY")) {
        projectUpdates.externalLookupPolicy = "LOCAL_CORPUS_ONLY";
      }

      if (Object.keys(projectUpdates).length > 0) {
        await tx.project.update({
          where: { id: project.id },
          data: projectUpdates,
        });
      }

      if (input.actions.includes("REVOKE_ACTIVE_MENTOR_SHARES")) {
        await tx.mentorResourceShare.updateMany({
          where: { projectId: project.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      const existingActions = Array.isArray(row.containmentActions)
        ? (row.containmentActions as IntegrityContainmentAction[])
        : [];
      const mergedActions = [...new Set([...existingActions, ...input.actions])];

      await tx.researchIntegrityCase.update({
        where: { id: row.id },
        data: {
          containmentActions: jsonSnapshot(mergedActions),
          status: "CONTAINED",
        },
      });

      await tx.researchIntegrityEvent.create({
        data: {
          caseId: row.id,
          projectId: project.id,
          actorId: actorRow.id,
          action: "CONTAINMENT_APPLIED",
          note: input.note || "Containment applied to isolate research assets",
          metadata: { actions: input.actions },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId: actorRow.id,
        eventType: "PROJECT_LEAK_CONTAINMENT_APPLIED",
        resourceKind: "PROJECT",
        resourceId: project.id,
        reason: input.note || null,
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
        metadata: { caseId: row.id, actions: input.actions },
      });

      const updated = await tx.researchIntegrityCase.findUniqueOrThrow({ where: { id: row.id } });
      const liveProject = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
      return this.hydrateCase(tx, liveProject, updated, actorRow.id, systemRole);
    });
  },

  async escalateCase(
    projectInput: string,
    actorInput: string,
    caseId: string,
    rawInput: z.infer<typeof escalateIntegrityCaseSchema>,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView> {
    const input = escalateIntegrityCaseSchema.parse(rawInput);
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Case not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const row = await tx.researchIntegrityCase.findFirst({
        where: { id: caseId, projectId: project.id },
      });
      if (!row) throw AppError.notFound("Case not found");

      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: actorRow.id } },
      });
      const isOwner = project.ownerId === actorRow.id;
      const isActiveMember = isOwner || membership?.status === "ACTIVE";
      const isAdmin = systemRole === "ADMIN";
      const isInvolved = row.reporterId === actorRow.id || row.respondentUserId === actorRow.id;

      if (!isActiveMember && !isAdmin && !isInvolved) {
        throw AppError.notFound("Case not found");
      }

      const updated = await tx.researchIntegrityCase.update({
        where: { id: row.id },
        data: {
          status: "ESCALATED",
          escalatedAt: new Date(),
        },
      });

      await tx.researchIntegrityEvent.create({
        data: {
          caseId: row.id,
          projectId: project.id,
          actorId: actorRow.id,
          action: "ESCALATED",
          note: input.reason,
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId: actorRow.id,
        eventType: "INTEGRITY_CASE_ESCALATED",
        resourceKind: "INTEGRITY_CASE",
        resourceId: row.id,
        reason: input.reason,
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
        metadata: { caseId: row.id },
      });

      return this.hydrateCase(tx, project, updated, actorRow.id, systemRole);
    });
  },

  async resolveCase(
    projectInput: string,
    actorInput: string,
    caseId: string,
    rawInput: z.infer<typeof resolveIntegrityCaseSchema>,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView> {
    const input = resolveIntegrityCaseSchema.parse(rawInput);
    const db = getPrisma();
    const [projectRow, actorRow] = await Promise.all([
      db.project.findUnique({ where: workspaceId(projectInput) }),
      db.user.findUnique({ where: workspaceId(actorInput) }),
    ]);
    if (!projectRow || !actorRow) throw AppError.notFound("Case not found");

    return db.$transaction(async tx => {
      await lockProjectAccounts(tx, [actorRow.id], projectRow.id);
      await assertActiveProjectAccount(tx, actorRow.id);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectRow.id } });
      const row = await tx.researchIntegrityCase.findFirst({
        where: { id: caseId, projectId: project.id },
      });
      if (!row) throw AppError.notFound("Case not found");

      const isAdmin = systemRole === "ADMIN";
      const isOwner = project.ownerId === actorRow.id;
      const isAccused = row.respondentUserId === actorRow.id;
      const isEscalated = row.status === "ESCALATED";

      // Owner cannot resolve if accused or if escalated to institutional admin!
      if (isAccused && isOwner) {
        throw AppError.forbidden("An accused project owner cannot self-adjudicate this dispute. Institutional review is required.");
      }
      if (isEscalated && !isAdmin) {
        throw AppError.forbidden("Escalated cases require institutional administrator resolution.");
      }
      if (!isOwner && !isAdmin) {
        throw AppError.forbidden("Only the project owner or administrator can resolve this case.");
      }

      const updated = await tx.researchIntegrityCase.update({
        where: { id: row.id },
        data: {
          status: input.resultingStatus,
          resolvedAt: new Date(),
          resolvedById: actorRow.id,
          resolutionSummary: input.resolutionSummary,
        },
      });

      await tx.researchIntegrityEvent.create({
        data: {
          caseId: row.id,
          projectId: project.id,
          actorId: actorRow.id,
          action: "RESOLVED",
          note: input.resolutionSummary,
          metadata: { status: input.resultingStatus },
        },
      });

      await researchLedgerService.record({
        tx,
        projectId: project.id,
        actorId: actorRow.id,
        eventType: "INTEGRITY_CASE_RESOLVED",
        resourceKind: "INTEGRITY_CASE",
        resourceId: row.id,
        reason: input.resolutionSummary,
        visibility: "PROJECT_TEAM",
        retentionClass: "SECURITY_AUDIT",
        metadata: { caseId: row.id, status: input.resultingStatus },
      });

      return this.hydrateCase(tx, project, updated, actorRow.id, systemRole);
    });
  },

  async hydrateCase(
    tx: Db,
    project: { id: string; ownerId: string; status: string },
    row: {
      id: string;
      projectId: string;
      kind: string;
      status: string;
      reporterId: string;
      respondentUserId: string | null;
      targetKind: string;
      targetId: string | null;
      title: string;
      description: string;
      evidenceRefs: unknown;
      preservedSnapshot: unknown;
      containmentActions: unknown;
      escalatedAt: Date | null;
      resolvedAt: Date | null;
      resolvedById: string | null;
      resolutionSummary: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    actorId: string,
    systemRole?: string,
  ): Promise<ResearchIntegrityCaseView> {
    const rawEvents = await tx.researchIntegrityEvent.findMany({
      where: { caseId: row.id },
      orderBy: { createdAt: "asc" },
    });

    const userIds = [
      row.reporterId,
      ...(row.respondentUserId ? [row.respondentUserId] : []),
      ...(row.resolvedById ? [row.resolvedById] : []),
      ...rawEvents.map((e: { actorId: string }) => e.actorId),
    ];
    const people = await workspacePeople(tx, userIds);

    const isOwner = project.ownerId === actorId;
    const isAdmin = systemRole === "ADMIN";
    const isInvolved = row.reporterId === actorId || row.respondentUserId === actorId;
    const isAccusedOwner = isOwner && row.respondentUserId === actorId;
    const isEscalated = row.status === "ESCALATED";

    const viewerCanRespond =
      project.status !== "ARCHIVED" && (isOwner || isAdmin || isInvolved);
    const viewerCanContain =
      project.status !== "ARCHIVED" &&
      row.kind === "DATA_LEAK_INCIDENT" &&
      (isOwner || isAdmin);
    const viewerCanEscalate =
      project.status !== "ARCHIVED" &&
      row.status !== "ESCALATED" &&
      row.status !== "RESOLVED" &&
      row.status !== "CLOSED" &&
      (isOwner || isAdmin || isInvolved);
    const viewerCanResolve =
      project.status !== "ARCHIVED" &&
      row.status !== "RESOLVED" &&
      row.status !== "CLOSED" &&
      !isAccusedOwner &&
      ((isOwner && !isEscalated) || isAdmin);

    return {
      id: row.id,
      projectId: row.projectId,
      kind: row.kind as IntegrityCaseKind,
      status: row.status as IntegrityCaseStatus,
      reporter: people.get(row.reporterId) ?? { id: row.reporterId, name: "Reporter" },
      respondent: row.respondentUserId
        ? (people.get(row.respondentUserId) ?? { id: row.respondentUserId, name: "Respondent" })
        : null,
      targetKind: row.targetKind as IntegrityTargetKind,
      targetId: row.targetId,
      title: row.title,
      description: row.description,
      evidenceRefs: Array.isArray(row.evidenceRefs)
        ? (row.evidenceRefs as Array<{ kind: string; id: string; label?: string }>)
        : [],
      preservedSnapshot:
        row.preservedSnapshot && typeof row.preservedSnapshot === "object"
          ? (row.preservedSnapshot as Record<string, unknown>)
          : null,
      containmentActions: Array.isArray(row.containmentActions)
        ? (row.containmentActions as IntegrityContainmentAction[])
        : [],
      escalatedAt: row.escalatedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedById
        ? (people.get(row.resolvedById) ?? { id: row.resolvedById, name: "Reviewer" })
        : null,
      resolutionSummary: row.resolutionSummary,
      events: rawEvents.map((e: { id: string; actorId: string; action: string; note: string; metadata: unknown; createdAt: Date }) => ({
        id: e.id,
        actor: people.get(e.actorId) ?? { id: e.actorId, name: "Actor" },
        action: e.action as ResearchIntegrityEventView["action"],
        note: e.note,
        metadata:
          e.metadata && typeof e.metadata === "object"
            ? (e.metadata as Record<string, unknown>)
            : {},
        createdAt: e.createdAt.toISOString(),
      })),
      viewerCanRespond,
      viewerCanContain,
      viewerCanEscalate,
      viewerCanResolve,
      ownerAdjudicationBlocked: isAccusedOwner || isEscalated,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  },
};
