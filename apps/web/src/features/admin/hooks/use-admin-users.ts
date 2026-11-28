import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateAdminUserRequest,
  ListUsersQuery,
  SystemRole,
  UpdateAdminUserRequest,
} from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { adminUsersApi } from "../api/admin-users.api";

export function useAdminUsers(query: ListUsersQuery, enabled = true) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useQuery({
    queryKey: ["admin", viewerId, "users", query],
    queryFn: () => adminUsersApi.list(query),
    enabled,
  });
}

export function useAdminUser(id?: string) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useQuery({
    queryKey: ["admin", viewerId, "users", "detail", id],
    queryFn: () => adminUsersApi.detail(id!),
    enabled: Boolean(id),
  });
}

export function useAdminUsersSummary(enabled = true) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useQuery({
    queryKey: ["admin", viewerId, "users", "summary"],
    queryFn: adminUsersApi.summary,
    enabled,
  });
}

export function useAdminStats(enabled = true, refetchInterval?: number | false) {
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useQuery({
    queryKey: ["admin", viewerId, "stats"],
    queryFn: adminUsersApi.stats,
    enabled,
    refetchInterval,
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useMutation({
    mutationFn: ({ id, role, reason }: { id: string; role: SystemRole; reason: string }) =>
      adminUsersApi.updateRole(id, role, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "users"] });
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "stats"] });
    },
  });
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useMutation({
    mutationFn: ({ id, accountStatus, reason }: { id: string; accountStatus: "ACTIVE" | "SUSPENDED" | "DISABLED"; reason: string }) =>
      adminUsersApi.updateStatus(id, accountStatus, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "users"] });
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "stats"] });
    },
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useMutation({
    mutationFn: (input: CreateAdminUserRequest) => adminUsersApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "users"] });
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "stats"] });
    },
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminUserRequest }) => adminUsersApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "users"] });
    },
  });
}

export function useRevokeUserSessions() {
  const qc = useQueryClient();
  const viewerId = useAuthStore((s) => s.user?.id ?? "anon");
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminUsersApi.revokeSessions(id, reason),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ["admin", viewerId, "users", "detail", variables.id] });
    },
  });
}
