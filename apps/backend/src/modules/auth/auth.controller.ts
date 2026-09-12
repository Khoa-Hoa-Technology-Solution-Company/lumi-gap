import type { Request, Response } from "express";
import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
  UpdateProfileInput,
  ChangePasswordInput,
  OAuthExchangeInput,
} from "./dto/auth.schema.js";
import { authService } from "./auth.service.js";
import { env } from "../../config/env.js";
import type { Profile } from "passport-google-oauth20";
import { oauthExchangeService } from "./oauth-exchange.service.js";

export const authController = {
  async register(req: Request<unknown, unknown, RegisterInput>, res: Response) {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  },

  async login(req: Request<unknown, unknown, LoginInput>, res: Response) {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
  },

  async refresh(req: Request<unknown, unknown, RefreshInput>, res: Response) {
    const tokens = await authService.refresh(req.body.refreshToken);
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

  async changePassword(req: Request<unknown, unknown, ChangePasswordInput>, res: Response) {
    if (!req.user) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
    await authService.changePassword(req.user.sub, req.body);
    res.json({ success: true, data: { ok: true } });
  },

  async googleCallback(req: Request, res: Response) {
    const primaryOrigin = env.CORS_ORIGIN.split(',')[0]?.trim() ?? env.CORS_ORIGIN;

    if (!req.user) {
      return res.redirect(`${primaryOrigin}/login?error=GoogleLoginFailed`);
    }
    try {
      // req.user here is the Google Profile we passed from passport.ts
      const profile = req.user as unknown as Profile;
      const result = await authService.googleLogin(profile);

      const code = await oauthExchangeService.create(result);
      const redirectUrl = new URL(`${primaryOrigin}/auth/oauth-callback`);
      redirectUrl.searchParams.set("code", code);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("Google login error:", error);
      res.redirect(`${primaryOrigin}/login?error=GoogleLoginFailed`);
    }
  },
};
