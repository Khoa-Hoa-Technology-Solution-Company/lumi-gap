import { mentorResourceInboxSchema } from "./dto/mentor-access.schema.js";
import { mentorAccessController } from "./mentor-access.controller.js";
import { researchClassificationSchema } from "../taxonomy/research-classification.schema.js";
import { mentorshipApplicationsRouter } from "./mentorship-applications.routes.js";
import { mentorshipApplicationsService } from "./mentorship-applications.service.js";
import { applicationPageSchema } from "./dto/mentorship-application.schema.js";
import { Router } from "express";
import { projectContributionsRouter } from "./project-contributions.routes.js";
import {
  activityQuerySchema,
  addMemberSchema,
  addPaperSchema,
  auditEventsQuerySchema,
  createProjectSchema,
  inviteMemberSchema,
  invitationTokenParamsSchema,
  projectController,
  removeMemberBodySchema,
  securityOverviewQuerySchema,
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
import { mentorRolesService, proposeMentorRolesSchema, respondMentorRolesSchema } from "./mentor-roles.service.js";
import { env } from "../../config/env.js";
import { projectMentorshipService } from "./project-mentorship.service.js";
import { mentorPlanService } from "./mentor-plan.service.js";
import { mentorPlanCommandSchema } from "./dto/mentor-plan.schema.js";
import { mentorshipContentRouter } from "./mentorship-content.routes.js";
import { mentorAccessRouter } from "./mentor-access.routes.js";
import { getMentorWorkspace } from "./mentor-workspace.controller.js";
import { mentorWorkspaceQuerySchema } from "./dto/mentor-workspace.schema.js";
import { scientificIntegrityRouter } from "./scientific-integrity.routes.js";
import {
  contributionProposalParamsSchema,
  projectContributionController,
  proposeContributionSchema,
  resolveContributionSchema,
} from "./project-contribution.controller.js";
import {
  mentorshipParamsSchema, academicSearchSchema, mentorshipOfferSchema, suggestMentorSchema,
  mentorSuggestionsQuerySchema, dismissMentorSuggestionSchema,
  projectMentorshipController,
  previewDossierSchema,
  requestMentorshipInfoSchema, requestMentorshipSchema,
  respondMentorshipSchema, explainMentorSchema,
} from "./project-mentorship.controller.js";
import { analyzeResearchNeedsInputSchema, saveResearchNeedsInputSchema } from "./research-needs-analysis.service.js";
import {
  clarificationMessageSchema,
  counterProposalSchema,
  formalMentorshipProposalSchema,
  memberMentorshipConsentSchema,
  mentorRecruitmentProfileInputSchema,
  RESEARCH_SUPPORT_TYPE_VALUES,
} from "./mentorship-two-way.js";

import {
  researchIntegrityService,
  createIntegrityCaseSchema,
  respondIntegrityCaseSchema,
  containLeakIncidentSchema,
  escalateIntegrityCaseSchema,
  resolveIntegrityCaseSchema,
} from "./research-integrity.service.js";
import { contributionProtectionService } from "./contribution-protection.service.js";

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
const dossierPreviewLimiter = createRateLimiter("projects:mentorshipDossierPreview", { windowMs: 15 * 60 * 1000, limit: 60, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
const contextQuerySchema = z.object({ section: z.enum(["papers", "gaps", "reports", "evidence", "members"]).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(10) }).strict();
projectRouter.get("/academic-support/applications", requireAuth, requireResearchWorkflow, validate(applicationPageSchema, "query"), async (req, res) => { res.setHeader("Cache-Control", "private, no-store"); res.json({ success: true, data: await mentorshipApplicationsService.mine(req.user!.sub, req.query) }); });
projectRouter.get("/academic-support/preferences", requireAuth, requireResearchWorkflow, async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.preferences(req.user!.sub) });
});
projectRouter.patch("/academic-support/preferences", requireAuth, requireResearchWorkflow,
  validate(z.object({
    acceptingMentorships: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    locale: z.enum(["en", "vi"]).optional(),
    maxActiveProjects: z.number().int().min(1).max(20).nullable().optional(),
    externalGroupCount: z.number().int().min(0).max(20).nullable().optional(),
    supportTypes: z.array(z.enum(RESEARCH_SUPPORT_TYPE_VALUES)).max(8).optional(),
    preferredTopics: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
    preferredRoles: z.array(z.enum(["PRIMARY", "SECONDARY"])).max(2).optional(),
    expectedFrequency: z.string().trim().max(80).optional(),
    expectedDuration: z.string().trim().max(80).optional(),
    communicationMode: z.string().trim().max(80).optional(),
    note: z.string().trim().max(1000).optional(),
  }).strict()), async (req, res) => {
    res.json({ success: true, data: await projectMentorshipService.preferences(req.user!.sub, req.body) });
  });
const myContributionsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  role: z.string().trim().max(60).optional(),
  source: z.enum(["SYSTEM_RECORDED", "SELF_DECLARED", "TEAM_DECLARED", "MENTOR_RECORDED", "IMPORTED"]).optional(),
  status: z.enum(["RECORDED", "SELF_DECLARED", "PENDING_RESPONSE", "CLARIFICATION_REQUESTED", "ACKNOWLEDGED", "DISPUTED", "HISTORICAL"]).optional(),
  view: z.enum(["mine", "pending", "saved"]).optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
}).strict();
const myContributionsExportLimiter = createRateLimiter("projects:my-contributions-export", { windowMs: 60 * 60 * 1000, limit: 60, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
// Global Personal Contribution Profile — independent of active workspace access & CONTRIBUTIONS_VIEW
projectRouter.get("/my-contributions", requireAuth, validate(myContributionsQuerySchema, "query"), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ success: true, data: await contributionProtectionService.getGlobalPersonalContributions(req.user!.sub, myContributionsQuerySchema.parse(req.query)) });
});
projectRouter.get("/my-contributions/export", requireAuth, myContributionsExportLimiter, validate(myContributionsQuerySchema, "query"), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="my-research-contributions.json"`);
  res.json({ success: true, data: await contributionProtectionService.exportGlobalPersonalContributions(req.user!.sub, myContributionsQuerySchema.parse(req.query)) });
});
projectRouter.get("/academic-support/resources", requireAuth, requireResearchWorkflow, validate(mentorResourceInboxSchema, "query"), mentorAccessController.inbox);
projectRouter.get("/academic-support/workspace", requireAuth, requireResearchWorkflow, validate(mentorWorkspaceQuerySchema, "query"), getMentorWorkspace);
projectRouter.get("/academic-support/mine", requireAuth, requireResearchWorkflow, validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.mine(req.user!.sub, academicSearchSchema.parse(req.query)) });
});
projectRouter.get("/academic-support/available-mentors", requireAuth, requireResearchWorkflow, validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.availableMentors(req.user!.sub, academicSearchSchema.parse(req.query)) });
});
projectRouter.get("/academic-support/opportunities", requireAuth, requireResearchWorkflow, validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.discovery(req.user!.sub, academicSearchSchema.parse(req.query)) });
});
projectRouter.get("/academic-support/opportunities/:id", requireAuth, requireResearchWorkflow, validate(paramIdSchema, "params"), projectMentorshipController.opportunityDossier);
projectRouter.use("/academic-support/content", mentorshipContentRouter);
projectRouter.get("/trash", requireAuth, requireResearchWorkflow, projectController.listTrash);
projectRouter.get("/:id", optionalAuth, validate(paramIdSchema, "params"), projectController.getProjectById);
projectRouter.use(requireAuth, requireResearchWorkflow);
projectRouter.use("/:id/mentorship-applications", mentorshipApplicationsRouter);

const projectWriteLimiter = createRateLimiter("projects:membership-writes", { windowMs: 60 * 60 * 1000, limit: 60, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
projectRouter.post("/", projectWriteLimiter, validate(createProjectSchema, "body"), projectController.createProject);
projectRouter.get("/", validate(projectDirectoryQuerySchema, "query"), projectController.getProjectsByUser);
projectRouter.get("/invitations/mine", validate(projectDirectoryQuerySchema, "query"), projectController.listMyInvitations);
projectRouter.post("/invitation-tokens/:token/accept", validate(invitationTokenParamsSchema, "params"), projectController.acceptInvitationByToken);
projectRouter.post("/invitation-tokens/:token/decline", validate(invitationTokenParamsSchema, "params"), projectController.declineInvitationByToken);
projectRouter.put("/:id", validate(paramIdSchema, "params"), validate(updateProjectSchema, "body"), projectController.updateProject);
projectRouter.delete("/:id", validate(paramIdSchema, "params"), projectController.deleteProject);
projectRouter.delete("/:id/permanent", projectWriteLimiter, validate(paramIdSchema, "params"), projectController.permanentDeleteProject);
projectRouter.post("/:id/archive", validate(paramIdSchema, "params"), projectController.archiveProject);
projectRouter.post("/:id/restore", validate(paramIdSchema, "params"), projectController.restoreProject);
projectRouter.get("/:id/team", validate(paramIdSchema, "params"), validate(teamQuerySchema, "query"), projectController.team);
projectRouter.post("/:id/leave", validate(paramIdSchema, "params"), projectController.leaveProject);
projectRouter.post("/:id/transfer-ownership", validate(paramIdSchema, "params"), validate(transferOwnershipSchema, "body"), projectController.transferOwnership);
projectRouter.get("/:id/activity", validate(paramIdSchema, "params"), validate(activityQuerySchema, "query"), projectController.listActivity);
projectRouter.get("/:id/security", validate(paramIdSchema, "params"), validate(securityOverviewQuerySchema, "query"), projectController.getSecurityOverview);
projectRouter.get("/:id/security/audit-events", validate(paramIdSchema, "params"), validate(auditEventsQuerySchema, "query"), projectController.listAuditEvents);

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
projectRouter.post(
  "/:id/mentorships/dossier-preview",
  dossierPreviewLimiter,
  validate(paramIdSchema, "params"),
  validate(previewDossierSchema, "body"),
  projectMentorshipController.previewDossier,
);
projectRouter.get("/:id/mentorships", validate(paramIdSchema, "params"), validate(academicSearchSchema, "query"), projectMentorshipController.list);
projectRouter.get("/:id/mentorships/:relationshipId", validate(mentorshipParamsSchema, "params"), projectMentorshipController.detail);
projectRouter.get("/:id/mentorship-roles", validate(paramIdSchema, "params"), async (req, res) => { res.set("Cache-Control", "private, no-store").json({ success: true, data: await mentorRolesService.read(String(req.params.id), req.user!.sub) }); });
projectRouter.post("/:id/mentorship-roles", academicRequestLimiter, validate(paramIdSchema, "params"), validate(proposeMentorRolesSchema), async (req, res) => { res.status(201).json({ success: true, data: await mentorRolesService.propose(String(req.params.id), req.user!.sub, req.body) }); });
projectRouter.post("/:id/mentorship-roles/:proposalId/respond", academicRequestLimiter, validate(paramIdSchema.extend({ proposalId: z.string().uuid() }), "params"), validate(respondMentorRolesSchema), async (req, res) => { res.json({ success: true, data: await mentorRolesService.respond(String(req.params.id), req.user!.sub, String(req.params.proposalId), req.body.action) }); });
projectRouter.get("/:id/mentor-suggestions", validate(paramIdSchema, "params"), validate(mentorSuggestionsQuerySchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.suggestions(String(req.params.id), req.user!.sub, mentorSuggestionsQuerySchema.parse(req.query)) });
});
projectRouter.post("/:id/mentor-suggestions", academicRequestLimiter, validate(paramIdSchema, "params"), validate(suggestMentorSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await projectMentorshipService.suggest(String(req.params.id), req.user!.sub, req.body) });
});
projectRouter.post("/:id/mentor-suggestions/:suggestionId/dismiss", validate(paramIdSchema.extend({ suggestionId: z.string().uuid() }), "params"), validate(dismissMentorSuggestionSchema), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.dismissSuggestion(String(req.params.id), String(req.params.suggestionId), req.user!.sub, req.body.reason) });
});
const mentorRecommendationAiLimiter = createRateLimiter("mentor-recommendation:ai", { windowMs: 15 * 60 * 1000, limit: 25, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
projectRouter.get("/:id/mentor-recommendation/needs", validate(paramIdSchema, "params"), projectMentorshipController.getResearchNeeds);
projectRouter.post("/:id/mentor-recommendation/needs/analyze", mentorRecommendationAiLimiter, validate(paramIdSchema, "params"), validate(analyzeResearchNeedsInputSchema, "body"), projectMentorshipController.analyzeResearchNeeds);
projectRouter.put("/:id/mentor-recommendation/needs", validate(paramIdSchema, "params"), validate(saveResearchNeedsInputSchema, "body"), projectMentorshipController.saveResearchNeeds);
projectRouter.post("/:id/available-mentors/:mentorId/explanation", mentorRecommendationAiLimiter, validate(z.object({ id: databaseIdSchema, mentorId: databaseIdSchema }), "params"), validate(explainMentorSchema, "body"), projectMentorshipController.explainMentor);
projectRouter.get("/:id/available-mentors/:mentorId/evidence", validate(z.object({ id: databaseIdSchema, mentorId: databaseIdSchema }), "params"), projectMentorshipController.mentorEvidence);
projectRouter.get("/:id/available-mentors", validate(paramIdSchema, "params"), validate(academicSearchSchema, "query"), async (req, res) => {
  res.json({ success: true, data: await projectMentorshipService.mentors(String(req.params.id), req.user!.sub, academicSearchSchema.parse(req.query)) });
});
const topicSuggestionLimiter = createRateLimiter("mentor-topic-suggestions:start", { windowMs: 60_000, limit: 5, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false });
projectRouter.post("/:id/mentorship-topic-suggestions", topicSuggestionLimiter, validate(paramIdSchema, "params"), validate(z.object({ authorized: z.literal(true), expectedVersion: z.number().int().positive() }).strict()), projectMentorshipController.suggestTopics);
projectRouter.get("/:id/mentorship-topic-suggestions/:jobId", validate(paramIdSchema.extend({ jobId: z.string().regex(/^mentor-topics-[a-f0-9-]+$/).max(180) }), "params"), projectMentorshipController.topicSuggestionStatus);
const discoverySchema = z.object({ supportTypes: z.array(z.enum(RESEARCH_SUPPORT_TYPE_VALUES)).max(8).optional(), researchClassification: researchClassificationSchema.optional(), discovery: z.enum(["CLOSED", "SEEKING_MENTOR"]), summary: z.string().trim().max(2000), expertise: z.array(z.string().trim().min(1).max(120)).max(10), researchAreas: z.array(z.string().trim().min(1).max(120)).max(10).optional(), mentoringNeeds: z.string().trim().max(2000).optional(), methodologies: z.array(z.string().trim().min(2).max(120)).max(10).optional(), mentorshipProfile: mentorRecruitmentProfileInputSchema.optional(), expectedVersion: z.number().int().positive().optional() }).strict().refine(v => v.discovery === "CLOSED" || v.summary.length >= 10, "Add a safe summary before opening discovery");
projectRouter.get("/:id/academic-support", validate(paramIdSchema, "params"), validate(contextQuerySchema, "query"), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.workspace(String(req.params.id), req.user!.sub, undefined, contextQuerySchema.parse(req.query)) }); });
projectRouter.post("/:id/academic-support/guidance", academicRequestLimiter, validate(paramIdSchema, "params"), validate(z.object({ note: z.string().trim().min(1).max(2000) }).strict()), async (req, res) => { res.status(201).json({ success: true, data: await projectMentorshipService.workspace(String(req.params.id), req.user!.sub, req.body.note) }); });
projectRouter.get("/:id/mentorship-discovery", validate(paramIdSchema, "params"), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.settings(String(req.params.id), req.user!.sub) }); });
projectRouter.put("/:id/mentorship-discovery", validate(paramIdSchema, "params"), validate(discoverySchema), async (req, res) => { res.json({ success: true, data: await projectMentorshipService.settings(String(req.params.id), req.user!.sub, req.body) }); });
projectRouter.get("/:id/mentorship-discovery/preview", validate(paramIdSchema, "params"), projectMentorshipController.previewTeamDossier);
projectRouter.get("/:id/mentorship-profile-consent", validate(paramIdSchema, "params"), projectMentorshipController.getMyProfileConsent);
projectRouter.patch("/:id/mentorship-profile-consent", projectWriteLimiter, validate(paramIdSchema, "params"), validate(memberMentorshipConsentSchema), projectMentorshipController.updateMyProfileConsent);
projectRouter.post("/:id/mentorship-offers", academicRequestLimiter, validate(paramIdSchema, "params"), validate(mentorshipOfferSchema), async (req, res) => { res.status(201).json({ success: true, data: await projectMentorshipService.offer(String(req.params.id), req.user!.sub, req.body) }); });
projectRouter.post("/:id/mentorship-proposals", academicRequestLimiter, validate(paramIdSchema, "params"), validate(formalMentorshipProposalSchema), projectMentorshipController.propose);
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
  "/:id/mentorships/:relationshipId/counter-propose",
  academicRequestLimiter,
  validate(mentorshipParamsSchema, "params"),
  validate(counterProposalSchema, "body"),
  projectMentorshipController.counterPropose,
);
projectRouter.get(
  "/:id/mentorships/:relationshipId/messages",
  validate(mentorshipParamsSchema, "params"),
  projectMentorshipController.listMessages,
);
projectRouter.post(
  "/:id/mentorships/:relationshipId/messages",
  academicRequestLimiter,
  validate(mentorshipParamsSchema, "params"),
  validate(clarificationMessageSchema, "body"),
  projectMentorshipController.sendMessage,
);
projectRouter.post(
  "/:id/mentorships/:relationshipId/request-info", academicRequestLimiter, validate(mentorshipParamsSchema, "params"), validate(requestMentorshipInfoSchema, "body"), projectMentorshipController.requestInfo); projectRouter.post( "/:id/mentorships/:relationshipId/end",
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
projectRouter.use("/:id/scientific-integrity", scientificIntegrityRouter);

projectRouter.post("/:id/members", projectWriteLimiter, validate(paramIdSchema, "params"), validate(addMemberSchema, "body"), projectController.addMember);
projectRouter.delete("/:id/members/:memberId", validate(paramMemberIdSchema, "params"), validate(removeMemberBodySchema, "body"), projectController.removeMember);
projectRouter.post("/:id/invitations", projectWriteLimiter, validate(paramIdSchema, "params"), validate(inviteMemberSchema, "body"), projectController.inviteMember);
projectRouter.post("/:id/invitations/:invitationId/resend", projectWriteLimiter, validate(paramInvitationIdSchema, "params"), projectController.resendInvitation);
projectRouter.post("/:id/invitations/:invitationId/accept", validate(paramInvitationIdSchema, "params"), projectController.acceptInvitation);
projectRouter.post("/:id/invitations/:invitationId/decline", validate(paramInvitationIdSchema, "params"), projectController.declineInvitation);
projectRouter.post("/:id/invitations/:invitationId/cancel", validate(paramInvitationIdSchema, "params"), projectController.cancelInvitation);
