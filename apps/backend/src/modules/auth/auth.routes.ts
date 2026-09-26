import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
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
  UpdateAcademicProfileSchema,
  type RankingsQueryInput,
  VerifyEmailSchema,
  ResendEmailVerificationSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "./dto/auth.schema.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";

export const authRouter: Router = Router();

const credentialLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
const tokenLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });
const recoveryLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false });

authRouter.post("/register", credentialLimiter, validate(RegisterSchema), authController.register);
authRouter.post("/login", credentialLimiter, validate(LoginSchema), authController.login);
authRouter.post("/refresh", tokenLimiter, validate(RefreshSchema), authController.refresh);
authRouter.post("/logout", validate(RefreshSchema), authController.logout);
authRouter.post("/email/verify", tokenLimiter, validate(VerifyEmailSchema), authController.verifyEmail);
authRouter.post("/email/resend", recoveryLimiter, validate(ResendEmailVerificationSchema), authController.resendEmailVerification);
authRouter.post("/password/forgot", recoveryLimiter, validate(ForgotPasswordSchema), authController.forgotPassword);
authRouter.post("/password/reset", recoveryLimiter, validate(ResetPasswordSchema), authController.resetPassword);
authRouter.post("/oauth/exchange", validate(OAuthExchangeSchema), authController.exchangeOAuthCode);
authRouter.get("/me", requireAuth, authController.me);
authRouter.get("/status", requireAuth, authController.status);
authRouter.patch("/me", requireAuth, validate(UpdateProfileSchema), authController.updateProfile);
authRouter.patch(
  "/me/academic-profile",
  requireAuth,
  validate(UpdateAcademicProfileSchema),
  authController.updateAcademicProfile,
);
authRouter.post("/change-password", requireAuth, validate(ChangePasswordSchema), authController.changePassword);

authRouter.get("/google", recoveryLimiter, authController.googleStart);
authRouter.get("/google/callback", authController.googleCallback);

/**
 * GET /auth/search?email=... — Search users by email for adding to projects.
 */
authRouter.get("/search", requireAuth, async (req: Request, res: Response) => {
  const emailQuery = req.query.email as string;
  if (!emailQuery || emailQuery.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  
  const users = await getPrisma().user.findMany({
    where: { email: { contains: emailQuery, mode: "insensitive" }, isActive: true },
    select: { id: true, legacyMongoId: true, email: true, fullName: true, avatarUrl: true },
    take: 10,
  });
    
  res.json({
    success: true,
    data: users.map(u => ({
      id: publicDatabaseId(u),
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

  const prisma = getPrisma();
  const total = await prisma.user.count({ where: { isActive: true, role: { not: "admin" } } });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: "admin" } },
    select: {
      id: true, legacyMongoId: true, fullName: true, institution: true, points: true,
      credits: true, role: true, academicProfileType: true, avatarUrl: true,
    },
    orderBy: [{ points: "desc" }, { credits: "desc" }, { fullName: "asc" }],
    skip,
    take: limit,
  });

  const rankings = users.map((u, i) => ({
    rank: skip + i + 1,
    id: publicDatabaseId(u),
    name: u.fullName,
    university: u.institution ?? "",
    role: u.academicProfileType ?? (u.role === "student" || u.role === "researcher" || u.role === "lecturer" ? u.role : undefined),
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
  const prisma = getPrisma();
  const parsedId = parseDatabaseId(userId);
  const userDoc = parsedId
    ? await prisma.user.findUnique({
        where: parsedId.kind === "uuid" ? { id: parsedId.value } : { legacyMongoId: parsedId.value },
        select: {
          id: true, legacyMongoId: true, points: true, fullName: true, institution: true,
          role: true, academicProfileType: true, avatarUrl: true, penaltyPoints: true,
        },
      })
    : null;
  if (!userDoc) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }

  if (userDoc.role === "admin") {
    res.json({ success: true, data: null });
    return;
  }

  const usersAhead = await prisma.user.count({
    where: {
      isActive: true,
      role: { not: "admin" },
      OR: [
        { points: { gt: userDoc.points } },
        { points: userDoc.points, fullName: { lt: userDoc.fullName } },
      ],
    },
  });

  const rank = usersAhead + 1;
  const [uploadAggregate, uploadedPdfs, requestedPapers, ratedPapers] = await Promise.all([
    prisma.paper.aggregate({
      where: {
        uploadedById: userDoc.id,
        paperStatus: { in: ["not-downloaded", "downloaded"] },
        pdfPath: { not: null },
      },
      _sum: { uploadCreditReward: true },
    }),
    prisma.paper.count({
      where: {
        uploadedById: userDoc.id,
        paperStatus: { in: ["not-downloaded", "downloaded"] },
        pdfPath: { not: null },
      },
    }),
    prisma.paper.count({
      where: {
        requestedById: userDoc.id,
        paperStatus: { in: ["not-downloaded", "downloaded", "pending", "rejected"] },
      },
    }),
    prisma.userRating.findMany({
      where: { userId: userDoc.id, paperId: { not: null } },
      distinct: ["paperId"],
      select: { paperId: true },
    }),
  ]);
  const uploadCreditReward = uploadAggregate._sum.uploadCreditReward ?? 0;
  const stats = {
    points: Math.max(0, uploadCreditReward + ratedPapers.length * 5 - userDoc.penaltyPoints),
    uploadCreditReward,
    uploadedPdfs,
    requestedPapers,
    ratingsGiven: ratedPapers.length,
    penaltyPoints: userDoc.penaltyPoints,
  };

  res.json({
    success: true,
    data: {
      rank,
      user: {
        id: publicDatabaseId(userDoc),
        name: userDoc.fullName,
        university: userDoc.institution ?? "",
        role: userDoc.academicProfileType ?? (userDoc.role === "student" || userDoc.role === "researcher" || userDoc.role === "lecturer" ? userDoc.role : undefined),
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
  const users = await getPrisma().user.findMany({
    where: { isActive: true, role: { not: "admin" } },
    select: {
      id: true, legacyMongoId: true, fullName: true, institution: true, points: true,
      credits: true, role: true, academicProfileType: true, avatarUrl: true,
    },
    orderBy: [{ points: "desc" }, { credits: "desc" }],
    take: limit,
  });

  const data = users.map((u, i) => ({
    rank: i + 1,
    id: publicDatabaseId(u),
    name: u.fullName,
    university: u.institution ?? "",
    role: u.academicProfileType ?? (u.role === "student" || u.role === "researcher" || u.role === "lecturer" ? u.role : undefined),
    points: u.points ?? 0,
    credits: u.credits ?? 0,
    avatarUrl: u.avatarUrl ?? null,
  }));

  res.json({ success: true, data });
});
