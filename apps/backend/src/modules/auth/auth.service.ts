import crypto from "node:crypto";
import { isAdminSystemRole, type AuthResponse, type AuthTokens, type PrimaryPosition, type SystemRole, type User } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { User as PrismaUser } from "../../generated/prisma/client.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { authMailService } from "./auth-mail.service.js";
import { passwordService } from "./password.service.js";
import { createOpaqueToken, hashOpaqueToken, tokenService } from "./token.service.js";
import type {
  ChangePasswordInput, LoginInput, RegisterInput, ResetPasswordInput,
  UpdateAcademicProfileInput, UpdateProfileInput,
} from "./dto/auth.schema.js";

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1_000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1_000;

export interface SessionContext { userAgent?: string; ipAddress?: string }
export interface GoogleIdentity { subject: string; email: string; emailVerified: boolean; name: string; picture?: string }

function userWhere(userId: string): { id: string } | { legacyMongoId: string } | null {
  const parsed = parseDatabaseId(userId);
  if (!parsed) return null;
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function findUser(userId: string): Promise<PrismaUser | null> {
  const where = userWhere(userId);
  return where ? getPrisma().user.findUnique({ where }) : null;
}

function durationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) throw new Error("JWT_REFRESH_TTL must use s, m, h, or d units");
  const amount = Number(match[1]);
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return amount * factor;
}

function inferPrimaryPosition(title?: string, explicit?: PrimaryPosition): PrimaryPosition {
  if (explicit && explicit !== "OTHER") return explicit;
  if (!title) return explicit || "OTHER";
  const lower = title.toLowerCase().trim();
  if (
    lower.includes("student") ||
    lower.includes("undergraduate") ||
    lower.includes("master") ||
    lower.includes("phd") ||
    lower.includes("bachelor") ||
    lower.includes("học viên") ||
    lower.includes("sinh viên") ||
    lower.includes("nghiên cứu sinh")
  ) {
    return "STUDENT";
  }
  if (
    lower.includes("lecturer") ||
    lower.includes("professor") ||
    lower.includes("faculty") ||
    lower.includes("giảng viên") ||
    lower.includes("giáo viên") ||
    lower.includes("trợ giảng") ||
    lower.includes("teaching")
  ) {
    return "LECTURER";
  }
  if (
    lower.includes("research") ||
    lower.includes("postdoc") ||
    lower.includes("scientist") ||
    lower.includes("fellow") ||
    lower.includes("viện") ||
    lower.includes("nghiên cứu viên")
  ) {
    return "RESEARCH_STAFF";
  }
  return "OTHER";
}

function legacyProfileType(position: PrimaryPosition): "student" | "lecturer" | "researcher" | null {
  if (position === "STUDENT") return "student";
  if (position === "LECTURER") return "lecturer";
  if (position === "RESEARCH_STAFF") return "researcher";
  return null;
}

async function createEmailVerification(user: PrismaUser): Promise<void> {
  if (user.emailVerifiedAt) return;
  const rawToken = createOpaqueToken();
  const now = new Date();
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id, consumedAt: null } });
    await tx.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS) },
    });
  });
  await authMailService.sendEmailVerification(user.email, rawToken);
}

async function issueTokens(user: PrismaUser, context: SessionContext = {}, familyId = crypto.randomUUID()): Promise<AuthTokens> {
  const refreshToken = createOpaqueToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + durationMs(env.JWT_REFRESH_TTL));
  await getPrisma().refreshToken.create({
    data: {
      id: sessionId,
      userId: user.id,
      familyId,
      tokenHash: hashOpaqueToken(refreshToken),
      userAgent: context.userAgent?.slice(0, 500),
      ipAddress: context.ipAddress?.slice(0, 64),
      expiresAt,
    },
  });
  const access = tokenService.signAccessToken({
    sub: publicDatabaseId(user),
    systemRole: user.systemRole as SystemRole,
    sessionId: familyId,
  });
  return { accessToken: access.token, refreshToken, accessTokenExpiresAt: access.expiresAt.toISOString() };
}

async function toUserDto(user: PrismaUser): Promise<User> {
  const [profile, capabilities] = await Promise.all([
    getPrisma().academicProfile.findUnique({ where: { userId: user.id } }),
    capabilityService.list(user.id),
  ]);
  const primaryPosition = profile?.primaryPosition as PrimaryPosition | null ?? undefined;
  return {
    id: publicDatabaseId(user),
    email: user.email,
    fullName: user.fullName,
    role: isAdminSystemRole(user.systemRole) ? "admin" : "user",
    systemRole: user.systemRole as SystemRole,
    accountStatus: user.accountStatus as User["accountStatus"],
    academicProfileType: user.academicProfileType as User["academicProfileType"] ?? undefined,
    primaryPosition,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
    capabilities,
    onboarding: { completed: Boolean(user.onboardingCompletedAt && primaryPosition) },
    avatarUrl: user.avatarUrl ?? undefined,
    institution: user.institution ?? undefined,
    researchInterests: user.researchInterests,
    isActive: user.accountStatus === "ACTIVE",
    points: user.points,
    credits: user.credits,
    penaltyPoints: user.penaltyPoints,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const authService = {
  async register(input: RegisterInput, context: SessionContext = {}): Promise<AuthResponse> {
    const prisma = getPrisma();
    const email = input.email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw AppError.conflict("Email already registered");
    }
    const passwordHash = await passwordService.hash(input.password);
    let user: PrismaUser;
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email, passwordHash, fullName: input.fullName.trim(), role: "user",
            systemRole: "RESEARCH_USER", accountStatus: "ACTIVE", credits: env.INITIAL_USER_CREDITS,
            emailVerifiedAt: new Date(),
          },
        });
        await tx.academicProfile.create({
          data: { userId: created.id, emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
        });
        await tx.userCapability.create({
          data: { userId: created.id, capability: "BASIC_RESEARCH", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
        });
        return created;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Email already registered");
      throw error;
    }
    const tokens = await issueTokens(user, context);
    return { user: await toUserDto(user), tokens };
  },

  async login(input: LoginInput, context: SessionContext = {}): Promise<AuthResponse> {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user?.passwordHash) throw AppError.unauthorized("Invalid credentials");
    const verified = await passwordService.verify(user.passwordHash, input.password);
    if (!verified.valid) throw AppError.unauthorized("Invalid credentials");
    if (user.accountStatus !== "ACTIVE") throw AppError.forbidden("Account cannot access the platform");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(verified.needsRehash ? { passwordHash: await passwordService.hash(input.password) } : {}),
      },
    });
    return { user: await toUserDto(updated), tokens: await issueTokens(updated, context) };
  },

  async googleLogin(identity: GoogleIdentity, context: SessionContext = {}): Promise<AuthResponse> {
    if (!identity.emailVerified) throw AppError.unauthorized("Google email is not verified");
    const prisma = getPrisma();
    const email = identity.email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email } });
    user = await prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.user.create({
          data: {
            email, fullName: identity.name || "Google User", avatarUrl: identity.picture,
            googleId: identity.subject, role: "user", systemRole: "RESEARCH_USER", accountStatus: "ACTIVE",
            emailVerifiedAt: new Date(), credits: env.INITIAL_USER_CREDITS,
          },
        });
        await tx.academicProfile.create({ data: { userId: user.id, emailStatus: "VERIFIED", identityStatus: "VERIFIED" } });
        await tx.userCapability.create({ data: { userId: user.id, capability: "BASIC_RESEARCH", source: "SYSTEM_POLICY_V1" } });
      } else {
        user = await tx.user.update({
          where: { id: user.id },
          data: { googleId: identity.subject, avatarUrl: user.avatarUrl ?? identity.picture, emailVerifiedAt: user.emailVerifiedAt ?? new Date(), lastLoginAt: new Date() },
        });
        await tx.academicProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
          update: { emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
        });
      }
      await tx.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.subject } },
        create: { userId: user.id, provider: "GOOGLE", providerAccountId: identity.subject, email },
        update: { userId: user.id, email },
      });
      return user;
    });
    if (user.accountStatus !== "ACTIVE") throw AppError.forbidden("Account cannot access the platform");
    return { user: await toUserDto(user), tokens: await issueTokens(user, context) };
  },

  async refresh(refreshToken: string, context: SessionContext = {}): Promise<AuthTokens> {
    const prisma = getPrisma();
    const hash = hashOpaqueToken(refreshToken);
    const current = await prisma.refreshToken.findFirst({ where: { tokenHash: hash } });
    if (!current) throw AppError.unauthorized("Invalid refresh token");
    if (current.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: "REUSE_DETECTED" },
      });
      await auditService.log("auth.refresh.reuse_detected", { userId: current.userId, targetTableName: "refresh_tokens", targetRecordId: current.id });
      throw AppError.unauthorized("Invalid refresh token");
    }
    if (current.expiresAt <= new Date()) throw AppError.unauthorized("Invalid refresh token");
    const user = await prisma.user.findUnique({ where: { id: current.userId } });
    if (!user || user.accountStatus !== "ACTIVE") throw AppError.unauthorized("Account cannot access the platform");

    const nextRaw = createOpaqueToken();
    const nextId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + durationMs(env.JWT_REFRESH_TTL));
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date(), revocationReason: "ROTATED", rotatedToId: nextId, lastUsedAt: new Date() },
      });
      if (claimed.count !== 1) {
        await tx.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: new Date(), revocationReason: "REUSE_DETECTED" },
        });
        throw AppError.unauthorized("Invalid refresh token");
      }
      await tx.refreshToken.create({
        data: {
          id: nextId, userId: user.id, familyId: current.familyId, tokenHash: hashOpaqueToken(nextRaw),
          userAgent: context.userAgent?.slice(0, 500), ipAddress: context.ipAddress?.slice(0, 64), expiresAt,
        },
      });
    });
    const access = tokenService.signAccessToken({ sub: publicDatabaseId(user), systemRole: user.systemRole as SystemRole, sessionId: current.familyId });
    return { accessToken: access.token, refreshToken: nextRaw, accessTokenExpiresAt: access.expiresAt.toISOString() };
  },

  async logout(refreshToken: string): Promise<void> {
    const row = await getPrisma().refreshToken.findFirst({ where: { tokenHash: hashOpaqueToken(refreshToken) } });
    if (!row) return;
    await getPrisma().refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: "LOGOUT" },
    });
  },

  async me(userId: string): Promise<User> {
    const user = await findUser(userId);
    if (!user || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
    return toUserDto(user);
  },

  async resendEmailVerification(emailInput: string): Promise<void> {
    const user = await getPrisma().user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
    if (user && !user.emailVerifiedAt && user.accountStatus === "ACTIVE") await createEmailVerification(user);
  },

  async verifyEmail(token: string): Promise<void> {
    const prisma = getPrisma();
    const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    const now = new Date();
    if (!row || row.consumedAt || row.expiresAt <= now) throw AppError.badRequest("Email verification token is invalid or expired");
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw AppError.badRequest("Email verification token is invalid or expired");
      await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } });
      await tx.academicProfile.upsert({
        where: { userId: row.userId },
        create: { userId: row.userId, emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
        update: { emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
      });
    });
    await capabilityService.evaluate(row.userId);
  },

  async forgotPassword(emailInput: string): Promise<void> {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
    if (!user || user.accountStatus !== "ACTIVE") return;
    const rawToken = createOpaqueToken();
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, consumedAt: null } });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
    });
    await authMailService.sendPasswordReset(user.email, rawToken);
    await auditService.log("auth.password_reset.requested", { userId: user.id, targetTableName: "users", targetRecordId: user.id });
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const prisma = getPrisma();
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(input.token) } });
    const now = new Date();
    if (!row || row.consumedAt || row.expiresAt <= now) throw AppError.badRequest("Password reset token is invalid or expired");
    const passwordHash = await passwordService.hash(input.newPassword);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw AppError.badRequest("Password reset token is invalid or expired");
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now, revocationReason: "PASSWORD_RESET" } });
    });
    await auditService.log("auth.password_reset.completed", { userId: row.userId, targetTableName: "users", targetRecordId: row.userId });
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    const updated = await getPrisma().user.update({
      where: { id: user.id },
      data: { fullName: input.fullName, institution: input.institution === undefined ? undefined : input.institution || null, researchInterests: input.researchInterests },
    });
    return toUserDto(updated);
  },

  async updateAcademicProfile(userId: string, input: UpdateAcademicProfileInput): Promise<User> {
    const prisma = getPrisma();
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    const now = new Date();
    const positionTitle = (input.positionTitle || input.specifiedPosition || input.primaryPosition || "").trim();
    const resolvedPrimaryPosition = inferPrimaryPosition(positionTitle, input.primaryPosition);
    const legacyType = legacyProfileType(resolvedPrimaryPosition);
    const resolvedInstitution = input.noAffiliation
      ? "Independent"
      : (input.institutionName?.trim() || user.institution || "Independent");
    const resolvedDepartment = input.noAffiliation ? null : (input.department?.trim() || null);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          institution: resolvedInstitution,
          academicProfileType: legacyType,
          onboardingCompletedAt: now,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
        },
      });
      await tx.academicProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          primaryPosition: resolvedPrimaryPosition,
          affiliationPosition: positionTitle || null,
          affiliationDepartment: resolvedDepartment,
          positionStatus: "UNVERIFIED",
          affiliationStatus: input.noAffiliation ? "SELF_DECLARED" : "UNVERIFIED",
          onboardingCompletedAt: now,
        },
        update: {
          primaryPosition: resolvedPrimaryPosition,
          affiliationPosition: positionTitle || undefined,
          affiliationDepartment: resolvedDepartment ?? undefined,
          positionStatus: "UNVERIFIED",
          affiliationStatus: input.noAffiliation ? "SELF_DECLARED" : "UNVERIFIED",
          onboardingCompletedAt: now,
          verificationStatus: "SELF_DECLARED",
          verifiedAt: null,
          verifiedById: null,
        },
      });
      await tx.affiliation.deleteMany({ where: { userId: user.id, isPrimary: true } });
      if (!input.noAffiliation && input.institutionName?.trim()) {
        await tx.affiliation.create({
          data: {
            userId: user.id,
            institutionName: input.institutionName.trim(),
            department: resolvedDepartment,
            academicTitle: positionTitle || null,
            affiliationType: "EXTERNAL",
            verificationStatus: "UNVERIFIED",
            verificationSource: "SELF_DECLARED",
            isPrimary: true,
          },
        });
      }
      await tx.verificationEvidence.create({
        data: {
          userId: user.id,
          verificationType: "POSITION",
          sourceType: "SELF_DECLARED",
          sourceReference: positionTitle || resolvedPrimaryPosition,
          status: "UNVERIFIED",
          metadata: {
            country: input.country ?? null,
            positionTitle: positionTitle || null,
            department: resolvedDepartment,
            noAffiliation: Boolean(input.noAffiliation),
          },
        },
      });
    });
    await capabilityService.evaluate(user.id);
    return toUserDto((await findUser(user.id))!);
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await findUser(userId);
    if (!user?.passwordHash) throw AppError.badRequest("Password authentication is not configured for this account");
    const verified = await passwordService.verify(user.passwordHash, input.currentPassword);
    if (!verified.valid) throw AppError.badRequest("Current password is incorrect");
    const now = new Date();
    await getPrisma().$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await passwordService.hash(input.newPassword) } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now, revocationReason: "PASSWORD_CHANGED" } });
    });
    await auditService.log("auth.password.changed", { userId: user.id, targetTableName: "users", targetRecordId: user.id });
  },
};
