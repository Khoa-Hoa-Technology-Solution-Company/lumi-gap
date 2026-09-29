import type { Request, Response, NextFunction } from "express";
import { creditService } from "./credit.service.js";
import { payosService } from "./payos.service.js";
import { ListTransactionsQuerySchema } from "./dto/credit.schema.js";

/**
 * Credit endpoints. All routes sit behind requireAuth, so req.user is set.
 */
export const creditController = {
  /** GET /api/v1/credits/balance */
  async getBalance(req: Request, res: Response) {
    const credits = await creditService.getBalance(req.user!.sub);
    res.json({ success: true, data: { credits } });
  },

  /** GET /api/v1/credits/summary */
  async getSummary(req: Request, res: Response) {
    const summary = await creditService.getSummary(req.user!.sub);
    res.json({ success: true, data: summary });
  },

  /** GET /api/v1/credits/transactions */
  async listTransactions(req: Request, res: Response, next: NextFunction) {
    const parsed = ListTransactionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { page, pageSize, type, action } = parsed.data;
    const { data, meta } = await creditService.listTransactions({
      userId: req.user!.sub,
      page,
      pageSize,
      type,
      action,
    });

    res.json({ success: true, data, meta });
  },

  /** POST /api/v1/credits/payos/create-payment-link */
  async createPaymentLink(req: Request, res: Response, next: NextFunction) {
    try {
      const amountVnd = Number(req.body.amountVnd || req.body.amount);
      const returnUrl = req.body.returnUrl;
      const cancelUrl = req.body.cancelUrl;

      const result = await payosService.createPaymentLink({
        userId: req.user!.sub,
        amountVnd,
        returnUrl,
        cancelUrl,
      });

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/v1/credits/payos/webhook */
  async handlePayosWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await payosService.handleWebhook(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/v1/credits/orders */
  async listOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await payosService.getUserOrders(req.user!.sub);
      res.json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  },
};
