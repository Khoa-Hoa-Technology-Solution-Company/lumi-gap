import { Router, type Request, type Response } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { authController } from "./auth.controller.js";
import {
  LoginSchema,
  RefreshSchema,
  RegisterSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
  OAuthExchangeSchema,
  RankingsQuerySchema,
  type RankingsQueryInput,
} from "./dto/auth.schema.js";
import { UserModel } from "./models/user.model.js";
import { calculateUserRankingStats } from "./points.service.js";
import passport from "./passport.js";
import { env } from "../../config/env.js";

export const authRouter: Router = Router();

authRouter.post("/register", validate(RegisterSchema), authController.register);
authRouter.post("/login", validate(LoginSchema), authController.login);
authRouter.post("/refresh", validate(RefreshSchema), authController.refresh);
authRouter.post("/logout", validate(RefreshSchema), authController.logout);
authRouter.post("/oauth/exchange", validate(OAuthExchangeSchema), authController.exchangeOAuthCode);
authRouter.get("/me", requireAuth, authController.me);
authRouter.patch("/me", requireAuth, validate(UpdateProfileSchema), authController.updateProfile);
authRouter.post("/change-password", requireAuth, validate(ChangePasswordSchema), authController.changePassword);

authRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
const primaryWebOrigin = env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.CORS_ORIGIN;
authRouter.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${primaryWebOrigin}/login?error=GoogleLoginFailed`,
  }),
  authController.googleCallback
);

/**
 * GET /auth/search?email=... — Search users by email for adding to projects.
 */
authRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  const emailQuery = req.query.email as string;
  if (!emailQuery || emailQuery.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  
  const users = await UserModel.find({
    email: { $regex: emailQuery, $options: "i" },
    isActive: { $ne: false },
  })
    .select("email fullName avatarUrl")
    .limit(10)
    .lean();
    
  res.json({
    success: true,
    data: users.map(u => ({
      id: u._id.toString(),
      email: u.email,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl
    }))
  });
});

/**
 * GET /auth/rankings/top?page=1&limit=20 — Paginated public leaderboard by points.
 * Returns the standard { success, data, meta } envelope (§6).
 */
authRouter.get("/rankings/top", validate(RankingsQuerySchema, "query"), async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as RankingsQueryInput;

  const total = await UserModel.countDocuments({ isActive: { $ne: false }, role: { $ne: "admin" } });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;

  const users = await UserModel.find({ isActive: { $ne: false }, role: { $ne: "admin" } })
    .select("fullName institution points credits role avatarUrl")
    .sort({ points: -1, credits: -1, fullName: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const rankings = users.map((u, i) => ({
    rank: skip + i + 1,
    id: u._id.toString(),
    name: u.fullName,
    university: u.institution ?? "",
    role: u.role,
    points: u.points ?? 0,
    credits: u.credits ?? 0,
    avatarUrl: u.avatarUrl ?? null,
  }));

  res.json({
    success: true,
    data: rankings,
    meta: { page: currentPage, limit, total, totalPages },
  });
});

/**
 * GET /auth/rankings/me — Get current user's rank and detailed stats.
 * Returns { success, data: { rank, user, stats } } for the "Your Position" sidebar.
 */
authRouter.get("/rankings/me", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.sub?.toString();
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  // Get how many users have MORE points (to determine rank)
  const userDoc = await UserModel.findById(userId).select("points fullName institution role avatarUrl").lean();
  if (!userDoc) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  if (userDoc.role === "admin") {
    res.json({ success: true, data: null });
    return;
  }

  const usersAhead = await UserModel.countDocuments({
    isActive: { $ne: false },
    role: { $ne: "admin" },
    $or: [
      { points: { $gt: userDoc.points ?? 0 } },
      {
        points: userDoc.points ?? 0,
        fullName: { $lt: userDoc.fullName },
      },
    ],
  });

  const rank = usersAhead + 1;
  const stats = await calculateUserRankingStats(userId);

  res.json({
    success: true,
    data: {
      rank,
      user: {
        id: userId,
        name: userDoc.fullName,
        university: userDoc.institution ?? "",
        role: userDoc.role,
        avatarUrl: userDoc.avatarUrl ?? null,
      },
      stats,
    },
  });
});

/**
 * GET /auth/rankings?limit=20 — Legacy simple endpoint (kept for backwards compat).
 * @deprecated Use /auth/rankings/top instead.
 */
authRouter.get("/rankings", async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const users = await UserModel.find({ isActive: { $ne: false }, role: { $ne: "admin" } })
    .select("fullName institution points credits role avatarUrl")
    .sort({ points: -1, credits: -1 })
    .limit(limit)
    .lean();

  const data = users.map((u, i) => ({
    rank: i + 1,
    id: u._id.toString(),
    name: u.fullName,
    university: u.institution ?? "",
    role: u.role,
    points: u.points ?? 0,
    credits: u.credits ?? 0,
    avatarUrl: u.avatarUrl ?? null,
  }));

  res.json({ success: true, data });
});
