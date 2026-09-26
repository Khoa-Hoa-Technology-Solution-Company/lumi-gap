import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";
import type {
  AdminStats,
  AdminUserDetail,
  AdminUserItem,
  AdminUserSummary,
  CreateAdminUserRequest,
  ListUsersQuery,
  ListUsersResponse,
  SystemRole,
  UpdateAdminUserRequest,
} from "@trend/shared-types";

export const adminUsersApi = {
  async list(query: ListUsersQuery): Promise<ListUsersResponse> {
    const res = await api.get(API_ROUTES.admin.users, { params: query });
    return { data: res.data.data as AdminUserItem[], meta: res.data.meta };
  },
  async detail(id: string): Promise<AdminUserDetail> {
    const res = await api.get(API_ROUTES.admin.user(id));
    return res.data.data as AdminUserDetail;
  },
  async summary(): Promise<AdminUserSummary> {
    const res = await api.get(API_ROUTES.admin.usersSummary);
    return res.data.data as AdminUserSummary;
  },
  async create(input: CreateAdminUserRequest): Promise<AdminUserItem> {
    const res = await api.post(API_ROUTES.admin.users, input);
    return res.data.data as AdminUserItem;
  },
  async update(id: string, input: UpdateAdminUserRequest): Promise<AdminUserItem> {
    const res = await api.patch(API_ROUTES.admin.user(id), input);
    return res.data.data as AdminUserItem;
  },
  async updateRole(id: string, role: SystemRole, reason: string): Promise<AdminUserItem> {
    const res = await api.patch(API_ROUTES.admin.userRole(id), { role, reason });
    return res.data.data as AdminUserItem;
  },
  async updateStatus(id: string, accountStatus: AdminUserItem["accountStatus"], reason: string): Promise<AdminUserItem> {
    const res = await api.patch(API_ROUTES.admin.userStatus(id), { accountStatus, reason });
    return res.data.data as AdminUserItem;
  },
  async revokeSessions(id: string, reason: string): Promise<{ revoked: number }> {
    const res = await api.post(API_ROUTES.admin.userSessions(id), { reason });
    return res.data.data as { revoked: number };
  },
  async stats(): Promise<AdminStats> {
    const res = await api.get(API_ROUTES.admin.stats);
    return res.data.data as AdminStats;
  },
};
