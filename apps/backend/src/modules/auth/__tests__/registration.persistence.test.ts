import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { env } from "../../../config/env.js";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { validate } from "../../../common/middleware/validate.js";
import { authController } from "../auth.controller.js";
import { RegisterSchema } from "../dto/auth.schema.js";
import { authService } from "../auth.service.js";
import { authMailService } from "../auth-mail.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn() }, aiJobsQueue: { add: vi.fn() } }));
const enabled = process.env.REGISTRATION_INTEGRATION === "1";
if (enabled && (new URL(env.DATABASE_URL!).pathname !== "/lumigap_registration_test" || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL!).hostname))) throw Error("Isolated local registration database required");

describe.skipIf(!enabled).sequential("registration failure recovery with PostgreSQL", () => {
  const db = getPrisma();
  let server: ReturnType<express.Express["listen"]>, origin: string;
  const original = { mode: env.EMAIL_DELIVERY_MODE, nodeEnv: env.NODE_ENV, cors: env.CORS_ORIGIN };
  const password = "SyntheticTest@123";
  const input = () => ({ email: `registration-${randomUUID()}@example.test`, password, fullName: "Synthetic registration" });
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.post("/register", validate(RegisterSchema), authController.register); app.use(errorHandler);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(() => { env.EMAIL_DELIVERY_MODE = original.mode; env.NODE_ENV = original.nodeEnv; env.CORS_ORIGIN = original.cors; vi.restoreAllMocks(); });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await disconnectPostgres(); });
  it("returns 201 on the production localhost/disabled-mail configuration without verifying the account", async () => {
    env.EMAIL_DELIVERY_MODE = "disabled"; env.NODE_ENV = "production"; env.CORS_ORIGIN = "http://localhost:8080";
    const body = input();
    const response = await fetch(`${origin}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(response.status).toBe(201);
    const result = (await response.json()).data;
    expect(result.verificationEmailDelivery).toBe("DISABLED"); expect(result.tokens.accessToken).toBeTruthy(); expect(result.user.emailVerifiedAt).toBeUndefined();
    const linked = await db.userEmail.findUniqueOrThrow({ where: { normalizedEmail: body.email } });
    expect(linked.verifiedAt).toBeNull(); expect(await db.emailVerificationToken.count({ where: { userId: linked.userId, consumedAt: null } })).toBe(1);
    await expect(authService.resendEmailVerification(body.email)).resolves.toBeUndefined();
    expect((await authService.login({ email: body.email, password })).user.id).toBe(result.user.id);
  });
  it("reports mail failure separately after account creation and allows login/resend without creating a duplicate", async () => {
    const body = input(); vi.spyOn(authMailService, "sendEmailVerification").mockRejectedValue(new Error("SMTP unavailable"));
    const result = await authService.register(body);
    expect(result.verificationEmailDelivery).toBe("FAILED"); expect(result.user.emailVerifiedAt).toBeUndefined();
    expect((await authService.login({ email: body.email, password })).user.id).toBe(result.user.id);
    expect(await db.user.count({ where: { email: body.email } })).toBe(1);
    await expect(authService.register({ ...body, email: body.email.toUpperCase(), password: "DifferentTest@123" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await authService.login({ email: body.email, password })).user.id).toBe(result.user.id);
    vi.mocked(authMailService.sendEmailVerification).mockResolvedValue(true);
    await authService.resendEmailVerification(body.email);
    expect(await db.emailVerificationToken.count({ where: { userId: result.user.id, consumedAt: null } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { email: body.email } })).emailVerifiedAt).toBeNull();
  });
  it("returns an actionable 409 on an existing email, and handles simultaneous registration safely", async () => {
    const body = input(); const results = await Promise.allSettled([authService.register(body), authService.register(body)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { statusCode: 409 } });
    expect(await db.user.count({ where: { email: body.email } })).toBe(1);
    const response = await fetch(`${origin}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(response.status).toBe(409); expect((await response.json()).error.message).toBe("Email already registered");
  });
});
