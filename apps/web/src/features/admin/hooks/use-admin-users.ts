import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListUsersQuery, UserRole } from "@trend/shared-types";
import { adminUsersApi } from "../api/admin-users.api";

export function useAdminUsers(query: ListUsersQuery, enabled = true) {
  return useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => adminUsersApi.list(query),
    enabled,
  });
}

export function useAdminStats(enabled = true, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminUsersApi.stats,
    enabled,
    refetchInterval,
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      adminUsersApi.updateRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminUsersApi.updateStatus(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
