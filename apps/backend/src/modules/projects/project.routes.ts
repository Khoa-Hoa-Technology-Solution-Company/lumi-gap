import { Router } from "express";
import { projectController, createProjectSchema, updateProjectSchema, addMemberSchema, addPaperSchema } from "./project.controller.js";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { z } from "zod";
import { projectChatRouter } from "./chat.routes.js";
import { projectTeamChatRouter } from "./team-chat.routes.js";

export const projectRouter: Router = Router();

const paramIdSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid project ID format"),
});

const paramPaperIdSchema = paramIdSchema.extend({
  paperId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid paper ID format"),
});

const paramMemberIdSchema = paramIdSchema.extend({
  memberId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid member ID format"),
});

projectRouter.use(requireAuth);

projectRouter.post("/", validate(createProjectSchema, "body"), projectController.createProject);
projectRouter.get("/", projectController.getProjectsByUser);
projectRouter.get("/:id", validate(paramIdSchema, "params"), projectController.getProjectById);
projectRouter.put("/:id", validate(paramIdSchema, "params"), validate(updateProjectSchema, "body"), projectController.updateProject);
projectRouter.delete("/:id", validate(paramIdSchema, "params"), projectController.deleteProject);

projectRouter.post("/:id/papers", validate(paramIdSchema, "params"), validate(addPaperSchema, "body"), projectController.addPaper);
projectRouter.delete("/:id/papers/:paperId", validate(paramPaperIdSchema, "params"), projectController.removePaper);

projectRouter.use("/:id/chat", projectChatRouter);
projectRouter.use("/:id/team-chat", projectTeamChatRouter);

projectRouter.post("/:id/members", validate(paramIdSchema, "params"), validate(addMemberSchema, "body"), projectController.addMember);
projectRouter.delete("/:id/members/:memberId", validate(paramMemberIdSchema, "params"), projectController.removeMember);
