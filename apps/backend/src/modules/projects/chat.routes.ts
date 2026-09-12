import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { validate } from "../../common/middleware/validate.js";
import {
  ListProjectChatQuerySchema,
  PinProjectChatMessageSchema,
  ProjectChatMessageParamsSchema,
  ProjectChatParamsSchema,
  SendProjectChatMessageSchema,
  StreamProjectChatQuerySchema,
} from "./dto/project-chat.schema.js";
import { projectChatController } from "./project-chat.controller.js";

export const projectChatRouter: Router = Router({ mergeParams: true });

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.CHAT_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Project chat rate limit exceeded — try again later.",
      },
    }),
});

projectChatRouter.post(
  "/",
  chatLimiter,
  validate(ProjectChatParamsSchema, "params"),
  validate(SendProjectChatMessageSchema),
  projectChatController.sendMessage,
);

projectChatRouter.get(
  "/events",
  validate(ProjectChatParamsSchema, "params"),
  validate(StreamProjectChatQuerySchema, "query"),
  projectChatController.streamEvents,
);

projectChatRouter.get(
  "/",
  validate(ProjectChatParamsSchema, "params"),
  validate(ListProjectChatQuerySchema, "query"),
  projectChatController.listHistory,
);

projectChatRouter.patch(
  "/:messageId/pin",
  validate(ProjectChatMessageParamsSchema, "params"),
  validate(PinProjectChatMessageSchema),
  projectChatController.setPinned,
);
