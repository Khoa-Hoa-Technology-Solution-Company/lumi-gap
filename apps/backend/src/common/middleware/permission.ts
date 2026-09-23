import type { NextFunction, Request, Response } from "express";
import { AppError } from "../exceptions/app-error.js";
import { hasPermission, type Permission } from "../authorization/permissions.js";

export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!required.every((permission) => hasPermission(req.user!.role, permission))) {
      next(AppError.forbidden("You do not have permission to perform this action"));
      return;
    }
    next();
  };
}
