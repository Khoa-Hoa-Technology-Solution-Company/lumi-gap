import crypto from "node:crypto";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { creditService } from "./credit.service.js";
import type { PayosWebhookBody } from "./dto/credit.schema.js";
export type { PayosWebhookBody } from "./dto/credit.schema.js";

export interface CreatePaymentLinkParams {
  userId: string;
  amountVnd: number;
  returnUrl?: string;
  cancelUrl?: string;
}

function sortDataByKey(data: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  Object.keys(data)
    .sort()
    .forEach((key) => {
      sorted[key] = data[key];
    });
  return sorted;
}

export function generatePayosSignature(
  data: Record<string, unknown>,
  checksumKey: string,
): string {
  const sorted = sortDataByKey(data);
  const queryString = Object.keys(sorted)
    .filter(key => sorted[key] !== undefined)
    .map(key => {
      const value = sorted[key];
      const normalized = value === null || value === "null" || value === "undefined" ? ""
        : Array.isArray(value) ? JSON.stringify(value.map(item => sortDataByKey(item as Record<string, unknown>)))
        : String(value);
      return `${key}=${normalized}`;
    })
    .join("&");
  return crypto.createHmac("sha256", checksumKey).update(queryString).digest("hex");
}

export const payosService = {
  /**
   * Tạo link thanh toán nạp credit qua PayOS
   */
  async createPaymentLink(params: CreatePaymentLinkParams) {
    const { userId, amountVnd, returnUrl, cancelUrl } = params;

    if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0 || amountVnd > 2_147_483_647) {
      throw AppError.badRequest("Số tiền thanh toán không hợp lệ");
    }
    if (env.NODE_ENV === "production" && !(env.PAYOS_CLIENT_ID && env.PAYOS_API_KEY && env.PAYOS_CHECKSUM_KEY)) {
      throw AppError.serviceUnavailable("Cổng thanh toán PayOS chưa được cấu hình");
    }

    if (amountVnd < env.MIN_TOPUP_VND) {
      throw AppError.badRequest(
        `Mức nạp tối thiểu là ${env.MIN_TOPUP_VND.toLocaleString("vi-VN")} VNĐ`,
      );
    }

    if (amountVnd % env.CREDIT_PRICE_VND !== 0) {
      throw AppError.badRequest(
        `Số tiền phải là bội số của ${env.CREDIT_PRICE_VND.toLocaleString("vi-VN")} VNĐ`,
      );
    }

    const creditsToAdd = Math.floor(amountVnd / env.CREDIT_PRICE_VND);
    const orderCode = Date.now() * 1000 + crypto.randomInt(1000);

    const description = `Nap ${creditsToAdd} credit`;
    const webOrigin = env.CORS_ORIGIN.split(",")[0]!.trim();
    const defaultReturn = returnUrl || `${webOrigin}/profile?tab=credits&status=success`;
    const defaultCancel = cancelUrl || `${webOrigin}/profile?tab=credits&status=cancelled`;

    let checkoutUrl = "";
    let qrCode = "";
    let paymentLinkId = "";

    if (env.PAYOS_CLIENT_ID && env.PAYOS_API_KEY && env.PAYOS_CHECKSUM_KEY) {
      const payload: Record<string, unknown> = {
        amount: amountVnd,
        cancelUrl: defaultCancel,
        description: description.slice(0, 25),
        orderCode,
        returnUrl: defaultReturn,
      };

      const signature = generatePayosSignature(payload, env.PAYOS_CHECKSUM_KEY);
      const requestBody = { ...payload, signature };

      try {
        const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-client-id": env.PAYOS_CLIENT_ID,
            "x-api-key": env.PAYOS_API_KEY,
          },
          body: JSON.stringify(requestBody),
        });

        const resData = (await response.json()) as {
          code: string;
          desc: string;
          data?: { checkoutUrl: string; qrCode: string; paymentLinkId: string };
        };

        if (resData.code !== "00" || !resData.data) {
          logger.error({ resData }, "PayOS API returned error");
          throw AppError.badRequest(`Lỗi tạo link PayOS: ${resData.desc}`);
        }

        checkoutUrl = resData.data.checkoutUrl;
        qrCode = resData.data.qrCode;
        paymentLinkId = resData.data.paymentLinkId;
      } catch (err: unknown) {
        if (err instanceof AppError) throw err;
        logger.error({ err }, "Failed to connect to PayOS");
        throw AppError.serviceUnavailable("Không thể kết nối đến cổng thanh toán PayOS");
      }
    } else {
      // Mock payment URL for local development when keys are not configured
      checkoutUrl = `${defaultReturn}&orderCode=${orderCode}&mock=true`;
    }

    const parsedUserId = parseDatabaseId(userId);
    if (!parsedUserId) throw AppError.notFound("Không tìm thấy thông tin người dùng");
    const user = await getPrisma().user.findUnique({
      where: parsedUserId.kind === "uuid" ? { id: parsedUserId.value } : { legacyMongoId: parsedUserId.value },
      select: { id: true },
    });
    if (!user) throw AppError.notFound("Không tìm thấy thông tin người dùng");
    const order = await getPrisma().paymentOrder.create({ data: {
      orderCode: BigInt(orderCode), userId: user.id, amount: amountVnd, credits: creditsToAdd,
      status: "pending", paymentLinkId: paymentLinkId || null, checkoutUrl, qrCode: qrCode || null,
    } });

    return {
      orderId: publicDatabaseId(order),
      orderCode,
      amount: amountVnd,
      credits: creditsToAdd,
      checkoutUrl,
      qrCode,
    };
  },

  /**
   * Xử lý webhook từ PayOS khi thanh toán thành công
   */
  async handleWebhook(body: PayosWebhookBody) {
    if (!env.PAYOS_CHECKSUM_KEY) {
      throw AppError.serviceUnavailable("Cổng thanh toán PayOS chưa được cấu hình");
    }
    {
      const computedSignature = generatePayosSignature(
        body.data as unknown as Record<string, unknown>,
        env.PAYOS_CHECKSUM_KEY,
      );
      const received = /^[a-f\d]{64}$/i.test(body.signature) ? Buffer.from(body.signature, "hex") : Buffer.alloc(0);
      const computed = Buffer.from(computedSignature, "hex");
      if (received.length !== computed.length || !crypto.timingSafeEqual(computed, received)) {
        logger.warn("Invalid PayOS webhook signature");
        throw AppError.badRequest("Chữ ký webhook PayOS không hợp lệ");
      }
    }

    const { orderCode, amount } = body.data;
    if (body.code !== "00" || body.data.code !== "00" || !body.success || body.data.currency !== "VND") {
      logger.info({ orderCode, code: body.code }, "PayOS transaction not successful");
      return { success: false };
    }

    const order = await getPrisma().paymentOrder.findUnique({ where: { orderCode: BigInt(orderCode) } });
    if (!order) {
      logger.warn({ orderCode }, "PayOS order not found in database");
      return { success: true };
    }

    if (order.status === "paid") {
      return { success: true, message: "Order already paid" };
    }
    if (order.status !== "pending") {
      throw AppError.badRequest("Đơn nạp credit không còn chờ thanh toán");
    }
    if (order.paymentLinkId && body.data.paymentLinkId !== order.paymentLinkId) {
      throw AppError.badRequest("Mã thanh toán không khớp với đơn nạp credit");
    }
    if (amount !== order.amount) {
      logger.warn({ orderCode, expectedAmount: order.amount, receivedAmount: amount }, "PayOS amount mismatch");
      throw AppError.badRequest("Số tiền thanh toán không khớp với đơn nạp credit");
    }

    // Cộng credit cho người dùng
    await creditService.rewardCreditsOnce({
      userId: order.userId,
      amount: order.credits,
      targetId: order.id,
      idempotencyKey: `payos:${orderCode}`,
      action: "credit_topup",
      targetKind: "payment_order",
      metadata: {
        paymentProvider: "payos",
        orderCode,
        amountVnd: amount,
      },
    });
    await getPrisma().paymentOrder.updateMany({
      where: { id: order.id, status: "pending" },
      data: { status: "paid", paidAt: new Date() },
    });

    logger.info(
      { userId: order.userId, credits: order.credits, orderCode },
      "Successfully credited user via PayOS",
    );

    return { success: true };
  },

  /**
   * Lấy lịch sử nạp tiền của người dùng
   */
  async getUserOrders(userId: string) {
    const parsed = parseDatabaseId(userId);
    if (!parsed) return [];
    const user = await getPrisma().user.findUnique({
      where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
      select: { id: true },
    });
    if (!user) return [];
    const orders = await getPrisma().paymentOrder.findMany({
      where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
    });
    return orders.map((order) => ({ ...order, id: publicDatabaseId(order), _id: publicDatabaseId(order), orderCode: Number(order.orderCode) }));
  },
};
