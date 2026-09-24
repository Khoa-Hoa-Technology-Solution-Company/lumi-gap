import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Profile } from "passport-google-oauth20";
import type { AuthResponse, AuthTokens, User, UserRole } from "@trend/shared-types";

import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { AuthClaims } from "../../common/middleware/auth.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { User as PrismaUser } from "../../generated/prisma/client.js";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateAcademicProfileInput,
  UpdateProfileInput,
} from "./dto/auth.schema.js";

const BCRYPT_ROUNDS = 10;

function userWhere(userId: string): { id: string } | { legacyMongoId: string } | null {
  const parsed = parseDatabaseId(userId);
  if (!parsed) return null;
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function findUser(userId: string): Promise<PrismaUser | null> {
  const where = userWhere(userId);
  return where ? getPrisma().user.findUnique({ where }) : null;
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const prisma = getPrisma();
    const email = input.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw AppError.conflict("Email already registered");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName: input.fullName,
          role: "user",
          credits: env.INITIAL_USER_CREDITS,
        },
      });
      const tokens = await issueTokens(user);
      return { user: toUserDto(user), tokens };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Email already registered");
      throw error;
    }
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await getPrisma().user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user) throw AppError.unauthorized("Invalid credentials");
    if (!user.passwordHash) {
      throw AppError.unauthorized("This account uses Google Login. Please sign in with Google.");
    }
    if (!await bcrypt.compare(input.password, user.passwordHash)) {
      throw AppError.unauthorized("Invalid credentials");
    }
    if (!user.isActive) throw AppError.forbidden("Account has been disabled");

    const tokens = await issueTokens(user);
    return { user: toUserDto(user), tokens };
  },

  async googleLogin(profile: Profile): Promise<AuthResponse> {
    const rawEmail = profile.emails?.[0]?.value;
    if (!rawEmail) throw AppError.badRequest("Google profile missing email");
    const email = rawEmail.trim().toLowerCase();
    const prisma = getPrisma();

    let user = await prisma.user.findUnique({ where: { googleId: profile.id } });
    if (!user) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            googleId: profile.id,
            avatarUrl: existing.avatarUrl ?? profile.photos?.[0]?.value,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            googleId: profile.id,
            fullName: profile.displayName || "Google User",
            avatarUrl: profile.photos?.[0]?.value,
            role: "user",
            credits: env.INITIAL_USER_CREDITS,
          },
        });
      }
    }
    if (!user.isActive) throw AppError.forbidden("Account has been disabled");

    const tokens = await issueTokens(user);
    return { user: toUserDto(user), tokens };
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    let payload: AuthClaims;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthClaims;
    } catch {
      throw AppError.unauthorized("Invalid refresh token");
    }

    const prisma = getPrisma();
    const claimed = await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw AppError.unauthorized("Invalid refresh token");

    const user = await findUser(payload.sub);
    if (!user) throw AppError.unauthorized();
    if (!user.isActive) throw AppError.forbidden("Account has been disabled");
    return issueTokens(user);
  },

  async logout(refreshToken: string): Promise<void> {
    await getPrisma().refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async me(userId: string): Promise<User> {
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    return toUserDto(user);
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    const updated = await getPrisma().user.update({
      where: { id: user.id },
      data: {
        fullName: input.fullName,
        institution: input.institution === undefined ? undefined : input.institution || null,
        researchInterests: input.researchInterests,
      },
    });
    return toUserDto(updated);
  },

  async updateAcademicProfile(userId: string, input: UpdateAcademicProfileInput): Promise<User> {
    const prisma = getPrisma();
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    const previousType = user.academicProfileType ?? legacyAcademicProfile(user.role);
    const resetVerification = previousType !== input.academicProfileType;

    const updated = await prisma.$transaction(async (transaction) => {
      const nextUser = await transaction.user.update({
        where: { id: user.id },
        data: { academicProfileType: input.academicProfileType },
      });
      const profile = await transaction.academicProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          ...(resetVerification ? { verificationStatus: "SELF_DECLARED" } : {}),
        },
        update: resetVerification
          ? {
              verificationStatus: "SELF_DECLARED",
              verificationRequestedAt: null,
              verifiedAt: null,
              verifiedById: null,
              rejectedAt: null,
              rejectedById: null,
              rejectionReason: null,
              verificationMethod: null,
              verificationNote: null,
            }
          : {},
        select: { id: true },
      });
      if (resetVerification) {
        await transaction.academicVerificationEvidence.deleteMany({ where: { profileId: profile.id } });
      }
      return nextUser;
    });
    return toUserDto(updated);
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    if (!user.passwordHash) throw AppError.badRequest("Cannot change password for OAuth-only accounts");
    if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) {
      throw AppError.badRequest("Invalid current password");
    }
    await getPrisma().user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS) },
    });
  },
};

async function issueTokens(user: PrismaUser): Promise<AuthTokens> {
  const claims: AuthClaims = {
    sub: publicDatabaseId(user),
    email: user.email,
    role: user.role as UserRole,
    academicProfileType: user.academicProfileType as User["academicProfileType"]
      ?? legacyAcademicProfile(user.role),
  };
  const accessToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
  const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
  const decoded = jwt.decode(refreshToken) as { exp: number };
  await getPrisma().refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });
  const accessDecoded = jwt.decode(accessToken) as { exp: number };
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(accessDecoded.exp * 1000).toISOString(),
  };
}

function legacyAcademicProfile(role: string): User["academicProfileType"] {
  return role === "student" || role === "researcher" || role === "lecturer" ? role : undefined;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toUserDto(user: PrismaUser): User {
  return {
    id: publicDatabaseId(user),
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    academicProfileType: user.academicProfileType as User["academicProfileType"]
      ?? legacyAcademicProfile(user.role),
    avatarUrl: user.avatarUrl ?? undefined,
    institution: user.institution ?? undefined,
    researchInterests: user.researchInterests,
    isActive: user.isActive,
    points: user.points,
    credits: user.credits,
    penaltyPoints: user.penaltyPoints,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
