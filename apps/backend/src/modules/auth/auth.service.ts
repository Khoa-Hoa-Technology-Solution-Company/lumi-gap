import crypto from "node:crypto";
import {
  isAdminSystemRole, type AcademicRole, type AuthResponse, type AuthTokens,
  type PrimaryPosition, type SystemRole, type User,
} from "@trend/shared-types";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import type { User as PrismaUser } from "../../generated/prisma/client.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { admissionPolicyService } from "../identity/admission-policy.service.js";
import { normalizeEmail } from "../identity/identity-foundation.rules.js";
import { participantScopeForUser } from "../identity/participant-scope.service.js";
import { applyDisplayNameChangeLimit } from "../academic-profiles/display-name-policy.service.js";
import { affiliationService } from "../verification/affiliation.service.js";
import { authMailService } from "./auth-mail.service.js";
import { replaceActivePasswordResetToken } from "./password-reset-token.service.js";
import { canProposeCommunity } from "../communities/community.rules.js";
import { passwordService } from "./password.service.js";
import { createOpaqueToken, hashOpaqueToken, tokenService } from "./token.service.js";
import type {
  AddEmailInput, ChangePasswordInput, LoginInput, RegisterInput, ResetPasswordInput,
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

function academicRoleFromPosition(position: PrimaryPosition): AcademicRole {
  if (position === "STUDENT") return "STUDENT";
  if (position === "LECTURER") return "LECTURER";
  return "RESEARCHER";
}

function primaryPositionFromAcademicRole(role: AcademicRole): PrimaryPosition {
  if (role === "STUDENT") return "STUDENT";
  if (role === "LECTURER") return "LECTURER";
  return "RESEARCH_STAFF";
}

function titleFromAcademicRole(role: AcademicRole | undefined): string {
  if (role === "STUDENT") return "Student";
  if (role === "LECTURER") return "Lecturer";
  if (role === "RESEARCHER") return "Researcher";
  return "";
}

function cleanNullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanTags(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function policyFlag(policy: unknown, keys: string[]): boolean {
  if (!policy || typeof policy !== "object") return false;
  const record = policy as Record<string, unknown>;
  return keys.some((key) => {
    const value = record[key];
    return value === true || (value && typeof value === "object" && (value as Record<string, unknown>).enabled === true);
  });
}

async function createEmailVerification(user: PrismaUser, requestedEmail?: string): Promise<void> {
  const prisma = getPrisma();
  const email = normalizeEmail(requestedEmail ?? user.email);
  let userEmail = await prisma.userEmail.findUnique({ where: { normalizedEmail: email } });
  if (!userEmail) {
    userEmail = await prisma.userEmail.create({
      data: { userId: user.id, normalizedEmail: email, isPrimary: email === normalizeEmail(user.email), purpose: "ACCOUNT" },
    });
  }
  if (userEmail.userId !== user.id) throw AppError.conflict("Email is already linked to another account");
  if (userEmail.verifiedAt) return;
  const rawToken = createOpaqueToken();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userEmailId: userEmail.id, consumedAt: null } });
    await tx.emailVerificationToken.create({
      data: { userId: user.id, userEmailId: userEmail.id, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS) },
    });
  });
  await authMailService.sendEmailVerification(email, rawToken);
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
  const [profile, capabilities, emails, participantScope] = await Promise.all([
    getPrisma().academicProfile.findUnique({ where: { userId: user.id } }),
    capabilityService.list(user.id),
    getPrisma().userEmail.findMany({ where: { userId: user.id, verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }),
    participantScopeForUser(user.id),
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
    academicRole: profile?.academicRole as AcademicRole | null ?? undefined,
    academicRoleVerificationStatus: profile?.roleVerificationStatus as User["academicRoleVerificationStatus"],
    primaryPosition,
    participantScope,
    admissionBasis: user.admissionBasis as User["admissionBasis"],
    verifiedEmails: emails.flatMap((item) => item.verifiedAt ? [{
      email: item.normalizedEmail,
      isPrimary: item.isPrimary,
      purpose: item.purpose as "ACCOUNT" | "INSTITUTIONAL" | "CONTACT",
      verifiedAt: item.verifiedAt.toISOString(),
    }] : []),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
    authProviders: { password: Boolean(user.passwordHash), google: Boolean(user.googleId) },
    capabilities,
    canProposeCommunity: canProposeCommunity({ systemRole: user.systemRole, academicProfileType: user.academicProfileType ?? undefined }, profile?.roleVerificationStatus),
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
    const email = normalizeEmail(input.email);
    if (await prisma.userEmail.findUnique({ where: { normalizedEmail: email }, select: { id: true } })
      || await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw AppError.conflict("Email already registered");
    }
    const admission = await admissionPolicyService.evaluateRegistration(email, input.invitationToken);
    const passwordHash = await passwordService.hash(input.password);
    let user: PrismaUser;
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email, passwordHash, fullName: input.fullName.trim(), role: "user",
            systemRole: "USER", accountStatus: "ACTIVE", credits: env.INITIAL_USER_CREDITS,
            admissionBasis: admission.basis, admissionSourceId: admission.sourceId,
          },
        });
        await tx.userEmail.create({ data: { userId: created.id, normalizedEmail: email, isPrimary: true, purpose: "ACCOUNT" } });
        await tx.academicProfile.create({
          data: { userId: created.id, emailStatus: "PENDING", identityStatus: "PENDING" },
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
    await createEmailVerification(user);
    await auditService.log("ACCOUNT_CREATED", { userId: user.id, targetTableName: "users", targetRecordId: user.id, details: { admissionBasis: admission.basis } });
    const tokens = await issueTokens(user, context);
    return { user: await toUserDto(user), tokens };
  },

  async login(input: LoginInput, context: SessionContext = {}): Promise<AuthResponse> {
    const prisma = getPrisma();
    const email = normalizeEmail(input.email);
    const linkedEmail = await prisma.userEmail.findUnique({ where: { normalizedEmail: email } });
    const user = linkedEmail?.verifiedAt
      ? await prisma.user.findUnique({ where: { id: linkedEmail.userId } })
      : await prisma.user.findUnique({ where: { email } });
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

  async googleLogin(identity: GoogleIdentity, context: SessionContext = {}, invitationToken?: string): Promise<AuthResponse> {
    if (!identity.emailVerified) throw AppError.unauthorized("Google email is not verified");
    const prisma = getPrisma();
    const email = normalizeEmail(identity.email);
    const providerIdentity = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: identity.subject } },
    });
    let user = providerIdentity
      ? await prisma.user.findUnique({ where: { id: providerIdentity.userId } })
      : null;
    if (!user) {
      const linkedEmail = await prisma.userEmail.findUnique({ where: { normalizedEmail: email } });
      user = linkedEmail
        ? await prisma.user.findUnique({ where: { id: linkedEmail.userId } })
        : await prisma.user.findUnique({ where: { email } });
    }
    const admission = user ? null : await admissionPolicyService.evaluateRegistration(email, invitationToken);
    const linkedIdentity = !providerIdentity;
    user = await prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.user.create({
          data: {
            email, fullName: identity.name || "Google User", avatarUrl: identity.picture,
            googleId: identity.subject, role: "user", systemRole: "USER", accountStatus: "ACTIVE",
            emailVerifiedAt: new Date(), credits: env.INITIAL_USER_CREDITS,
            admissionBasis: admission!.basis, admissionSourceId: admission!.sourceId,
          },
        });
        await tx.academicProfile.create({ data: { userId: user.id, emailStatus: "VERIFIED", identityStatus: "VERIFIED" } });
        await tx.userCapability.create({ data: { userId: user.id, capability: "BASIC_RESEARCH", source: "SYSTEM_POLICY_V1" } });
      } else {
        if (providerIdentity && providerIdentity.userId !== user.id) {
          throw AppError.conflict("This Google identity is already linked to another account");
        }
        user = await tx.user.update({
          where: { id: user.id },
          data: { googleId: user.googleId ?? identity.subject, avatarUrl: user.avatarUrl ?? identity.picture, emailVerifiedAt: normalizeEmail(user.email) === email ? user.emailVerifiedAt ?? new Date() : user.emailVerifiedAt, lastLoginAt: new Date() },
        });
        await tx.academicProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
          update: { emailStatus: "VERIFIED", identityStatus: "VERIFIED" },
        });
      }
      const existingEmail = await tx.userEmail.findUnique({ where: { normalizedEmail: email } });
      if (existingEmail && existingEmail.userId !== user.id) {
        throw AppError.conflict("Verified email is already linked to another account");
      }
      const verifiedEmail = await tx.userEmail.upsert({
        where: { normalizedEmail: email },
        create: { userId: user.id, normalizedEmail: email, isPrimary: normalizeEmail(user.email) === email, purpose: "ACCOUNT", verifiedAt: new Date() },
        update: { verifiedAt: new Date() },
      });
      if (verifiedEmail.userId !== user.id) {
        throw AppError.conflict("Verified email is already linked to another account");
      }
      if (!providerIdentity) await tx.oAuthAccount.create({ data: { userId: user.id, provider: "GOOGLE", providerAccountId: identity.subject, email } });
      return user;
    });
    if (user.accountStatus !== "ACTIVE") throw AppError.forbidden("Account cannot access the platform");
    if (admission) await auditService.log("ACCOUNT_CREATED", { userId: user.id, targetTableName: "users", targetRecordId: user.id, details: { admissionBasis: admission.basis } });
    if (linkedIdentity) await auditService.log("IDENTITY_LINKED", { userId: user.id, targetTableName: "oauth_accounts", details: { provider: "GOOGLE" } });
    await affiliationService.verifyFromEmail(user.id, email);
    await capabilityService.evaluate(user.id);
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
    const email = normalizeEmail(emailInput);
    const linked = await getPrisma().userEmail.findUnique({ where: { normalizedEmail: email } });
    const user = linked ? await getPrisma().user.findUnique({ where: { id: linked.userId } }) : null;
    if (user && !linked?.verifiedAt && user.accountStatus === "ACTIVE") await createEmailVerification(user, email);
  },

  async verifyEmail(token: string): Promise<void> {
    const prisma = getPrisma();
    const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    const now = new Date();
    if (!row || row.consumedAt || row.expiresAt <= now) throw AppError.badRequest("Email verification token is invalid or expired");
    let verifiedEmail: string | null = null;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw AppError.badRequest("Email verification token is invalid or expired");
      const linked = row.userEmailId ? await tx.userEmail.findUnique({ where: { id: row.userEmailId } }) : null;
      if (!linked || linked.userId !== row.userId) throw AppError.badRequest("Email verification token is invalid or expired");
      await tx.userEmail.update({ where: { id: linked.id }, data: { verifiedAt: now } });
      verifiedEmail = linked.normalizedEmail;
      if (linked.isPrimary) await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } });
      await tx.academicProfile.upsert({
        where: { userId: row.userId },
        create: { userId: row.userId, emailStatus: linked.isPrimary ? "VERIFIED" : "NOT_SUBMITTED", identityStatus: "VERIFIED" },
        update: linked.isPrimary ? { emailStatus: "VERIFIED", identityStatus: "VERIFIED" } : { identityStatus: "VERIFIED" },
      });
    });
    if (verifiedEmail) await affiliationService.verifyFromEmail(row.userId, verifiedEmail);
    await auditService.log("EMAIL_VERIFIED", { userId: row.userId, targetTableName: "user_emails", targetRecordId: row.userEmailId ?? undefined });
    await capabilityService.evaluate(row.userId);
  },

  async addEmail(userId: string, input: AddEmailInput): Promise<void> {
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    const email = normalizeEmail(input.email);
    const existing = await getPrisma().userEmail.findUnique({ where: { normalizedEmail: email } });
    if (existing && existing.userId !== user.id) throw AppError.conflict("Email is already linked to another account");
    if (existing?.verifiedAt) return;
    if (!existing) {
      try {
        await getPrisma().userEmail.create({ data: { userId: user.id, normalizedEmail: email, purpose: input.purpose } });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Email is already linked to another account");
        throw error;
      }
    }
    await createEmailVerification(user, email);
  },

  async forgotPassword(emailInput: string): Promise<void> {
    const prisma = getPrisma();
    const email = normalizeEmail(emailInput);
    const linked = await prisma.userEmail.findUnique({ where: { normalizedEmail: email } });
    const user = linked?.verifiedAt
      ? await prisma.user.findUnique({ where: { id: linked.userId } })
      : await prisma.user.findUnique({ where: { email } });
    if (!user || user.accountStatus !== "ACTIVE") return;
    const rawToken = createOpaqueToken();
    const issuedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await replaceActivePasswordResetToken(tx, {
        userId: user.id,
        tokenHash: hashOpaqueToken(rawToken),
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + RESET_TOKEN_TTL_MS),
      });
    });
    try {
      await authMailService.sendPasswordReset(email, user.fullName, rawToken);
    } catch {
      // Keep the response indistinguishable for active and unknown addresses.
      // Never log the recipient, raw token, or reset URL.
      logger.error({ event: "auth.password_reset.email_delivery_failed" }, "Password reset email delivery failed");
    }
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
    const updated = await getPrisma().$transaction(async (tx) => {
      if (input.fullName !== undefined) await applyDisplayNameChangeLimit(tx, user.id, input.fullName);
      return tx.user.update({
        where: { id: user.id },
        data: { institution: input.institution === undefined ? undefined : input.institution || null, researchInterests: input.researchInterests },
      });
    });
    return toUserDto(updated);
  },

  async academicOnboardingOptions() {
    const prisma = getPrisma();
    const hostInstitution = await prisma.institution.findFirst({
      where: { hostInstitution: true, status: "ACTIVE", isActive: true },
      orderBy: { name: "asc" },
    });
    if (!hostInstitution) {
      return {
        hostInstitution: undefined,
        campuses: [],
        programs: [],
        verificationMethods: { feid: false, institutionalEmail: false, manualReview: true },
      };
    }
    const [campuses, programs, domains] = await Promise.all([
      prisma.campus.findMany({
        where: { institutionId: hostInstitution.id, isActive: true },
        orderBy: [{ city: "asc" }, { name: "asc" }],
      }),
      prisma.academicProgram.findMany({
        where: { institutionId: hostInstitution.id, isActive: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.institutionDomain.findMany({
        where: { institutionId: hostInstitution.id, trusted: true, status: "ACTIVE" },
      }),
    ]);
    return {
      hostInstitution: { id: hostInstitution.id, name: hostInstitution.name },
      campuses: campuses.map((campus) => ({
        id: campus.id,
        name: campus.name,
        code: campus.code,
        city: campus.city,
        country: campus.country,
      })),
      programs: programs.map((program) => ({
        id: program.id,
        name: program.name,
        code: program.code,
        campusId: program.campusId,
      })),
      verificationMethods: {
        feid: domains.some((domain) => domain.verificationMethod === "FEID")
          || policyFlag(hostInstitution.verificationPolicy, ["feidEnabled", "allowFeidVerification", "feid"]),
        institutionalEmail: domains.some((domain) => domain.verificationMethod === "INSTITUTIONAL_EMAIL")
          || policyFlag(hostInstitution.verificationPolicy, ["allowInstitutionalEmailVerification", "institutionalEmail"]),
        manualReview: policyFlag(hostInstitution.verificationPolicy, ["allowManualReview", "manualReview"])
          || !("allowManualReview" in ((hostInstitution.verificationPolicy && typeof hostInstitution.verificationPolicy === "object")
            ? hostInstitution.verificationPolicy as Record<string, unknown>
            : {})),
      },
    };
  },

  async updateAcademicProfile(userId: string, input: UpdateAcademicProfileInput): Promise<User> {
    const prisma = getPrisma();
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    const now = new Date();
    const researchInterests = cleanTags(input.researchInterests);
    const expertiseAreas = cleanTags(input.expertiseAreas ?? input.researchAreas);
    const researchKeywords = cleanTags(input.researchKeywords);
    const skills = cleanTags(input.skills);
    const positionTitle = (
      input.positionTitle
      || input.specifiedPosition
      || titleFromAcademicRole(input.academicRole)
      || input.primaryPosition
      || ""
    ).trim();
    const selectedAcademicRole = input.academicRole
      ?? (input.primaryPosition ? academicRoleFromPosition(input.primaryPosition) : undefined);
    const resolvedPrimaryPosition = selectedAcademicRole
      ? primaryPositionFromAcademicRole(selectedAcademicRole)
      : inferPrimaryPosition(positionTitle, input.primaryPosition);
    const academicRole = selectedAcademicRole ?? academicRoleFromPosition(resolvedPrimaryPosition);
    const participantScope = await participantScopeForUser(user.id);
    if (user.admissionBasis === "INVITATION" && participantScope === "EXTERNAL" && !["RESEARCHER", "LECTURER"].includes(academicRole)) {
      throw AppError.badRequest("Invited external collaborators must onboard as Researchers or Lecturers until a current FPT affiliation is verified");
    }
    const legacyType = legacyProfileType(resolvedPrimaryPosition);
    const resolvedInstitution = input.noAffiliation
      ? "Independent"
      : (input.institutionName?.trim() || user.institution || "Independent");
    const resolvedDepartment = input.noAffiliation ? null : (input.department?.trim() || null);

    const previousProfile = await prisma.academicProfile.findUnique({ where: { userId: user.id }, select: { academicRole: true } });
    await prisma.$transaction(async (tx) => {
      let institution: { id: string; name: string; hostInstitution: boolean } | null = null;
      if (!input.noAffiliation && input.institutionName?.trim()) {
        const institutionName = input.institutionName.trim();
        institution = await tx.institution.findFirst({
          where: { name: { equals: institutionName, mode: "insensitive" } },
          orderBy: [{ hostInstitution: "desc" }, { isActive: "desc" }, { createdAt: "asc" }],
        });
        if (!institution) {
          const slug = `external-${crypto.createHash("sha256").update(institutionName.toLowerCase()).digest("hex").slice(0, 24)}`;
          institution = await tx.institution.upsert({
            where: { slug },
            create: { name: institutionName, slug, hostInstitution: false, status: "ACTIVE", verificationPolicy: {} },
            update: {},
          });
        }
      }
      if (academicRole === "STUDENT" && !institution?.hostInstitution) {
        throw AppError.badRequest("Student onboarding currently supports FPT University affiliation only");
      }

      let campusId: string | null | undefined = input.campusId === undefined ? undefined : input.campusId;
      if ((campusId || input.programId) && !institution) {
        throw AppError.badRequest("Campus and program require an institution");
      }
      if (campusId) {
        const campus = await tx.campus.findFirst({ where: { id: campusId, institutionId: institution!.id, isActive: true } });
        if (!campus) throw AppError.badRequest("Selected campus is not available for this institution");
      }
      let programId: string | null | undefined = input.programId === undefined ? undefined : input.programId;
      if (programId) {
        const program = await tx.academicProgram.findFirst({ where: { id: programId, institutionId: institution!.id, isActive: true } });
        if (!program) throw AppError.badRequest("Selected program is not available for this institution");
        if (campusId && program.campusId && program.campusId !== campusId) {
          throw AppError.badRequest("Selected program is not available for this campus");
        }
        campusId = campusId ?? program.campusId;
      }

      const currentAffiliation = await tx.affiliation.findFirst({
        where: { userId: user.id, isPrimary: true, isCurrent: true },
      });
      const keepsCurrentAffiliation = Boolean(institution && currentAffiliation?.institutionId === institution.id);
      const nextAffiliationStatus = keepsCurrentAffiliation
        ? currentAffiliation!.verificationStatus
        : "NOT_SUBMITTED";

      await tx.user.update({
        where: { id: user.id },
        data: {
          institution: resolvedInstitution,
          academicProfileType: legacyType,
          onboardingCompletedAt: now,
          ...(researchInterests !== undefined ? { researchInterests } : {}),
        },
      });
      await tx.academicProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          primaryPosition: resolvedPrimaryPosition,
          academicRole,
          roleVerificationStatus: "SELF_DECLARED",
          positionTitle: positionTitle || null,
          affiliationPosition: positionTitle || null,
          affiliationDepartment: resolvedDepartment,
          positionStatus: "NOT_SUBMITTED",
          affiliationStatus: nextAffiliationStatus,
          verificationStatus: "SELF_DECLARED",
          ...(expertiseAreas !== undefined ? { expertiseAreas } : {}),
          ...(skills !== undefined ? { skills } : {}),
          ...(researchKeywords !== undefined ? { researchKeywords } : {}),
          onboardingCompletedAt: now,
        },
        update: {
          primaryPosition: resolvedPrimaryPosition,
          academicRole,
          roleVerificationStatus: "SELF_DECLARED",
          roleVerificationMethod: null,
          roleVerifiedAt: null,
          roleVerifiedById: null,
          positionTitle: positionTitle || undefined,
          affiliationPosition: positionTitle || undefined,
          affiliationDepartment: resolvedDepartment ?? undefined,
          positionStatus: "NOT_SUBMITTED",
          affiliationStatus: nextAffiliationStatus,
          onboardingCompletedAt: now,
          verificationStatus: "SELF_DECLARED",
          verifiedAt: null,
          verifiedById: null,
          ...(expertiseAreas !== undefined ? { expertiseAreas } : {}),
          ...(skills !== undefined ? { skills } : {}),
          ...(researchKeywords !== undefined ? { researchKeywords } : {}),
        },
      });
      if (currentAffiliation && !keepsCurrentAffiliation) {
        await tx.affiliation.update({
          where: { id: currentAffiliation.id },
          data: { isPrimary: false, isCurrent: false, endDate: now, validUntil: now },
        });
      }
      if (institution) {
        const affiliationData = {
          institutionName: institution.name,
          department: resolvedDepartment,
          academicTitle: positionTitle || null,
          positionTitle: positionTitle || null,
          positionStatus: "NOT_SUBMITTED",
          campusId,
          programId,
        };
        if (currentAffiliation && keepsCurrentAffiliation) {
          await tx.affiliation.update({
            where: { id: currentAffiliation.id },
            data: affiliationData,
          });
        } else {
          await tx.affiliation.create({
            data: {
              userId: user.id,
              institutionId: institution.id,
              ...affiliationData,
              verificationStatus: "NOT_SUBMITTED",
              verificationSource: "SELF_DECLARED",
              isPrimary: true, isCurrent: true, startDate: now, validFrom: now,
            },
          });
        }
      }
    });
    if (previousProfile?.academicRole !== academicRole) {
      await auditService.log("ACADEMIC_ROLE_CHANGED", {
        userId: user.id,
        targetTableName: "academic_profiles",
        details: { from: previousProfile?.academicRole ?? null, to: academicRole, verificationStatus: "SELF_DECLARED" },
      });
    }
    await capabilityService.evaluate(user.id);
    return toUserDto((await findUser(user.id))!);
  },

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await findUser(userId);
    if (!user) throw AppError.unauthorized();
    if (user.passwordHash) {
      if (!input.currentPassword) throw AppError.badRequest("Current password is required");
      const verified = await passwordService.verify(user.passwordHash, input.currentPassword);
      if (!verified.valid) throw AppError.badRequest("Current password is incorrect");
    }
    const now = new Date();
    await getPrisma().$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await passwordService.hash(input.newPassword) } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now, revocationReason: "PASSWORD_CHANGED" } });
    });
    await auditService.log(user.passwordHash ? "auth.password.changed" : "auth.password.set", { userId: user.id, targetTableName: "users", targetRecordId: user.id });
  },
};
