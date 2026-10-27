import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePayosSignature, payosService } from "../payos.service.js";
import { CreatePaymentLinkSchema, PayosWebhookSchema, type PayosWebhookBody } from "../dto/credit.schema.js";

const mocks = vi.hoisted(() => ({
  env: { PAYOS_CHECKSUM_KEY: "test-checksum" as string | undefined, PAYOS_CLIENT_ID: undefined,
    PAYOS_API_KEY: undefined, NODE_ENV: "test", MIN_TOPUP_VND: 10000, CREDIT_PRICE_VND: 100,
    CORS_ORIGIN: "http://localhost:3000,http://localhost:5173" },
  findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), user: vi.fn(), reward: vi.fn(),
}));
vi.mock("../../../config/env.js", () => ({ env: mocks.env }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  paymentOrder: { findUnique: mocks.findUnique, create: mocks.create, updateMany: mocks.updateMany },
  user: { findUnique: mocks.user },
}) }));
vi.mock("../credit.service.js", () => ({ creditService: { rewardCreditsOnce: mocks.reward } }));
const userId = "f62458f9-06b9-4bcf-b87c-f799cf14acba";
const order = { id: "order", userId, amount: 10000, credits: 100, status: "pending", paymentLinkId: "link" };
function webhook(data: Partial<PayosWebhookBody["data"]> = {}): PayosWebhookBody {
  const body = { code: "00", desc: "success", success: true, data: {
    orderCode: 123, amount: 10000, description: "test", accountNumber: "123", reference: "ref",
    transactionDateTime: "2026-10-22 10:00:00", currency: "VND", paymentLinkId: "link", code: "00", desc: "success", ...data,
  }, signature: "" };
  body.signature = generatePayosSignature(body.data, "test-checksum");
  return body;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.PAYOS_CHECKSUM_KEY = "test-checksum";
  mocks.env.NODE_ENV = "test";
  mocks.findUnique.mockResolvedValue(order);
  mocks.user.mockResolvedValue({ id: userId });
  mocks.create.mockResolvedValue({ id: "order" });
});

describe("PayOS webhook authentication and settlement", () => {
  it("normalizes nullable and nested provider fields according to PayOS serialization", () => {
    const expected = createHmac("sha256", "test-key").update('a=&b=&c=&items=[{"a":1,"z":2}]').digest("hex");
    expect(generatePayosSignature({ c: "undefined", b: "null", a: null, omitted: undefined, items: [{ z: 2, a: 1 }] }, "test-key")).toBe(expected);
  });
  it("fails closed when no checksum key is configured", async () => {
    mocks.env.PAYOS_CHECKSUM_KEY = undefined;
    await expect(payosService.handleWebhook(webhook())).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it.each(["", "00", "z".repeat(64), "0".repeat(64)])("rejects an invalid signature %s", async signature => {
    await expect(payosService.handleWebhook({ ...webhook(), signature })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it("verifies every provider field retained by request validation", async () => {
    const body = webhook({ counterAccountBankId: "970422" });
    await expect(payosService.handleWebhook(PayosWebhookSchema.parse(body))).resolves.toEqual({ success: true });
    expect(mocks.reward).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, idempotencyKey: "payos:123" }));
    await expect(payosService.handleWebhook({ ...body, data: { ...body.data, amount: 20000 } })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.reward).toHaveBeenCalledOnce();
  });
  it.each([{ code: "01" }, { success: false }, { data: { code: "01" } }, { data: { currency: "USD" } }])("ignores unsuccessful transactions: %j", async change => {
    const body = { ...webhook(change.data), ...change, data: webhook(change.data).data };
    await expect(payosService.handleWebhook(body)).resolves.toEqual({ success: false });
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it.each([{ amount: 20000 }, { paymentLinkId: "another-link" }])("rejects a signed transaction that does not match the order %j", async data => {
    await expect(payosService.handleWebhook(webhook(data))).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it("acknowledges duplicate paid orders without crediting again", async () => {
    mocks.findUnique.mockResolvedValue({ ...order, status: "paid" });
    await payosService.handleWebhook(webhook());
    expect(mocks.reward).not.toHaveBeenCalled();
  });
  it("does not credit cancelled orders", async () => {
    mocks.findUnique.mockResolvedValue({ ...order, status: "cancelled" });
    await expect(payosService.handleWebhook(webhook())).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.reward).not.toHaveBeenCalled();
  });
});

describe("payment link input", () => {
  it.each([undefined, null, "10000", 0, -1, 0.5, NaN, Infinity, 2_147_483_648])("rejects invalid amount %s before database writes", async amountVnd => {
    expect(CreatePaymentLinkSchema.safeParse({ amountVnd }).success).toBe(false);
    await expect(payosService.createPaymentLink({ userId, amountVnd: amountVnd as number })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("supports the legacy amount property and HTTP(S) redirect URLs", () => {
    expect(CreatePaymentLinkSchema.parse({ amount: 10000 }).amountVnd).toBe(10000);
    expect(CreatePaymentLinkSchema.safeParse({ amountVnd: 10000, returnUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("uses a single valid web origin for default redirects", async () => {
    const result = await payosService.createPaymentLink({ userId, amountVnd: 10000 });
    expect(new URL(result.checkoutUrl).origin).toBe("http://localhost:3000");
    expect(result.checkoutUrl).not.toContain(",");
  });
  it("does not offer mock payments in production", async () => {
    mocks.env.NODE_ENV = "production";
    await expect(payosService.createPaymentLink({ userId, amountVnd: 10000 })).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
