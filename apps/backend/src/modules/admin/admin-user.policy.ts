import type { SystemRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

export type UserManagementAction = "UPDATE_PROFILE" | "UPDATE_ROLE" | "UPDATE_STATUS" | "REVOKE_SESSIONS";

export function assertCanCreateUser(
  actor: { systemRole: string },
  requestedRole: SystemRole,
): void {
  if (actor.systemRole === "ADMIN" && requestedRole === "USER") return;
  throw AppError.forbidden();
}

export function assertCanManageUser(
  actor: { id: string; systemRole: string },
  target: { id: string; systemRole: string },
  action: UserManagementAction,
): void {
  if (actor.id === target.id && (action === "UPDATE_ROLE" || action === "UPDATE_STATUS")) {
    throw AppError.badRequest(`You cannot change your own ${action === "UPDATE_ROLE" ? "system role" : "account status"}`);
  }

  if (actor.systemRole !== "ADMIN") throw AppError.forbidden();
}

export function legacyRole(systemRole: SystemRole): "admin" | "user" {
  return systemRole === "USER" ? "user" : "admin";
}
