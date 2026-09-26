import type { Request, Response } from "express";
import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
  UpdateProfileInput,
  ChangePasswordInput,
  OAuthExchangeInput,
  UpdateAcademicProfileInput,
  VerifyEmailInput,
  ResendEmailVerificationInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./dto/auth.schema.js";
import { authService } from "./auth.service.js";
import { env } from "../../config/env.js";
import { oauthExchangeService } from "./oauth-exchange.service.js";
import { googleOidcService } from "./google-oidc.service.js";

function sessionContext(req: Pick<Request, "get" | "ip">) {
  return { userAgent: req.get("user-agent"), ipAddress: req.ip };
}

export const authController = {
  async register(req: Request<unknown, unknown, RegisterInput>, res: Response) {
    const result = await authService.register(req.body, sessionContext(req));
    res.status(201).json({ success: true, data: result });
  },

  async login(req: Request<unknown, unknown, LoginInput>, res: Response) {
    const result = await authService.login(req.body, sessionContext(req));
    res.json({ success: true, data: result });
  },

  async refresh(req: Request<unknown, unknown, RefreshInput>, res: Response) {
    const tokens = await authService.refresh(req.body.refreshToken, sessionContext(req));
    res.json({ success: true, data: tokens });
  },

  async logout(req: Request<unknown, unknown, RefreshInput>, res: Response) {
    await authService.logout(req.body.refreshToken);
    res.json({ success: true, data: { ok: true } });
  },

  async exchangeOAuthCode(req: Request<unknown, unknown, OAuthExchangeInput>, res: Response) {
    const result = await oauthExchangeService.consume(req.body.code);
    res.json({ success: true, data: result });
  },

  async me(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    const user = await authService.me(req.user.sub);
    res.json({ success: true, data: { user } });
  },

  async updateProfile(req: Request<unknown, unknown, UpdateProfileInput>, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    const user = await authService.updateProfile(req.user.sub, req.body);
    res.json({ success: true, data: { user } });
  },

  async status(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    const user = await authService.me(req.user.sub);
    res.json({
      success: true,
      data: {
        accountStatus: user.accountStatus,
        systemRole: user.systemRole,
        emailVerified: Boolean(user.emailVerifiedAt),
        onboardingCompleted: user.onboarding?.completed === true,
        primaryPosition: user.primaryPosition,
        capabilities: user.capabilities ?? [],
      },
    });
  },

  async updateAcademicProfile(req: Request<unknown, unknown, UpdateAcademicProfileInput>, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    const user = await authService.updateAcademicProfile(req.user.sub, req.body);
    res.json({ success: true, data: { user } });
  },

  async changePassword(req: Request<unknown, unknown, ChangePasswordInput>, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    await authService.changePassword(req.user.sub, req.body);
    res.json({ success: true, data: { ok: true } });
  },

  async verifyEmail(req: Request<unknown, unknown, VerifyEmailInput>, res: Response) {
    await authService.verifyEmail(req.body.token);
    res.json({ success: true, data: { verified: true } });
  },

  async resendEmailVerification(req: Request<unknown, unknown, ResendEmailVerificationInput>, res: Response) {
    await authService.resendEmailVerification(req.body.email);
    res.status(202).json({ success: true, data: { accepted: true } });
  },

  async forgotPassword(req: Request<unknown, unknown, ForgotPasswordInput>, res: Response) {
    await authService.forgotPassword(req.body.email);
    res.status(202).json({ success: true, data: { accepted: true } });
  },

  async resetPassword(req: Request<unknown, unknown, ResetPasswordInput>, res: Response) {
    await authService.resetPassword(req.body);
    res.json({ success: true, data: { reset: true } });
  },

  async googleStart(req: Request, res: Response) {
    const returnOrigin = typeof req.query.returnOrigin === "string" ? req.query.returnOrigin : undefined;
    res.redirect(await googleOidcService.authorizationUrl(returnOrigin));
  },

  async googleCallback(req: Request, res: Response) {
    const primaryOrigin = env.CORS_ORIGIN.split(',')[0]?.trim() ?? env.CORS_ORIGIN;

    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !state) throw new Error("Missing Google callback parameters");
      const exchanged = await googleOidcService.exchange(code, state);
      const result = await authService.googleLogin(exchanged.identity, sessionContext(req));

      const exchangeCode = await oauthExchangeService.create(result);
      const redirectUrl = new URL(`${exchanged.returnOrigin}/auth/oauth-callback`);
      redirectUrl.searchParams.set("code", exchangeCode);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("Google login error:", error);
      res.redirect(`${primaryOrigin}/login?error=GoogleLoginFailed`);
    }
  },
};
