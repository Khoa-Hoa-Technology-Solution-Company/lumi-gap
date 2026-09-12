import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { authApi, type ChangePasswordRequest, type UpdateProfileRequest } from "../api/auth.api";

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (payload: LoginRequest) => authApi.login(payload),
    onSuccess: (data) => setAuth(data),
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (payload: RegisterRequest) => authApi.register(payload),
    onSuccess: (data) => setAuth(data),
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().tokens?.refreshToken;
      if (refreshToken) await authApi.logout(refreshToken);
    },
    onSettled: () => clear(),
  });
}

export function useCurrentUser() {
  const tokens = useAuthStore((s) => s.tokens);
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ["current-user"],
    queryFn: () => authApi.me(),
    enabled: !!tokens?.accessToken,
    initialData: user ? { user } : undefined,
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
