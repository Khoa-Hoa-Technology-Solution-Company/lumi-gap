import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { notificationService } from "./notification.service.js";
import { RegisterDeviceTokenSchema } from "./dto/device-token.schema.js";

export const notificationRouter: Router = Router();

notificationRouter.post("/device-token", requireAuth, validate(RegisterDeviceTokenSchema), async (req, res, next) => {
  try {
    const token = await notificationService.registerDeviceToken(String(req.user!.sub), req.body);
    res.status(201).json({
      success: true,
      data: {
        id: token._id.toString(),
        platform: token.platform,
        lastSeenAt: token.lastSeenAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

notificationRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user!.sub);
    const role = String(req.user!.role);
    const notifications = await notificationService.list(userId, role);
    res.json({ success: true, data: notifications });
  } catch (error) {
    next(error);
  }
});

notificationRouter.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user!.sub);
    await notificationService.markAsRead(String(req.params.id), userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

notificationRouter.post("/read-all", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user!.sub);
    const role = String(req.user!.role);
    await notificationService.markAllAsRead(userId, role);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
