import { Router } from "express";
import { projectController, createProjectSchema, updateProjectSchema, addMemberSchema, addPaperSchema } from "./project.controller.js";
import { requireAuth } from "../../common/middleware/auth.js";
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

projectRouter.use(requireAuth);

projectRouter.post("/", validate(createProjectSchema, "body"), projectController.createProject);
projectRouter.get("/", projectController.getProjectsByUser);
projectRouter.get("/:id", validate(paramIdSchema, "params"), projectController.getProjectById);
projectRouter.put("/:id", validate(paramIdSchema, "params"), validate(updateProjectSchema, "body"), projectController.updateProject);
projectRouter.delete("/:id", validate(paramIdSchema, "params"), projectController.deleteProject);

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
projectRouter.delete("/:id/papers/:paperId", validate(paramPaperIdSchema, "params"), projectController.removePaper);

projectRouter.use("/:id/chat", projectChatRouter);
projectRouter.use("/:id/team-chat", projectTeamChatRouter);

projectRouter.post("/:id/members", validate(paramIdSchema, "params"), validate(addMemberSchema, "body"), projectController.addMember);
projectRouter.delete("/:id/members/:memberId", validate(paramMemberIdSchema, "params"), projectController.removeMember);
