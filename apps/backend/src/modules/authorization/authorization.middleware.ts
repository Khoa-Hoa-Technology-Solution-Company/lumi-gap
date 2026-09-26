import type { NextFunction, Request, Response } from "express";
import type { UserCapability } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { capabilityService } from "./capability.service.js";

export function requireCapability(capability: UserCapability) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return next(AppError.unauthorized());
    if (req.user.systemRole === "ADMIN" || req.user.systemRole === "SUPER_ADMIN") return next();
    try {
      const capabilities = await capabilityService.list(req.user.sub);
      if (!capabilities.includes(capability)) {
        return next(new AppError(403, "AUTHORIZATION_CAPABILITY_REQUIRED", `${capability} capability is required`));
      }
      req.user.capabilities = capabilities;
      next();
    } catch (error) {
      next(error);
    }
  };
}
