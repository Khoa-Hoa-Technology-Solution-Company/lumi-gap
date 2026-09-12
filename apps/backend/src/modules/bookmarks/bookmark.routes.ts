import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { bookmarkService } from "./bookmark.service.js";
import { CreateBookmarkSchema, UpdateBookmarkSchema } from "./dto/bookmark.schema.js";
import { AppError } from "../../common/exceptions/app-error.js";

export const bookmarkRouter: Router = Router();

// Ensure all bookmark routes require authentication
bookmarkRouter.use(requireAuth);

/** GET /bookmarks/check?targetKind=&targetId= - Check status */
bookmarkRouter.get("/check", async (req, res) => {
  const targetKind = req.query.targetKind as "paper" | "report";
  const targetId = req.query.targetId as string;

  if (!targetKind || !targetId) {
    throw AppError.badRequest("Missing targetKind or targetId query parameter");
  }

  if (targetKind !== "paper" && targetKind !== "report") {
    throw AppError.badRequest("Invalid targetKind");
  }

  const status = await bookmarkService.checkStatus(req.user!.sub, targetKind, targetId);
  res.json({ success: true, data: status });
});

/** GET /bookmarks - List user's bookmarks */
bookmarkRouter.get("/", async (req, res) => {
  const bookmarks = await bookmarkService.list(req.user!.sub);
  res.json({ success: true, data: bookmarks });
});

/** POST /bookmarks - Create a bookmark */
bookmarkRouter.post("/", validate(CreateBookmarkSchema), async (req, res) => {
  const bookmark = await bookmarkService.create(req.user!.sub, req.body);
  res.status(201).json({ success: true, data: bookmark });
});

/** PATCH /bookmarks/:id - Update note */
bookmarkRouter.patch("/:id", validate(UpdateBookmarkSchema), async (req, res) => {
  const bookmark = await bookmarkService.updateNote(req.user!.sub, req.params.id as string, req.body);
  res.json({ success: true, data: bookmark });
});

/** DELETE /bookmarks/:id - Delete a bookmark */
bookmarkRouter.delete("/:id", async (req, res) => {
  await bookmarkService.delete(req.user!.sub, req.params.id as string);
  res.json({ success: true, data: { ok: true } });
});
