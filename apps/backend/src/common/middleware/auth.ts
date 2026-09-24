import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AcademicProfileType, UserRole } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { AppError } from "../exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";

export interface AuthClaims {
  sub: string;          // user id
  email: string;
  role: UserRole;
  academicProfileType?: AcademicProfileType;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthClaims {}
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Missing or malformed Authorization header"));
  }

  const token = header.slice("Bearer ".length);
  let claims: AuthClaims;
  try {
    claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthClaims;
  } catch {
    return next(AppError.unauthorized("Invalid or expired access token"));
  }

  // Stateless JWT can't reflect a mid-session disable/delete. Re-check against the
  // DB (one indexed _id lookup) so a disabled account loses access immediately
  // rather than staying valid until the 15-min access token expires. Also refresh
  // the role from the DB so requireRole sees the current value.
  try {
    const parsedId = parseDatabaseId(claims.sub);
    const user = parsedId
      ? await getPrisma().user.findUnique({
          where: parsedId.kind === "uuid" ? { id: parsedId.value } : { legacyMongoId: parsedId.value },
          select: { isActive: true, role: true, academicProfileType: true },
        })
      : null;
    if (!user || !user.isActive) {
      return next(AppError.unauthorized("Account is disabled or no longer exists"));
    }
    req.user = {
      ...claims,
      role: user.role as UserRole,
      academicProfileType: user.academicProfileType as AcademicProfileType | null ?? undefined,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length);
  let claims: AuthClaims;
  try {
    claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthClaims;
  } catch {
    next();
    return;
  }

  try {
    const parsedId = parseDatabaseId(claims.sub);
    const user = parsedId
      ? await getPrisma().user.findUnique({
          where: parsedId.kind === "uuid" ? { id: parsedId.value } : { legacyMongoId: parsedId.value },
          select: { isActive: true, role: true, academicProfileType: true },
        })
      : null;
    if (user?.isActive) {
      req.user = {
        ...claims,
        role: user.role as UserRole,
        academicProfileType: user.academicProfileType as AcademicProfileType | null ?? undefined,
      };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}
