import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { PaperModel } from "./models/paper.model.js";
import { PaperTranslationModel } from "./models/paper-translation.model.js";
import { getSupportedLanguages, LIBRETRANSLATE_PROVIDER_VERSION, translateText } from "./libretranslate.client.js";
import { generateJSON } from "../llm/gemini.client.js";
import {
  buildPaperVisibilityFilter,
  type PaperDetailViewer,
} from "./paper.service.js";

export interface PaperTranslationResult {
  paperId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedTitle: string;
  translatedAbstract: string;
  provider: "original" | "libretranslate" | "gemini";
  cacheHit: boolean;
  translatedAt: string;
}

function hashSource(title: string, abstractText: string): string {
  return createHash("sha256").update(`${title}\u0000${abstractText}`).digest("hex");
}

export const paperTranslationService = {
  async translate(
    paperId: string,
    targetLanguage: string,
    viewer: PaperDetailViewer = {},
  ): Promise<PaperTranslationResult> {
    const visibilityFilter = buildPaperVisibilityFilter(paperId, viewer);
    if (!visibilityFilter) throw AppError.notFound("Paper not found");
    const paper = await PaperModel.findOne(visibilityFilter).select("title abstractText language").lean();
    if (!paper) throw AppError.notFound("Paper not found");

    const rawSourceLanguage = (paper.language || "und").toLowerCase();
    const sourceLanguage = /^[a-z]{2,3}$/.test(rawSourceLanguage) ? rawSourceLanguage : "und";
    const abstractText = paper.abstractText || "";
    if (sourceLanguage === targetLanguage) {
      return {
        paperId,
        sourceLanguage,
        targetLanguage,
        translatedTitle: paper.title,
        translatedAbstract: abstractText,
        provider: "original",
        cacheHit: true,
        translatedAt: new Date().toISOString(),
      };
    }

    if (env.TRANSLATION_PROVIDER === "disabled") {
      throw AppError.serviceUnavailable("Paper translation is not enabled on this deployment.");
    }

    const provider = env.TRANSLATION_PROVIDER;
    if (provider === "libretranslate") {
      const supportedLanguages = await getSupportedLanguages();
      if (!supportedLanguages.includes(targetLanguage.toLowerCase())) {
        throw AppError.badRequest(`Translation target '${targetLanguage}' is not supported by this provider.`);
      }
    }
    const providerVersion = provider === "gemini" ? "gemini_v1" : LIBRETRANSLATE_PROVIDER_VERSION;
    const sourceTextHash = hashSource(paper.title, abstractText);

    const cached = await PaperTranslationModel.findOne({
      paper: paper._id,
      targetLanguage,
      sourceTextHash,
      provider,
      providerVersion,
    }).lean();
    if (cached) {
      return {
        paperId,
        sourceLanguage,
        targetLanguage,
        translatedTitle: cached.translatedTitle,
        translatedAbstract: cached.translatedAbstract,
        provider: cached.provider as "original" | "libretranslate" | "gemini",
        cacheHit: true,
        translatedAt: (cached.updatedAt as Date).toISOString(),
      };
    }

    let translatedTitle = "";
    let translatedAbstract = "";

    if (provider === "gemini") {
      try {
        const prompt = `Translate the following academic paper title and abstract into ${targetLanguage === "vi" ? "Vietnamese" : "English"}.
Maintain an academic, accurate, professional tone.

Title: ${paper.title}
Abstract: ${abstractText || "No abstract available"}

Respond strictly in JSON format matching this schema:
{
  "translatedTitle": "...",
  "translatedAbstract": "..."
}`;

        const res = await generateJSON<{
          translatedTitle: string;
          translatedAbstract: string;
        }>(prompt);
        translatedTitle = res.translatedTitle || paper.title;
        translatedAbstract = res.translatedAbstract || abstractText;
      } catch (err: any) {
        logger.error({ err }, "Gemini paper translation failed");
        throw AppError.internal(err?.message || "Paper translation failed. Please try again.");
      }
    } else {
      [translatedTitle, translatedAbstract] = await Promise.all([
        translateText(paper.title, sourceLanguage, targetLanguage),
        translateText(abstractText, sourceLanguage, targetLanguage),
      ]);
    }

    const cacheFilter = {
      paper: paper._id,
      targetLanguage,
      sourceTextHash,
      provider,
      providerVersion,
    } as const;

    let saved;
    try {
      saved = await PaperTranslationModel.findOneAndUpdate(
        cacheFilter,
        {
          $setOnInsert: {
            ...cacheFilter,
            sourceLanguage,
            translatedTitle,
            translatedAbstract,
          },
        },
        { upsert: true, new: true },
      ).lean();
    } catch (error: unknown) {
      if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
      saved = await PaperTranslationModel.findOne(cacheFilter).lean();
    }

    if (!saved) throw AppError.internal("Translated paper could not be cached.");

    return {
      paperId,
      sourceLanguage,
      targetLanguage,
      translatedTitle: saved.translatedTitle,
      translatedAbstract: saved.translatedAbstract,
      provider: saved.provider as "original" | "libretranslate" | "gemini",
      cacheHit: false,
      translatedAt: (saved.updatedAt as Date).toISOString(),
    };
  },
};
