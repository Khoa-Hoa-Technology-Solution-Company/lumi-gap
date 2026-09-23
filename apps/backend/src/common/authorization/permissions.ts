import type { UserRole } from "@trend/shared-types";

export const permissions = [
  "community:read",
  "community:create",
  "community:join",
  "community:moderate",
  "forum:read",
  "forum:write",
  "forum:moderate",
  "recruitment:read",
  "recruitment:apply",
  "recruitment:manage",
  "submission:create",
  "submission:revise",
  "submission:review",
  "review:assign",
  "workspace:read",
  "workspace:write",
  "workspace:comment",
  "ai-run:create",
  "ai-run:read",
  "ai-run:manage",
] as const;

export type Permission = (typeof permissions)[number];

const contributorPermissions: readonly Permission[] = [
  "community:read",
  "community:join",
  "forum:read",
  "forum:write",
  "recruitment:read",
  "recruitment:apply",
  "submission:create",
  "submission:revise",
  "workspace:read",
  "workspace:write",
  "workspace:comment",
  "ai-run:create",
  "ai-run:read",
];

const leadPermissions: readonly Permission[] = [
  ...contributorPermissions,
  "community:create",
  "recruitment:manage",
];

export const rolePermissions: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  user: new Set(contributorPermissions),
  student: new Set(contributorPermissions),
  lecturer: new Set(leadPermissions),
  researcher: new Set(leadPermissions),
  reviewer: new Set([
    ...contributorPermissions,
    "submission:review",
  ]),
  moderator: new Set([
    ...leadPermissions,
    "community:moderate",
    "forum:moderate",
    "submission:review",
    "review:assign",
    "ai-run:manage",
  ]),
  admin: new Set(permissions),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
