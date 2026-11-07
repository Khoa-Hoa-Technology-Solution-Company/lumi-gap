import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  ListTopicWatchesQuerySchema, TopicWatchParamsSchema, UpdateTopicWatchSchema, UpsertTopicWatchSchema,
} from "./dto/topic-watch.schema.js";
import { topicWatchController } from "./topic-watch.controller.js";

/** Admin: which catalogue entries the daily OpenAlex job keeps following. Mounted at /admin/topic-watches. */
export const topicWatchRouter: Router = Router();

topicWatchRouter.use(requireAuth, requireSystemRole("ADMIN"));

topicWatchRouter.get("/", validate(ListTopicWatchesQuerySchema, "query"), topicWatchController.list);
topicWatchRouter.post("/", validate(UpsertTopicWatchSchema), topicWatchController.upsert);
// Declared before the /:id routes so "run" is never captured as an id.
topicWatchRouter.post("/run", topicWatchController.run);
topicWatchRouter.patch("/:id", validate(TopicWatchParamsSchema, "params"), validate(UpdateTopicWatchSchema), topicWatchController.update);
topicWatchRouter.delete("/:id", validate(TopicWatchParamsSchema, "params"), topicWatchController.remove);
