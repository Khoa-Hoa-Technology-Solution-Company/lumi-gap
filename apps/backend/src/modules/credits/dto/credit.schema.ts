import { z } from "zod";
import { CREDIT_ACTIONS } from "../credit-policy.js";

/** Query params for GET /api/v1/credits/transactions. */
export const ListTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(["charge", "refund", "reward"]).optional(),
  action: z.enum(CREDIT_ACTIONS as unknown as [string, ...string[]]).optional(),
});

export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
