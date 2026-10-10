import type { NextFunction, Request, Response } from "express";
import type {
  AcademicProfileType, AccountStatus, PrimaryPosition, SystemRole, UserCapability, UserRole,
} from "@trend/shared-types";
import { isAdminSystemRole } from "@trend/shared-types";
import { AppError } from "../exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { tokenService, type AccessTokenClaims } from "../../modules/auth/token.service.js";
import { withUserAi } from "../../modules/user-ai/user-ai.runtime.js";
import { assertResearchWorkflowAccess } from "../../modules/authorization/research-access.service.js";
import { capabilityService } from "../../modules/authorization/capability.service.js";

export interface AuthClaims extends AccessTokenClaims {
  role: UserRole;
  accountStatus: AccountStatus;
  academicProfileType?: AcademicProfileType;
  primaryPosition?: PrimaryPosition;
  capabilities?: UserCapability[];
}

declare global {
  namespace Express {
    interface User extends AuthClaims {}
    interface Request { user?: User }
  }
}

async function hydrateClaims(claims: AccessTokenClaims): Promise<AuthClaims | null> {
  const parsedId = parseDatabaseId(claims.sub);
  if (!parsedId) return null;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: parsedId.kind === "uuid" ? { id: parsedId.value } : { legacyMongoId: parsedId.value },
    select: { id: true, systemRole: true, accountStatus: true, academicProfileType: true, isActive: true },
  });
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || user.systemRole !== claims.systemRole) return null;
  const activeSession = await prisma.refreshToken.findFirst({
    where: { familyId: claims.sessionId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!activeSession) return null;
  const [profile, capabilityRows] = await Promise.all([
    prisma.academicProfile.findUnique({ where: { userId: user.id }, select: { primaryPosition: true } }),
    capabilityService.list(user.id),
  ]);
  return {
    ...claims,
    systemRole: user.systemRole as SystemRole,
    accountStatus: user.accountStatus as AccountStatus,
    role: isAdminSystemRole(user.systemRole) ? "admin" : "user",
    academicProfileType: user.academicProfileType as AcademicProfileType | null ?? undefined,
    primaryPosition: profile?.primaryPosition as PrimaryPosition | null ?? undefined,
    capabilities: capabilityRows,
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) return next(AppError.unauthorized("Missing or malformed Authorization header"));
  try {
    const claims = await hydrateClaims(tokenService.verifyAccessToken(token));
    if (!claims) return next(AppError.unauthorized("Account or session is no longer active"));
    req.user = claims;
    await withUserAi(claims.sub, () => next());
  } catch (error) { next(error); }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = bearerToken(req);
  if (!token) return next();
  try {
    const claims = await hydrateClaims(tokenService.verifyAccessToken(token));
    if (claims) {
      req.user = claims;
      await withUserAi(claims.sub, () => next());
    } else next();
  } catch (error) {
    // Invalid optional tokens remain anonymous; a configured account must not
    // silently run AI with platform credentials when its settings cannot load.
    if (req.user) next(error);
    else next();
  }
}

/** Authentication plus email ownership for core tools; affiliation is independent. */
export async function requireVerifiedAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, (error?: unknown) => {
    if (error) return next(error);
    void assertResearchWorkflowAccess(req.user!.sub).then(() => next()).catch(next);
  });
}

export function requireSystemRole(...roles: SystemRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    const accepted = roles.includes(req.user.systemRole);
    if (!accepted) return next(AppError.forbidden());
    next();
  };
}

/** @deprecated Migrate route guards to requireSystemRole or requireCapability. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    const accepted = roles.some((role) => role === req.user!.role || role === req.user!.systemRole
      || (role === "admin" && isAdminSystemRole(req.user!.systemRole)));
    if (!accepted) return next(AppError.forbidden());
    next();
  };
}
