import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";
import type {
  AdminStats,
  AdminUserItem,
  ListUsersQuery,
  ListUsersResponse,
  UserRole,
} from "@trend/shared-types";

export const adminUsersApi = {
  async list(query: ListUsersQuery): Promise<ListUsersResponse> {
    const res = await api.get(API_ROUTES.admin.users, { params: query });
    return { data: res.data.data as AdminUserItem[], meta: res.data.meta };
  },
  async updateRole(id: string, role: UserRole): Promise<AdminUserItem> {
    const res = await api.patch(API_ROUTES.admin.userRole(id), { role });
    return res.data.data as AdminUserItem;
  },
  async updateStatus(id: string, isActive: boolean): Promise<AdminUserItem> {
    const res = await api.patch(API_ROUTES.admin.userStatus(id), { isActive });
    return res.data.data as AdminUserItem;
  },
  async stats(): Promise<AdminStats> {
    const res = await api.get(API_ROUTES.admin.stats);
    return res.data.data as AdminStats;
  },
};
