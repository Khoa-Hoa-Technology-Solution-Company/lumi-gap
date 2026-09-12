import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { validate } from "../../common/middleware/validate.js";
import {
  ListProjectTeamChatQuerySchema,
  DeleteProjectTeamChatMessageSchema,
  ProjectTeamChatMessageParamsSchema,
  ProjectTeamChatParamsSchema,
  SendProjectTeamChatMessageSchema,
} from "./dto/project-team-chat.schema.js";
import { projectTeamChatController } from "./project-team-chat.controller.js";

export const projectTeamChatRouter: Router = Router({ mergeParams: true });

const teamChatSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.TEAM_CHAT_MAX_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?.sub ?? "anonymous"}:${req.params.id}`,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Team chat message rate limit exceeded. Please slow down.",
      },
    }),
});

projectTeamChatRouter.post(
  "/",
  teamChatSendLimiter,
  validate(ProjectTeamChatParamsSchema, "params"),
  validate(SendProjectTeamChatMessageSchema),
  projectTeamChatController.sendMessage,
);

projectTeamChatRouter.get(
  "/events",
  validate(ProjectTeamChatParamsSchema, "params"),
  projectTeamChatController.streamEvents,
);

projectTeamChatRouter.get(
  "/",
  validate(ProjectTeamChatParamsSchema, "params"),
  validate(ListProjectTeamChatQuerySchema, "query"),
  projectTeamChatController.listMessages,
);

projectTeamChatRouter.post(
  "/:messageId/read",
  validate(ProjectTeamChatMessageParamsSchema, "params"),
  projectTeamChatController.markRead,
);

projectTeamChatRouter.delete(
  "/:messageId",
  validate(ProjectTeamChatMessageParamsSchema, "params"),
  validate(DeleteProjectTeamChatMessageSchema),
  projectTeamChatController.deleteMessage,
);
