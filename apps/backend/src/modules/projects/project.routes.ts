import { Router } from "express";
import { projectContributionsRouter } from "./project-contributions.routes.js";
import {
  activityQuerySchema,
  addMemberSchema,
  addPaperSchema,
  createProjectSchema,
  inviteMemberSchema,
  invitationTokenParamsSchema,
  projectController,
  removeMemberBodySchema,
  transferOwnershipSchema,
  updateProjectPaperSchema,
  updateProjectSchema,
  teamQuerySchema,
  projectDirectoryQuerySchema,
} from "./project.controller.js";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { validate } from "../../common/middleware/validate.js";
import { z } from "zod";
import { databaseIdSchema } from "../../common/validation/database-id.js";
import { projectChatRouter } from "./chat.routes.js";
import { projectTeamChatRouter } from "./team-chat.routes.js";
import { projectWorkspaceRouter } from "./project-workspace.routes.js";
import { projectResearchRouter } from "./project-research.routes.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { env } from "../../config/env.js";
import { projectMentorshipService } from "./project-mentorship.service.js";
import { mentorPlanService } from "./mentor-plan.service.js";
import { mentorPlanCommandSchema } from "./dto/mentor-plan.schema.js";
import { mentorshipContentRouter } from "./mentorship-content.routes.js";
import { mentorAccessRouter } from "./mentor-access.routes.js";
import {
  contributionProposalParamsSchema,
  projectContributionController,
  proposeContributionSchema,
  resolveContributionSchema,
} from "./project-contribution.controller.js";
import {
  mentorshipParamsSchema, academicSearchSchema, mentorshipOfferSchema, suggestMentorSchema,
  projectMentorshipController,
  requestMentorshipSchema,
  respondMentorshipSchema,
} from "./project-mentorship.controller.js";

import {
  researchIntegrityService,
  createIntegrityCaseSchema,
  respondIntegrityCaseSchema,
  containLeakIncidentSchema,
  escalateIntegrityCaseSchema,
  resolveIntegrityCaseSchema,
} from "./research-integrity.service.js";

export const projectRouter: Router = Router();

const paramIdSchema = z.object({
  id: databaseIdSchema,
});

const paramPaperIdSchema = paramIdSchema.extend({
  paperId: databaseIdSchema,
});

const paramMemberIdSchema = paramIdSchema.extend({
  memberId: databaseIdSchema,
});

const paramInvitationIdSchema = paramIdSchema.extend({
  invitationId: z.string().uuid(),
});

projectRouter.get("/invitation-tokens/:token", optionalAuth, validate(invitationTokenParamsSchema, "params"), projectController.getInvitationByToken);
const academicRequestLimiter = createRateLimiter("projects:academicRequestLimiter", { windowMs: 60 * 60 * 1000, limit: env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
const contextQuerySchema = z.object({ section: z.enum(["papers", "gaps", "reports", "evidence", "members"]).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(10) }).strict();
projectRouter.get("/academic-support/preferences", requireAuth, requireResearchWorkflow, async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.preferences(req.user!.sub) });
});
projectRouter.patch("/academic-support/preferences", requireAuth, requireResearchWorkflow,
  validate(z.object({ acceptingMentorships: z.boolean().optional(), emailEnabled: z.boolean().optional(), locale: z.enum(["en", "vi"]).optional() }).strict()), async (req, res) => {
    res.json({ success: true, data: await projectMentorshipService.preferences(req.user!.sub, req.body) });
  });
projectRouter.get("/academic-support/mine", requireAuth, requireResearchWorkflow, validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.mine(req.user!.sub, academicSearchSchema.parse(req.query)) });
});
projectRouter.get("/academic-support/opportunities", requireAuth, requireResearchWorkflow, validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.discovery(req.user!.sub, academicSearchSchema.parse(req.query)) });
});
projectRouter.use("/academic-support/content", mentorshipContentRouter);
projectRouter.get("/:id", optionalAuth, validate(paramIdSchema, "params"), projectController.getProjectById);
projectRouter.use(requireAuth, requireResearchWorkflow);

const projectWriteLimiter = createRateLimiter("projects:membership-writes", { windowMs: 60 * 60 * 1000, limit: 60, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
projectRouter.post("/", projectWriteLimiter, validate(createProjectSchema, "body"), projectController.createProject);
projectRouter.get("/", validate(projectDirectoryQuerySchema, "query"), projectController.getProjectsByUser);
projectRouter.get("/invitations/mine", validate(projectDirectoryQuerySchema, "query"), projectController.listMyInvitations);
projectRouter.post("/invitation-tokens/:token/accept", validate(invitationTokenParamsSchema, "params"), projectController.acceptInvitationByToken);
projectRouter.post("/invitation-tokens/:token/decline", validate(invitationTokenParamsSchema, "params"), projectController.declineInvitationByToken);
projectRouter.put("/:id", validate(paramIdSchema, "params"), validate(updateProjectSchema, "body"), projectController.updateProject);
projectRouter.delete("/:id", validate(paramIdSchema, "params"), projectController.deleteProject);
projectRouter.post("/:id/archive", validate(paramIdSchema, "params"), projectController.archiveProject);
projectRouter.post("/:id/restore", validate(paramIdSchema, "params"), projectController.restoreProject);
projectRouter.get("/:id/team", validate(paramIdSchema, "params"), validate(teamQuerySchema, "query"), projectController.team);
projectRouter.post("/:id/leave", validate(paramIdSchema, "params"), projectController.leaveProject);
projectRouter.post("/:id/transfer-ownership", validate(paramIdSchema, "params"), validate(transferOwnershipSchema, "body"), projectController.transferOwnership);
projectRouter.get("/:id/activity", validate(paramIdSchema, "params"), validate(activityQuerySchema, "query"), projectController.listActivity);
projectRouter.get("/:id/security", validate(paramIdSchema, "params"), projectController.getSecurityOverview);

const caseParams = paramIdSchema.extend({ caseId: z.string().uuid() });
projectRouter.get("/:id/integrity-cases", validate(paramIdSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await researchIntegrityService.listCases(String(req.params.id), req.user!.sub, req.user?.role) });
});
projectRouter.post("/:id/integrity-cases", projectWriteLimiter, validate(paramIdSchema, "params"), validate(createIntegrityCaseSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await researchIntegrityService.createCase(String(req.params.id), req.user!.sub, req.body) });
});
projectRouter.get("/:id/integrity-cases/:caseId", validate(caseParams, "params"), async (req, res) => {
  res.json({ success: true, data: await researchIntegrityService.getCase(String(req.params.id), req.user!.sub, String(req.params.caseId), req.user?.role) });
});
projectRouter.post("/:id/integrity-cases/:caseId/responses", projectWriteLimiter, validate(caseParams, "params"), validate(respondIntegrityCaseSchema), async (req, res) => {
  res.json({ success: true, data: await researchIntegrityService.respondCase(String(req.params.id), req.user!.sub, String(req.params.caseId), req.body, req.user?.role) });
});
projectRouter.post("/:id/integrity-cases/:caseId/contain", projectWriteLimiter, validate(caseParams, "params"), validate(containLeakIncidentSchema), async (req, res) => {
  res.json({ success: true, data: await researchIntegrityService.containLeakIncident(String(req.params.id), req.user!.sub, String(req.params.caseId), req.body, req.user?.role) });
});
projectRouter.post("/:id/integrity-cases/:caseId/escalate", projectWriteLimiter, validate(caseParams, "params"), validate(escalateIntegrityCaseSchema), async (req, res) => {
  res.json({ success: true, data: await researchIntegrityService.escalateCase(String(req.params.id), req.user!.sub, String(req.params.caseId), req.body, req.user?.role) });
});
projectRouter.post("/:id/integrity-cases/:caseId/resolve", projectWriteLimiter, validate(caseParams, "params"), validate(resolveIntegrityCaseSchema), async (req, res) => {
  res.json({ success: true, data: await researchIntegrityService.resolveCase(String(req.params.id), req.user!.sub, String(req.params.caseId), req.body, req.user?.role) });
});

projectRouter.get("/:id/mentor-plan", validate(paramIdSchema, "params"), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ success: true, data: await mentorPlanService.read(String(req.params.id), req.user!.sub) });
});
projectRouter.post("/:id/mentor-plan", academicRequestLimiter, validate(paramIdSchema, "params"), validate(mentorPlanCommandSchema), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ success: true, data: await mentorPlanService.change(String(req.params.id), req.user!.sub, req.body) });
});
projectRouter.get("/:id/mentorships", validate(paramIdSchema, "params"), validate(academicSearchSchema, "query"), projectMentorshipController.list);
projectRouter.get("/:id/mentorships/:relationshipId", validate(mentorshipParamsSchema, "params"), projectMentorshipController.detail);
projectRouter.get("/:id/mentor-suggestions", validate(paramIdSchema, "params"), validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.suggestions(String(req.params.id), req.user!.sub, academicSearchSchema.parse(req.query)) });
});
projectRouter.post("/:id/mentor-suggestions", academicRequestLimiter, validate(paramIdSchema, "params"), validate(suggestMentorSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await projectMentorshipService.suggest(String(req.params.id), req.user!.sub, req.body) });
});
projectRouter.post("/:id/mentor-suggestions/:suggestionId/dismiss", validate(paramIdSchema.extend({ suggestionId: z.string().uuid() }), "params"), validate(z.object({}).strict()), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.dismissSuggestion(String(req.params.id), String(req.params.suggestionId), req.user!.sub) });
});
projectRouter.get("/:id/available-mentors", validate(paramIdSchema, "params"), validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.mentors(String(req.params.id), req.user!.sub, academicSearchSchema.parse(req.query)) });
});
const discoverySchema = z.object({ discovery: z.enum(["CLOSED", "SEEKING_MENTOR"]), summary: z.string().trim().max(2000), expertise: z.array(z.string().trim().min(1).max(120)).max(10), researchAreas: z.array(z.string().trim().min(1).max(120)).max(10).optional(), mentoringNeeds: z.string().trim().max(2000).optional(), expectedVersion: z.number().int().positive().optional() }).strict().refine(v => v.discovery === "CLOSED" || v.summary.length >= 10, "Add a safe summary before opening discovery");
projectRouter.get("/:id/academic-support", validate(paramIdSchema, "params"), validate(contextQuerySchema, "query"), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.workspace(String(req.params.id), req.user!.sub, undefined, contextQuerySchema.parse(req.query)) }); });
projectRouter.post("/:id/academic-support/guidance", academicRequestLimiter, validate(paramIdSchema, "params"), validate(z.object({ note: z.string().trim().min(1).max(2000) }).strict()), async (req, res) => { res.status(201).json({ success: true, data: await projectMentorshipService.workspace(String(req.params.id), req.user!.sub, req.body.note) }); });
projectRouter.get("/:id/mentorship-discovery", validate(paramIdSchema, "params"), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.settings(String(req.params.id), req.user!.sub) }); });
projectRouter.put("/:id/mentorship-discovery", validate(paramIdSchema, "params"), validate(discoverySchema), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.settings(String(req.params.id), req.user!.sub, req.body) }); });
projectRouter.post("/:id/mentorship-offers", academicRequestLimiter, validate(paramIdSchema, "params"), validate(mentorshipOfferSchema), async (req, res) => { res.status(201).json({ success: true, data: await projectMentorshipService.offer(String(req.params.id), req.user!.sub, req.body) }); });
projectRouter.post("/:id/mentorships/:relationshipId/cancel", validate(mentorshipParamsSchema, "params"), validate(respondMentorshipSchema), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.cancel(String(req.params.id), String(req.params.relationshipId), req.user!.sub, req.body.note) }); });
projectRouter.post(
  "/:id/mentorships",
  academicRequestLimiter,
  validate(paramIdSchema, "params"),
  validate(requestMentorshipSchema, "body"),
  projectMentorshipController.request,
);
projectRouter.post(
  "/:id/mentorships/:relationshipId/accept",
  validate(mentorshipParamsSchema, "params"),
  validate(respondMentorshipSchema, "body"),
  projectMentorshipController.accept,
);
projectRouter.post(
  "/:id/mentorships/:relationshipId/decline",
  validate(mentorshipParamsSchema, "params"),
  validate(respondMentorshipSchema, "body"),
  projectMentorshipController.decline,
);
projectRouter.post(
  "/:id/mentorships/:relationshipId/end",
  validate(mentorshipParamsSchema, "params"),
  validate(respondMentorshipSchema, "body"),
  projectMentorshipController.end,
);

projectRouter.use("/:id/contributions", projectContributionsRouter);
projectRouter.get("/:id/contributions", validate(paramIdSchema, "params"), projectContributionController.list);
projectRouter.post(
  "/:id/contributions/proposals",
  validate(paramIdSchema, "params"),
  validate(proposeContributionSchema, "body"),
  projectContributionController.propose,
);
projectRouter.post(
  "/:id/contributions/:proposalId/confirm",
  validate(contributionProposalParamsSchema, "params"),
  validate(resolveContributionSchema, "body"),
  projectContributionController.confirm,
);
projectRouter.post(
  "/:id/contributions/:proposalId/reject",
  validate(contributionProposalParamsSchema, "params"),
  validate(resolveContributionSchema, "body"),
  projectContributionController.reject,
);

projectRouter.post("/:id/papers", validate(paramIdSchema, "params"), validate(addPaperSchema, "body"), projectController.addPaper);
projectRouter.patch("/:id/papers/:paperId", validate(paramPaperIdSchema, "params"), validate(updateProjectPaperSchema, "body"), projectController.updatePaper);
projectRouter.delete("/:id/papers/:paperId", validate(paramPaperIdSchema, "params"), projectController.removePaper);

projectRouter.use("/:id/chat", projectChatRouter);
projectRouter.use("/:id/team-chat", projectTeamChatRouter);
projectRouter.use("/:id", projectWorkspaceRouter);
projectRouter.use("/:id/research", projectResearchRouter);
projectRouter.use("/:id/mentor-access", mentorAccessRouter);

projectRouter.post("/:id/members", projectWriteLimiter, validate(paramIdSchema, "params"), validate(addMemberSchema, "body"), projectController.addMember);
projectRouter.delete("/:id/members/:memberId", validate(paramMemberIdSchema, "params"), validate(removeMemberBodySchema, "body"), projectController.removeMember);
projectRouter.post("/:id/invitations", projectWriteLimiter, validate(paramIdSchema, "params"), validate(inviteMemberSchema, "body"), projectController.inviteMember);
projectRouter.post("/:id/invitations/:invitationId/resend", projectWriteLimiter, validate(paramInvitationIdSchema, "params"), projectController.resendInvitation);
projectRouter.post("/:id/invitations/:invitationId/accept", validate(paramInvitationIdSchema, "params"), projectController.acceptInvitation);
projectRouter.post("/:id/invitations/:invitationId/decline", validate(paramInvitationIdSchema, "params"), projectController.declineInvitation);
projectRouter.post("/:id/invitations/:invitationId/cancel", validate(paramInvitationIdSchema, "params"), projectController.cancelInvitation);
