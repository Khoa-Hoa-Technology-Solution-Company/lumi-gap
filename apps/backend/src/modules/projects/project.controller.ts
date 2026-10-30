import type { Request, Response } from "express";
import { z } from "zod";
import { databaseIdSchema } from "../../common/validation/database-id.js";
import { researchLedgerService } from "../audit/research-ledger.service.js";
import { projectService } from "./project.service.js";

const projectStatusSchema = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]);
const projectVisibilitySchema = z.enum(["PRIVATE", "PUBLIC", "INVITE_ONLY", "PUBLIC_SUMMARY"]);
const projectExportPolicySchema = z.enum(["ALL_MEMBERS", "OWNER_ONLY"]);
const projectAiDataPolicySchema = z.enum(["ALLOW_PERSONAL_AI", "PLATFORM_AI_ONLY", "DISABLED"]);
const projectExternalLookupPolicySchema = z.enum(["ALLOW_PUBLIC_INDEX", "LOCAL_CORPUS_ONLY"]);
const researchAreasSchema = z.array(z.string().trim().min(1).max(120)).max(3)
  .refine(areas => new Set(areas.map(area => area.toLocaleLowerCase())).size === areas.length, "Choose distinct research areas");
const approachSchema = z.enum(["EXPLORATORY", "LITERATURE_REVIEW", "EMPIRICAL", "UNDECIDED"]);

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(5000).optional(),
  researchField: z.string().trim().max(200).optional(),
  status: projectStatusSchema.exclude(["ARCHIVED"]).optional(),
  visibility: projectVisibilitySchema.optional(),
  researchAreas: researchAreasSchema.optional(),
  researchApproach: approachSchema.optional(),
  idempotencyKey: z.string().uuid().optional(),
}).strict();

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  researchField: z.string().trim().max(200).nullable().optional(),
  status: projectStatusSchema.optional(),
  visibility: projectVisibilitySchema.optional(),
  publicSummary: z.string().trim().max(2000).optional(),
  researchAreas: researchAreasSchema.optional(),
  researchApproach: approachSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
  inclusionCriteria: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  exclusionCriteria: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  exportPolicy: projectExportPolicySchema.optional(),
  aiDataPolicy: projectAiDataPolicySchema.optional(),
  externalLookupPolicy: projectExternalLookupPolicySchema.optional(),
}).strict().refine((value) => Object.keys(value).some(key => key !== "expectedVersion"), "At least one field is required");

/**
 * Legacy "add member" body, kept for older clients (Flutter sends an email as targetId and a
 * lowercase role). It no longer adds anyone directly: it sends an invitation the person must accept.
 */
export const addMemberSchema = z.object({
  targetKind: z.literal("User").optional(),
  targetId: z.union([databaseIdSchema, z.string().trim().email().max(320)]),
  role: z.string().trim().toUpperCase().pipe(z.literal("MEMBER")).optional(),
});

export const addPaperSchema = z.object({ paperId: databaseIdSchema, proposalReason: z.string().trim().max(2000).optional() }).strict();

export const updateProjectPaperSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  screeningStatus: z.enum(["UNDECIDED", "INCLUDED", "EXCLUDED", "MAYBE"]).optional(),
  readingStatus: z.enum(["NOT_STARTED", "READING", "REVIEWED"]).optional(),
  inclusionReason: z.string().trim().max(2000).nullable().optional(),
  exclusionReason: z.enum(["WRONG_RESEARCH_TOPIC", "WRONG_POPULATION_CONTEXT", "WRONG_METHODOLOGY", "NOT_PEER_REVIEWED", "INSUFFICIENT_RELEVANT_EVIDENCE", "DUPLICATE", "OTHER"]).nullable().optional(),
  exclusionNote: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one paper field is required");

export const inviteMemberSchema = z.object({
  userId: databaseIdSchema.optional(),
  email: z.string().trim().email().max(320).optional(),
  message: z.string().trim().max(1000).optional(),
}).strict().refine((value) => Boolean(value.userId) !== Boolean(value.email), "Select one user or enter one email address");

export const removeMemberBodySchema = z.object({ reason: z.string().trim().max(1000).optional() }).strict().default({});
export const transferOwnershipSchema = z.object({ userId: databaseIdSchema });
export const activityQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
export const projectDirectoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
}).strict();
export const teamQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  invitationPage: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export const invitationTokenParamsSchema = z.object({ token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/) });

export class ProjectController {
  async createProject(req: Request, res: Response) {
    const project = await projectService.createProject(req.body, req.user!.sub);
    res.status(201).json({ success: true, data: project });
  }

  async team(req: Request, res: Response) {
    const result = await projectService.team(String(req.params.id), req.user!.sub, teamQuerySchema.parse(req.query));
    res.json({ success: true, data: result });
  }

  async resendInvitation(req: Request, res: Response) {
    const result = await projectService.resendInvitation(String(req.params.id), String(req.params.invitationId), req.user!.sub);
    res.json({ success: true, data: result });
  }

  async restoreProject(req: Request, res: Response) {
    res.json({ success: true, data: await projectService.restoreProject(String(req.params.id), req.user!.sub) });
  }

  async getProjectsByUser(req: Request, res: Response) {
    const result = await projectService.getProjectsPageByUser(req.user!.sub, projectDirectoryQuerySchema.parse(req.query));
    res.json({ success: true, data: result.items, meta: result.meta });
  }

  async getProjectById(req: Request, res: Response) {
    // Visibility may be revoked at any moment; neither shared caches nor browser caches may reuse this DTO.
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Authorization");
    const project = req.user
      ? await projectService.getProjectById(req.params.id as string, req.user.sub)
      : await projectService.getPublicProjectById(req.params.id as string);
    res.json({ success: true, data: project });
  }

  async updateProject(req: Request, res: Response) {
    const project = await projectService.updateProject(req.params.id as string, req.body, req.user!.sub);
    res.json({ success: true, data: project });
  }

  async archiveProject(req: Request, res: Response) {
    const project = await projectService.archiveProject(req.params.id as string, req.user!.sub);
    res.json({ success: true, data: project });
  }

  async deleteProject(req: Request, res: Response) {
    await projectService.deleteProject(req.params.id as string, req.user!.sub);
    res.json({ success: true, data: { deleted: true } });
  }

  async addPaper(req: Request, res: Response) {
    const project = await projectService.addPaperToProject(req.params.id as string, req.body.paperId, req.user!.sub, req.body.proposalReason);
    res.status(201).json({ success: true, data: project });
  }

  async updatePaper(req: Request, res: Response) {
    const paper = await projectService.updateProjectPaper(req.params.id as string, req.params.paperId as string, req.body, req.user!.sub);
    res.json({ success: true, data: paper });
  }

  async removePaper(req: Request, res: Response) {
    const project = await projectService.removePaperFromProject(req.params.id as string, req.params.paperId as string, req.user!.sub);
    res.json({ success: true, data: project });
  }

  async inviteMember(req: Request, res: Response) {
    const invitation = await projectService.inviteMember(req.params.id as string, req.body, req.user!.sub);
    res.status(201).json({ success: true, data: invitation });
  }

  async listMyInvitations(req: Request, res: Response) {
    const result = await projectService.getMyInvitationPage(req.user!.sub, projectDirectoryQuerySchema.parse(req.query));
    res.json({ success: true, data: result.items, meta: result.meta });
  }

  async getInvitationByToken(req: Request, res: Response) {
    const invitation = await projectService.getInvitationByToken(req.params.token as string, req.user?.sub);
    res.json({ success: true, data: invitation });
  }

  async acceptInvitationByToken(req: Request, res: Response) {
    const result = await projectService.respondToInvitationByToken(req.params.token as string, req.user!.sub, "ACCEPTED");
    res.json({ success: true, data: result });
  }

  async declineInvitationByToken(req: Request, res: Response) {
    const result = await projectService.respondToInvitationByToken(req.params.token as string, req.user!.sub, "DECLINED");
    res.json({ success: true, data: result });
  }

  async acceptInvitation(req: Request, res: Response) {
    const result = await projectService.respondToInvitation(req.params.id as string, req.params.invitationId as string, req.user!.sub, "ACCEPTED");
    res.json({ success: true, data: result });
  }

  async declineInvitation(req: Request, res: Response) {
    const result = await projectService.respondToInvitation(req.params.id as string, req.params.invitationId as string, req.user!.sub, "DECLINED");
    res.json({ success: true, data: result });
  }

  async cancelInvitation(req: Request, res: Response) {
    await projectService.cancelInvitation(req.params.id as string, req.params.invitationId as string, req.user!.sub);
    res.json({ success: true, data: { cancelled: true } });
  }

  /** POST /projects/:id/members — legacy alias of POST /projects/:id/invitations; returns the invitation. */
  async addMember(req: Request, res: Response) {
    const invitation = await projectService.addMemberToProject(req.params.id as string, req.body, req.user!.sub);
    res.status(201).json({ success: true, data: invitation });
  }

  async removeMember(req: Request, res: Response) {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const project = await projectService.removeMemberFromProject(req.params.id as string, req.params.memberId as string, req.user!.sub, reason);
    res.json({ success: true, data: project });
  }

  async leaveProject(req: Request, res: Response) {
    await projectService.leaveProject(req.params.id as string, req.user!.sub);
    res.json({ success: true, data: { left: true } });
  }

  async transferOwnership(req: Request, res: Response) {
    const project = await projectService.transferOwnership(req.params.id as string, req.body.userId, req.user!.sub);
    res.json({ success: true, data: project });
  }

  async getSecurityOverview(req: Request, res: Response) {
    res.setHeader("Cache-Control", "private, no-store");
    const overview = await researchLedgerService.getProjectSecurityOverview(String(req.params.id), req.user!.sub);
    res.json({ success: true, data: overview });
  }

  async listActivity(req: Request, res: Response) {
    const activity = await projectService.listActivity(req.params.id as string, req.user!.sub, req.query.limit as unknown as number);
    res.json({ success: true, data: activity });
  }
}

export const projectController = new ProjectController();
