import mongoose, { type InferSchemaType, Schema } from "mongoose";
import { CREDIT_ACTIONS, type CreditAction } from "../credit-policy.js";

/* ------------------------------------------------------------------ */
/*  Credit Transaction — audit ledger for every charge/refund/reward   */
/* ------------------------------------------------------------------ */

const creditTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["charge", "refund", "reward"],
      required: true,
    },
    action: {
      type: String,
      enum: CREDIT_ACTIONS,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },
    targetKind: {
      type: String,
      enum: [
        "search",
        "report",
        "gap_analysis",
        "gap_direction",
        "project_chat",
        "paper",
        "paper_review",
        "paper_format_check",
      ],
    },
    targetId: { type: Schema.Types.ObjectId },
    idempotencyKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["applied", "refunded"],
      default: "applied",
      required: true,
    },
    refundedTransactionId: { type: Schema.Types.ObjectId, ref: "CreditTransaction" },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Indexes
creditTransactionSchema.index({ userId: 1, createdAt: -1 });
creditTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
creditTransactionSchema.index({ targetKind: 1, targetId: 1 });

export type CreditTransactionDoc = InferSchemaType<typeof creditTransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type CreditTransactionHydrated = mongoose.HydratedDocument<
  InferSchemaType<typeof creditTransactionSchema>
>;

export const CreditTransactionModel = mongoose.model(
  "CreditTransaction",
  creditTransactionSchema,
  "credit_transactions",
);
