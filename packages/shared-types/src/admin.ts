// packages/shared-types/src/admin.ts
import type { ISODateString } from "./common.js";
import type { UserRole } from "./user.js";

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  institution?: string;
  createdAt: ISODateString;
}

export interface ListUsersQuery {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListUsersResponse {
  data: AdminUserItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface UpdateUserRoleRequest {
  role: UserRole;
}

export interface UpdateUserStatusRequest {
  isActive: boolean;
}

export interface AdminStats {
  users: { total: number; byRole: Record<UserRole, number> };
  papers: number;
  reports: number;
  gaps: number;
  sync: {
    totalRuns: number;
    totalFetched: number;
    totalInserted: number;
    totalUpdated: number;
    totalDuplicates: number;
    latestRun: {
      id: string;
      status: "running" | "succeeded" | "failed" | "cancelled";
      searchText?: string;
      startedAt: ISODateString;
      finishedAt?: ISODateString;
      totalFetched: number;
      totalInserted: number;
      totalUpdated: number;
      totalDuplicates: number;
      errorMessage?: string;
    } | null;
  };
}
