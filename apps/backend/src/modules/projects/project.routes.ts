import { Router } from "express";
import {
  activityQuerySchema,
  addMemberSchema,
  addPaperSchema,
  createProjectSchema,
  inviteMemberSchema,
  invitationTokenParamsSchema,
  projectController,
  transferOwnershipSchema,
  updateProjectPaperSchema,
  updateProjectSchema,
} from "./project.controller.js";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { z } from "zod";
import { databaseIdSchema } from "../../common/validation/database-id.js";
import { projectChatRouter } from "./chat.routes.js";
import { projectTeamChatRouter } from "./team-chat.routes.js";
import {
  contributionProposalParamsSchema,
  projectContributionController,
  proposeContributionSchema,
  resolveContributionSchema,
} from "./project-contribution.controller.js";
import {
  mentorshipParamsSchema,
  projectMentorshipController,
  requestMentorshipSchema,
  respondMentorshipSchema,
} from "./project-mentorship.controller.js";

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
projectRouter.get("/:id", optionalAuth, validate(paramIdSchema, "params"), projectController.getProjectById);
projectRouter.use(requireAuth);

projectRouter.post("/", validate(createProjectSchema, "body"), projectController.createProject);
projectRouter.get("/", projectController.getProjectsByUser);
projectRouter.get("/invitations/mine", projectController.listMyInvitations);
projectRouter.post("/invitation-tokens/:token/accept", validate(invitationTokenParamsSchema, "params"), projectController.acceptInvitationByToken);
projectRouter.post("/invitation-tokens/:token/decline", validate(invitationTokenParamsSchema, "params"), projectController.declineInvitationByToken);
projectRouter.put("/:id", validate(paramIdSchema, "params"), validate(updateProjectSchema, "body"), projectController.updateProject);
projectRouter.delete("/:id", validate(paramIdSchema, "params"), projectController.deleteProject);
projectRouter.post("/:id/archive", validate(paramIdSchema, "params"), projectController.archiveProject);
projectRouter.post("/:id/leave", validate(paramIdSchema, "params"), projectController.leaveProject);
projectRouter.post("/:id/transfer-ownership", validate(paramIdSchema, "params"), validate(transferOwnershipSchema, "body"), projectController.transferOwnership);
projectRouter.get("/:id/activity", validate(paramIdSchema, "params"), validate(activityQuerySchema, "query"), projectController.listActivity);

projectRouter.get("/:id/mentorships", validate(paramIdSchema, "params"), projectMentorshipController.list);
projectRouter.post(
  "/:id/mentorships",
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

projectRouter.post("/:id/members", validate(paramIdSchema, "params"), validate(addMemberSchema, "body"), projectController.addMember);
projectRouter.delete("/:id/members/:memberId", validate(paramMemberIdSchema, "params"), projectController.removeMember);
projectRouter.post("/:id/invitations", validate(paramIdSchema, "params"), validate(inviteMemberSchema, "body"), projectController.inviteMember);
projectRouter.post("/:id/invitations/:invitationId/accept", validate(paramInvitationIdSchema, "params"), projectController.acceptInvitation);
projectRouter.post("/:id/invitations/:invitationId/decline", validate(paramInvitationIdSchema, "params"), projectController.declineInvitation);
projectRouter.post("/:id/invitations/:invitationId/cancel", validate(paramInvitationIdSchema, "params"), projectController.cancelInvitation);
