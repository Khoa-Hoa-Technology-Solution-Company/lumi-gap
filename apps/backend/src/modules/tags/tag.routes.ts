import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { CatalogIdParamsSchema } from "../taxonomy/dto/taxonomy.schema.js";
import {
  CreateTagSchema, ListTagsQuerySchema, ReplaceRulesSchema, UpdateTagSchema,
} from "./dto/tag.schema.js";
import { tagController } from "./tag.controller.js";

/** Admin management of curated tags and their rules. Mounted at /admin/tags. */
export const tagRouter: Router = Router();

tagRouter.use(requireAuth, requireSystemRole("ADMIN"));

tagRouter.get("/", validate(ListTagsQuerySchema, "query"), tagController.list);
tagRouter.post("/", validate(CreateTagSchema), tagController.create);
tagRouter.get("/:id", validate(CatalogIdParamsSchema, "params"), tagController.get);
tagRouter.patch("/:id", validate(CatalogIdParamsSchema, "params"), validate(UpdateTagSchema), tagController.update);
tagRouter.put(
  "/:id/rules",
  validate(CatalogIdParamsSchema, "params"),
  validate(ReplaceRulesSchema),
  tagController.replaceRules,
);
tagRouter.delete("/:id", validate(CatalogIdParamsSchema, "params"), tagController.archive);
tagRouter.get("/:id/preview", validate(CatalogIdParamsSchema, "params"), tagController.preview);
