import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { CatalogIdParamsSchema } from "../taxonomy/dto/taxonomy.schema.js";
import {
  AddTagPapersSchema, CreateTagSchema, ListTagPapersQuerySchema, ListTagsQuerySchema, ReplaceRulesSchema,
  TagPaperParamsSchema, UpdateTagSchema,
} from "./dto/tag.schema.js";
import { tagController } from "./tag.controller.js";

/** Admin management of curated tags and their rules. Mounted at /admin/tags. */
export const tagRouter: Router = Router();

tagRouter.use(requireAuth, requireSystemRole("ADMIN"));

tagRouter.get("/", validate(ListTagsQuerySchema, "query"), tagController.list);
tagRouter.post("/", validate(CreateTagSchema), tagController.create);
// Declared before the /:id routes so "apply-all" is never captured as an id.
tagRouter.post("/apply-all", tagController.applyAll);
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
tagRouter.post("/:id/apply", validate(CatalogIdParamsSchema, "params"), tagController.apply);
tagRouter.get(
  "/:id/papers",
  validate(CatalogIdParamsSchema, "params"),
  validate(ListTagPapersQuerySchema, "query"),
  tagController.listPapers,
);
tagRouter.post(
  "/:id/papers",
  validate(CatalogIdParamsSchema, "params"),
  validate(AddTagPapersSchema),
  tagController.addPapers,
);
tagRouter.delete("/:id/papers/:paperId", validate(TagPaperParamsSchema, "params"), tagController.removePaper);
tagRouter.post("/:id/papers/:paperId/unblock", validate(TagPaperParamsSchema, "params"), tagController.unblockPaper);
