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

// Payment amounts are persisted as PostgreSQL Int, and order codes as BigInt.
const PaymentAmountSchema = z.number().int().positive().max(2_147_483_647);
const PaymentRedirectSchema = z.string().url().refine(value => /^https?:\/\//i.test(value), "Expected an HTTP(S) URL");

export const CreatePaymentLinkSchema = z.object({
  amountVnd: PaymentAmountSchema.optional(),
  amount: PaymentAmountSchema.optional(),
  returnUrl: PaymentRedirectSchema.optional(),
  cancelUrl: PaymentRedirectSchema.optional(),
}).refine(value => value.amountVnd !== undefined || value.amount !== undefined, "Payment amount is required")
  .transform(value => ({ ...value, amountVnd: value.amountVnd ?? value.amount! }));

export const PayosWebhookSchema = z.object({
  code: z.string(),
  desc: z.string(),
  success: z.boolean(),
  // Preserve every provider field: all data fields participate in the signature.
  data: z.object({
    orderCode: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    amount: PaymentAmountSchema,
    description: z.string(),
    accountNumber: z.string(),
    reference: z.string(),
    transactionDateTime: z.string(),
    currency: z.string(),
    paymentLinkId: z.string(),
    code: z.string(),
    desc: z.string(),
  }).passthrough(),
  signature: z.string().regex(/^[a-f\d]{64}$/i),
});

export type PayosWebhookBody = z.infer<typeof PayosWebhookSchema>;
