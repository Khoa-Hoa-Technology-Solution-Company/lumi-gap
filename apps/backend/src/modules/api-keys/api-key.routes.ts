import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { apiKeyController } from "./api-key.controller.js";
import { ApiKeyIdParamsSchema, CreateApiKeySchema, UpdateApiKeySchema } from "./api-key.schema.js";

/** Test calls spend provider quota; keep them bounded per admin. */
const testLimiter = createRateLimiter("admin-api-key-test", { windowMs: 60_000, limit: 20 });

/** Mounted at /admin/api-keys: the platform Gemini and OpenAlex key pool, admins only. */
export const apiKeyRouter: Router = Router();
apiKeyRouter.use(requireAuth, requireSystemRole("ADMIN"));
apiKeyRouter.get("/", apiKeyController.list);
apiKeyRouter.post("/", testLimiter, validate(CreateApiKeySchema), apiKeyController.create);
apiKeyRouter.patch("/:id", validate(ApiKeyIdParamsSchema, "params"), validate(UpdateApiKeySchema), apiKeyController.update);
apiKeyRouter.post("/:id/test", testLimiter, validate(ApiKeyIdParamsSchema, "params"), apiKeyController.test);
apiKeyRouter.delete("/:id", validate(ApiKeyIdParamsSchema, "params"), apiKeyController.remove);
