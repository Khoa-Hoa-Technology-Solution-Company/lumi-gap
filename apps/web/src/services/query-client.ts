import { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// Guarantee zero cross-account or post-expiry cache leakage: whenever the auth
// session version changes (logout, 401 refresh failure, or account switch),
// cancel in-flight requests and clear cached server state immediately.
let lastSessionVersion = useAuthStore.getState().sessionVersion;
let lastUserId = useAuthStore.getState().user?.id ?? null;

useAuthStore.subscribe((state) => {
  const nextUserId = state.user?.id ?? null;
  if (state.sessionVersion !== lastSessionVersion || nextUserId !== lastUserId) {
    lastSessionVersion = state.sessionVersion;
    lastUserId = nextUserId;
    void queryClient.cancelQueries();
    queryClient.clear();
  }
});
