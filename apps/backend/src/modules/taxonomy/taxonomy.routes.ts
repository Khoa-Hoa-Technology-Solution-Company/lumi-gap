import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  CatalogIdParamsSchema, ListKeywordsQuerySchema, ListNodesQuerySchema, MergeKeywordSchema,
  UpdateKeywordSchema, UpdateNodeSchema,
} from "./dto/taxonomy.schema.js";
import { taxonomyController } from "./taxonomy.controller.js";

/** Admin catalogue of the OpenAlex taxonomy tree and keywords. Mounted at /admin/taxonomy. */
export const taxonomyRouter: Router = Router();

taxonomyRouter.use(requireAuth, requireSystemRole("ADMIN"));

taxonomyRouter.get("/stats", taxonomyController.stats);
taxonomyRouter.get("/nodes", validate(ListNodesQuerySchema, "query"), taxonomyController.listNodes);
taxonomyRouter.get("/nodes/:id", validate(CatalogIdParamsSchema, "params"), taxonomyController.getNode);
taxonomyRouter.patch(
  "/nodes/:id",
  validate(CatalogIdParamsSchema, "params"),
  validate(UpdateNodeSchema),
  taxonomyController.updateNode,
);
taxonomyRouter.get("/keywords", validate(ListKeywordsQuerySchema, "query"), taxonomyController.listKeywords);
taxonomyRouter.patch(
  "/keywords/:id",
  validate(CatalogIdParamsSchema, "params"),
  validate(UpdateKeywordSchema),
  taxonomyController.updateKeyword,
);
taxonomyRouter.post(
  "/keywords/:id/merge",
  validate(CatalogIdParamsSchema, "params"),
  validate(MergeKeywordSchema),
  taxonomyController.mergeKeyword,
);
