import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { creditController } from "./credit.controller.js";
import { validate } from "../../common/middleware/validate.js";
import { CreatePaymentLinkSchema, PayosWebhookSchema } from "./dto/credit.schema.js";

export const creditRouter: Router = Router();

// Public webhook route for PayOS (secured via HMAC-SHA256 signature)
creditRouter.post("/payos/webhook", validate(PayosWebhookSchema), creditController.handlePayosWebhook);

// Protected routes
creditRouter.use(requireAuth);

creditRouter.get("/balance", creditController.getBalance);
creditRouter.get("/summary", creditController.getSummary);
creditRouter.get("/transactions", creditController.listTransactions);
creditRouter.get("/orders", creditController.listOrders);
creditRouter.post("/payos/create-payment-link", validate(CreatePaymentLinkSchema), creditController.createPaymentLink);
