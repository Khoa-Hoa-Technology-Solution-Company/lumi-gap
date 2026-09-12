import type { Request, Response } from "express";
import type { TranslatePaperInput } from "./dto/translate-paper.schema.js";
import { paperTranslationService } from "./paper-translation.service.js";
import { env } from "../../config/env.js";
import { getSupportedLanguages } from "./libretranslate.client.js";

export const paperTranslationController = {
  async capabilities(_req: Request, res: Response) {
    if (env.TRANSLATION_PROVIDER !== "libretranslate") {
      res.json({
        success: true,
        data: {
          enabled: env.TRANSLATION_PROVIDER === "gemini",
          provider: env.TRANSLATION_PROVIDER,
          targetLanguages: env.TRANSLATION_PROVIDER === "gemini" ? ["en", "vi"] : [],
        },
      });
      return;
    }

    try {
      const targetLanguages = await getSupportedLanguages();
      res.json({
        success: true,
        data: { enabled: true, provider: env.TRANSLATION_PROVIDER, targetLanguages },
      });
    } catch {
      res.json({
        success: true,
        data: {
          enabled: false,
          provider: env.TRANSLATION_PROVIDER,
          targetLanguages: [],
          message: "Translation service is configured but unavailable.",
        },
      });
    }
  },

  async translate(
    req: Request<{ id: string }, unknown, TranslatePaperInput>,
    res: Response,
  ) {
    const data = await paperTranslationService.translate(
      req.params.id,
      req.body.targetLanguage,
      { userId: req.user?.sub, role: req.user?.role },
    );
    res.json({ success: true, data });
  },
};
