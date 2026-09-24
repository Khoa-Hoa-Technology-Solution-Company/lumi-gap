import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { getSupportedLanguages, LIBRETRANSLATE_PROVIDER_VERSION, translateText } from "./libretranslate.client.js";
import { generateJSON } from "../llm/gemini.client.js";
import { paperService, type PaperDetailViewer } from "./paper.service.js";

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
    if (!await paperService.getById(paperId, viewer)) throw AppError.notFound("Paper not found");
    const parsed = parseDatabaseId(paperId);
    if (!parsed) throw AppError.notFound("Paper not found");
    const paper = await getPrisma().paper.findUnique({
      where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
      select: { id: true, legacyMongoId: true, title: true, abstractText: true, language: true },
    });
    if (!paper) throw AppError.notFound("Paper not found");

    const rawSourceLanguage = (paper.language || "und").toLowerCase();
    const sourceLanguage = /^[a-z]{2,3}$/.test(rawSourceLanguage) ? rawSourceLanguage : "und";
    const abstractText = paper.abstractText || "";
    if (sourceLanguage === targetLanguage) {
      return {
        paperId: publicDatabaseId(paper),
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

    const cacheKey = {
      paperId: paper.id,
      targetLanguage,
      sourceTextHash,
      provider,
      providerVersion,
    };
    const cached = await getPrisma().paperTranslation.findUnique({
      where: { paperId_targetLanguage_sourceTextHash_provider_providerVersion: cacheKey },
    });
    if (cached) {
      return {
        paperId: publicDatabaseId(paper),
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

    const saved = await getPrisma().paperTranslation.upsert({
      where: { paperId_targetLanguage_sourceTextHash_provider_providerVersion: cacheKey },
      create: { ...cacheKey, sourceLanguage, translatedTitle, translatedAbstract },
      update: {},
    });

    return {
      paperId: publicDatabaseId(paper),
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
