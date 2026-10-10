import type { NextFunction, Request, Response } from "express";
import type { UserCapability } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { capabilityService } from "./capability.service.js";
import { assertResearchWorkflowAccess } from "./research-access.service.js";

export async function requireResearchWorkflow(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    await assertResearchWorkflowAccess(req.user.sub);
    next();
  } catch (error) { next(error); }
}

export function requireCapability(capability: UserCapability) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return next(AppError.unauthorized());
    if (req.user.systemRole === "ADMIN") return next();
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
