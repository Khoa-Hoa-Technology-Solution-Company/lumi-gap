import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { UserModel } from "../auth/models/user.model.js";
import type { CreditAction } from "./credit-policy.js";
import {
  CreditTransactionModel,
  type CreditTransactionDoc,
} from "./models/credit-transaction.model.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChargeParams {
  userId: string;
  action: CreditAction;
  amount: number;
  targetKind?: string;
  targetId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface RefundParams {
  transactionId: string;
  reason?: string;
}

export interface RewardParams {
  userId: string;
  amount: number;
  targetId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface OwnedChargeResult {
  transaction: CreditTransactionDoc | null;
  /** True only when this invocation deducted the balance and created the ledger row. */
  created: boolean;
}

/* ------------------------------------------------------------------ */
/*  Credit Service                                                     */
/* ------------------------------------------------------------------ */

export const creditService = {
  /** Add an uploader reward once and persist it in Credit History. */
  async rewardCreditsOnce(params: RewardParams): Promise<CreditTransactionDoc | null> {
    const { userId, amount, targetId, idempotencyKey, metadata } = params;
    if (amount <= 0) return null;

    const existing = await CreditTransactionModel.findOne({
      idempotencyKey,
      status: "applied",
    }).lean();
    if (existing) return existing as CreditTransactionDoc;

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $inc: { credits: amount } },
      { new: true },
    ).lean();
    if (!updatedUser) throw AppError.notFound("User not found");

    try {
      const transaction = await CreditTransactionModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        type: "reward",
        action: "paper_upload_reward",
        amount,
        balanceAfter: updatedUser.credits ?? 0,
        targetKind: "paper",
        targetId: new mongoose.Types.ObjectId(targetId),
        idempotencyKey,
        status: "applied",
        metadata: {
          ...metadata,
          uploaderName: updatedUser.fullName ?? "Unknown user",
        },
      });
      return transaction.toObject() as CreditTransactionDoc;
    } catch (err) {
      logger.error({ err, userId, amount, targetId }, "Credit reward ledger failed; rolling back");
      await UserModel.findByIdAndUpdate(userId, { $inc: { credits: -amount } });
      throw AppError.internal("Failed to record credit reward");
    }
  },

  /**
   * Atomically deduct credits from a user's balance.
   *
   * Uses `findOneAndUpdate` with `{ credits: { $gte: amount } }` to prevent
   * the balance from going negative even under concurrent requests.
   *
   * Idempotency: if the same `idempotencyKey` is already applied, the existing
   * transaction is returned without charging again.
   *
   * @returns The created (or existing) CreditTransaction document, or null if amount is 0.
   */
  async chargeCreditsCheckedOwned(params: ChargeParams): Promise<OwnedChargeResult> {
    const { userId, action, amount, targetKind, targetId, idempotencyKey, metadata } = params;

    // Free actions — no ledger entry needed
    if (amount <= 0) return { transaction: null, created: false };

    // Idempotency check — return existing if already applied
    const existing = await CreditTransactionModel.findOne({
      idempotencyKey,
      status: "applied",
    }).lean();
    if (existing) {
      logger.debug({ idempotencyKey, action }, "Credit charge idempotency hit");
      return { transaction: existing as CreditTransactionDoc, created: false };
    }

    // Atomic deduct — only succeeds if user has enough credits
    const updatedUser = await UserModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(userId), credits: { $gte: amount } },
      { $inc: { credits: -amount } },
      { new: true },
    ).lean();

    if (!updatedUser) {
      // Check if user exists to give a better error
      const user = await UserModel.findById(userId).select("credits").lean();
      if (!user) throw AppError.notFound("User not found");
      throw AppError.badRequest(
        `Insufficient credits. Required: ${amount}, available: ${user.credits ?? 0}`,
        { required: amount, available: user.credits ?? 0, action },
      );
    }

    // Create ledger entry
    try {
      const tx = await CreditTransactionModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        type: "charge",
        action,
        amount,
        balanceAfter: updatedUser.credits ?? 0,
        targetKind,
        targetId: targetId ? new mongoose.Types.ObjectId(targetId) : undefined,
        idempotencyKey,
        status: "applied",
        metadata,
      });

      logger.info(
        { userId, action, amount, balanceAfter: updatedUser.credits, txId: tx._id },
        "Credits charged",
      );

      return { transaction: tx.toObject() as CreditTransactionDoc, created: true };
    } catch (err) {
      // Ledger creation failed — rollback the credit deduction
      logger.error({ err, userId, action, amount }, "Credit ledger creation failed — rolling back");
      await UserModel.findByIdAndUpdate(userId, { $inc: { credits: amount } });
      if ((err as { code?: number }).code === 11000) {
        const concurrent = await CreditTransactionModel.findOne({ idempotencyKey }).lean();
        if (concurrent) {
          return { transaction: concurrent as CreditTransactionDoc, created: false };
        }
      }
      throw AppError.internal("Failed to record credit transaction");
    }
  },

  /**
   * Backwards-compatible charge API. Callers that may refund must use
   * chargeCreditsCheckedOwned() and refund only a transaction they created.
   */
  async chargeCreditsChecked(params: ChargeParams): Promise<CreditTransactionDoc | null> {
    const result = await this.chargeCreditsCheckedOwned(params);
    return result.transaction;
  },

  /**
   * Refund a previously charged transaction exactly once.
   *
   * Uses conditional update (`status: "applied"`) to prevent double-refunds
   * under concurrent calls.
   */
  async refundCreditsOnce(params: RefundParams): Promise<void> {
    const { transactionId, reason } = params;

    // Atomically mark original as refunded (only if still "applied")
    const original = await CreditTransactionModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(transactionId),
        type: "charge",
        status: "applied",
      },
      { $set: { status: "refunded" } },
      { new: false }, // return the pre-update doc to get the original amount
    ).lean();

    if (!original) {
      // Already refunded or doesn't exist — silently skip
      logger.debug({ transactionId }, "Refund skipped (already refunded or not found)");
      return;
    }

    // Credit the user back
    const updatedUser = await UserModel.findByIdAndUpdate(
      original.userId,
      { $inc: { credits: original.amount } },
      { new: true },
    ).lean();

    // Create refund ledger entry
    await CreditTransactionModel.create({
      userId: original.userId,
      type: "refund",
      action: original.action,
      amount: original.amount,
      balanceAfter: updatedUser?.credits ?? 0,
      targetKind: original.targetKind,
      targetId: original.targetId,
      idempotencyKey: `refund:${transactionId}`,
      status: "applied",
      refundedTransactionId: original._id,
      metadata: reason ? { reason } : undefined,
    });

    logger.info(
      { transactionId, userId: String(original.userId), amount: original.amount, reason },
      "Credits refunded",
    );
  },

  /** Get a user's current credit balance. */
  async getBalance(userId: string): Promise<number> {
    const user = await UserModel.findById(userId).select("credits").lean();
    if (!user) throw AppError.notFound("User not found");
    return user.credits ?? 0;
  },

  /** List credit transactions for a user with optional filters and pagination. */
  async listTransactions(params: {
    userId: string;
    page?: number;
    pageSize?: number;
    type?: string;
    action?: string;
  }) {
    const { userId, page = 1, pageSize = 20, type, action } = params;

    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };
    if (type) filter.type = type;
    if (action) filter.action = action;

    const [transactions, total] = await Promise.all([
      CreditTransactionModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      CreditTransactionModel.countDocuments(filter),
    ]);

    return {
      data: transactions,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  },
};
