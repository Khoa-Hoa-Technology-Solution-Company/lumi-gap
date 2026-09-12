import { useQuery } from "@tanstack/react-query";
import { creditsApi } from "../api/credits.api.js";

export const creditKeys = {
  all: ["credits"] as const,
  balance: () => [...creditKeys.all, "balance"] as const,
  transactions: (filters?: Record<string, unknown>) =>
    [...creditKeys.all, "transactions", filters] as const,
};

export function useCreditBalance(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: creditKeys.balance(),
    queryFn: async () => {
      const res = await creditsApi.getBalance();
      if (res.success) return res.data;
      throw new Error("Failed to fetch credit balance");
    },
    staleTime: 30_000, // 30s — balance changes on every AI action
    refetchOnWindowFocus: true,
    ...options,
  });
}

/**
 * Fetch paginated credit transaction history.
 */
export function useCreditTransactions(
  params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    action?: string;
  },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: creditKeys.transactions(params),
    queryFn: async () => {
      const res = await creditsApi.listTransactions(params);
      return { data: res.data, meta: res.meta };
    },
    staleTime: 60_000,
    ...options,
  });
}
