import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateAdminUserRequest, ListUsersQuery, SystemRole, UpdateAdminUserRequest,
} from "@trend/shared-types";
import { adminUsersApi } from "../api/admin-users.api";

export function useAdminUsers(query: ListUsersQuery, enabled = true) {
  return useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => adminUsersApi.list(query),
    enabled,
  });
}

export function useAdminUser(id?: string) {
  return useQuery({
    queryKey: ["admin", "users", "detail", id],
    queryFn: () => adminUsersApi.detail(id!),
    enabled: Boolean(id),
  });
}

export function useAdminUsersSummary(enabled = true) {
  return useQuery({ queryKey: ["admin", "users", "summary"], queryFn: adminUsersApi.summary, enabled });
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
    mutationFn: ({ id, role, reason }: { id: string; role: SystemRole; reason: string }) =>
      adminUsersApi.updateRole(id, role, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountStatus, reason }: { id: string; accountStatus: "ACTIVE" | "SUSPENDED" | "DISABLED"; reason: string }) =>
      adminUsersApi.updateStatus(id, accountStatus, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminUserRequest) => adminUsersApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminUserRequest }) => adminUsersApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useRevokeUserSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminUsersApi.revokeSessions(id, reason),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "users", "detail", variables.id] });
    },
  });
}
