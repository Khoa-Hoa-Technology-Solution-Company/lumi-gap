import { api } from "@/services/api-client";
import type { ApiResponse, CreditBalance, CreditTransaction, ResponseMeta } from "@trend/shared-types";

export const creditsApi = {
  getBalance: () =>
    api.get<ApiResponse<CreditBalance>>("/credits/balance").then((r) => r.data),

  listTransactions: (params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    action?: string;
  }) =>
    api
      .get<{ success: true; data: CreditTransaction[]; meta: ResponseMeta }>("/credits/transactions", {
        params,
      })
      .then((r) => r.data),

  createPaymentLink: (amountVnd: number) =>
    api
      .post<{
        success: true;
        data: {
          orderId: string;
          orderCode: number;
          checkoutUrl: string;
          qrCode: string;
          amount: number;
          credits: number;
        };
      }>("/credits/payos/create-payment-link", { amountVnd })
      .then((r) => r.data),

  listOrders: () =>
    api.get<{ success: true; data: any[] }>("/credits/orders").then((r) => r.data),
};
