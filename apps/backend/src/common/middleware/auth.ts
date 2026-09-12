import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { AppError } from "../exceptions/app-error.js";
import { UserModel } from "../../modules/auth/models/user.model.js";

export interface AuthClaims {
  sub: string;          // user id
  email: string;
  role: UserRole;
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
    const user = await UserModel.findById(claims.sub).select("isActive role").lean();
    if (!user || user.isActive === false) {
      return next(AppError.unauthorized("Account is disabled or no longer exists"));
    }
    req.user = { ...claims, role: user.role };
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
    const user = await UserModel.findById(claims.sub).select("isActive role").lean();
    if (user && user.isActive !== false) {
      req.user = { ...claims, role: user.role };
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
