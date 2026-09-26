import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest, UpdateAcademicProfileRequest } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { authApi, type UpdateProfileRequest, type ChangePasswordRequest } from "../api/auth.api";

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginRequest) => authApi.login(payload),
    onSuccess: (data) => {
      setAuth(data);
      queryClient.clear();
      queryClient.setQueryData(["current-user"], { user: data.user });
    },
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterRequest) => authApi.register(payload),
    onSuccess: (data) => {
      setAuth(data);
      queryClient.clear();
      queryClient.setQueryData(["current-user"], { user: data.user });
    },
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().tokens?.refreshToken;
      if (refreshToken) await authApi.logout(refreshToken);
    },
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}

export function useCurrentUser() {
  const hasToken = useAuthStore((s) => !!s.tokens?.accessToken);
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const data = await authApi.me();
      useAuthStore.setState({ user: data.user });
      return data;
    },
    enabled: hasToken,
    // Use placeholderData (not initialData) so the store snapshot is used only
    // as a temporary visual placeholder and doesn't affect query status.
    // Reading the store outside a selector avoids a reactive subscription that
    // would re-render this hook every time queryFn updates the store — which
    // previously caused an infinite fetch loop (staleTime: 0 + store write in
    // queryFn → re-render → new refetch → repeat).
    placeholderData: () => {
      const user = useAuthStore.getState().user;
      return user ? { user } : undefined;
    },
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProfileRequest) => authApi.updateProfile(payload),
    onSuccess: (data) => {
      useAuthStore.setState({ user: data.user });
      queryClient.setQueryData(["current-user"], data);
    },
  });
}

export function useUpdateAcademicProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAcademicProfileRequest) => authApi.updateAcademicProfile(payload),
    onSuccess: (data) => {
      useAuthStore.setState({ user: data.user });
      queryClient.setQueryData(["current-user"], data);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordRequest) => authApi.changePassword(payload),
  });
}
