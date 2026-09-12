import type { PaperComparison } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { hashKey } from "../../infrastructure/cache.js";
import { generateJSON } from "../llm/gemini.client.js";
import { cachedGenerate } from "../llm/llm.run.js";
import { PaperModel } from "./models/paper.model.js";
import { toPaperRef } from "./paper.service.js";
import {
  buildComparePrompt,
  buildCompareCacheKey,
  parseComparison,
  COMPARE_SYSTEM_PROMPT,
  type CompareLlmOutput,
} from "./compare.prompt.js";
import type { PaperStructuredAnalysis } from "./paper-structured-context.js";

type Metric = PaperComparison["metrics"][number];

/**
 * Compare 2..COMPARE_MAX_PAPERS papers: deterministic metrics (0 token) + a cached
 * LLM qualitative comparison grounded ONLY in title+abstract. Same id SET → cache
 * hit regardless of selection order.
 */
export async function comparePapers(ids: string[]): Promise<PaperComparison> {
  const unique = [...new Set(ids.map(String))];
  if (unique.length < 2 || unique.length > env.COMPARE_MAX_PAPERS) {
    throw AppError.badRequest(`Compare between 2 and ${env.COMPARE_MAX_PAPERS} distinct papers`);
  }

  const docs = await PaperModel.find({ _id: { $in: unique }, dataStatus: "active" })
    .select(
      "title publicationYear authors externalIds citationCount journalName openAccessUrl paperKind aiScore abstractText aiAnalysis",
    )
    .lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  if (unique.some((id) => !byId.has(id))) throw AppError.notFound("One or more papers not found");

  // `papers`/`metrics` follow the REQUEST order (what the user picked).
  const requestDocs = unique.map((id) => byId.get(id)!);
  const papers = requestDocs.map((d) => toPaperRef(d as Record<string, unknown>));
  const metrics: Metric[] = requestDocs.map((d) => {
    const o = d as Record<string, unknown>;
    return {
      paperId: String(o._id),
      publicationYear: Number(o.publicationYear ?? 0),
      citationCount: Number(o.citationCount ?? 0),
      aiScore: o.aiScore as Metric["aiScore"],
      journalName: o.journalName ? String(o.journalName) : undefined,
      openAccess: typeof o.openAccessUrl === "string" && o.openAccessUrl.length > 0,
      paperKind: o.paperKind as Metric["paperKind"],
    };
  });

  // The cache key is order-INSENSITIVE (a comparison SET is unordered), so the
  // cached LLM output MUST be computed in a canonical (sorted-id) order — otherwise
  // {a,b} and {b,a} share an entry but their perPaper[] columns would misalign.
  // We build + cache in canonical order, then remap perPaper back to request order.
  const canonical = [...unique].sort();
  const model = env.GEMINI_MODEL_FAST;
  const cacheKey = buildCompareCacheKey({
    paperIds: unique,
    model,
    promptVersion: env.COMPARE_PROMPT_VERSION,
  });
  const candidates = canonical.map((id) => {
    const o = byId.get(id) as Record<string, unknown>;
    return {
      id,
      title: String(o.title ?? ""),
      abstractText: o.abstractText ? String(o.abstractText) : undefined,
      aiAnalysis: (o.aiAnalysis ?? null) as PaperStructuredAnalysis | null,
    };
  });
  const prompt = buildComparePrompt(candidates);
  const llm = await cachedGenerate<CompareLlmOutput>({
    task: "compare",
    promptVersion: env.COMPARE_PROMPT_VERSION,
    keyParts: { legacyCacheKey: cacheKey },
    inputHash: hashKey({ system: COMPARE_SYSTEM_PROMPT, prompt }),
    model,
    validate: (candidate) => {
      if (!candidate.dimensions || candidate.dimensions.length === 0) {
        throw AppError.serviceUnavailable("AI comparison returned an unexpected result.");
      }
      return candidate;
    },
    generate: async (routedModel) => {
      const raw = await generateJSON<unknown>(prompt, {
        model: routedModel,
        system: COMPARE_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 2048,
      });
      return parseComparison(raw, canonical.length);
    },
  });

  // Remap each dimension's perPaper from canonical order → request order so the
  // columns line up with `papers`/`metrics`.
  const canonicalIndex = new Map(canonical.map((id, i) => [id, i]));
  const dimensions = llm.dimensions.map((d) => ({
    name: d.name,
    perPaper: unique.map((id) => d.perPaper[canonicalIndex.get(id)!] ?? "not stated"),
  }));

  return { papers, metrics, llmComparison: { dimensions } };
}
