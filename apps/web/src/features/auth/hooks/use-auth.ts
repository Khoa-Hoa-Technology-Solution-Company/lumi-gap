import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest } from "@trend/shared-types";
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
  return useMutation({
    mutationFn: (payload: RegisterRequest) => authApi.register(payload),
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
  const tokens = useAuthStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const data = await authApi.me();
      useAuthStore.setState({ user: data.user });
      return data;
    },
    enabled: !!tokens?.accessToken,
    initialData: user ? { user } : undefined,
    staleTime: 0,
    refetchOnMount: "always",
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

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordRequest) => authApi.changePassword(payload),
  });
}

