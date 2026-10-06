import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { aiModel, personalAiRuntime } from "../user-ai/user-ai.runtime.js";
import { personalGenerate, personalOpenAiTools } from "../user-ai/personal-ai.client.js";

/**
 * Thin singleton wrapper around the Google GenAI SDK.
 *
 * Use `GEMINI_MODEL_FAST` for high-volume cheap calls (summary, scoring) and
 * `GEMINI_MODEL_DEEP` for low-volume high-quality calls (report, gap analysis).
 *
 * Always go through `generateText` / `generateJSON` so retries, logging, and
 * future cost tracking live in one place.
 */
const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { baseUrl: env.GEMINI_BASE_URL } });

function exhaustedQuota(error: unknown, model: string): LlmQuotaError | undefined {
  const providerError = (error ?? {}) as { status?: number; message?: string };
  if (providerError.status !== 429) return undefined;
  try {
    const body = JSON.parse(providerError.message ?? "") as {
      error?: { details?: Array<{ retryDelay?: string; violations?: Array<{ quotaId?: string; quotaValue?: string }> }> };
    };
    const details = body.error?.details ?? [];
    const violations = details.flatMap((detail) => detail.violations ?? []);
    const zeroQuota = violations.some((violation) => violation.quotaValue === "0");
    const dailyQuota = violations.some((violation) => /PerDay|Daily|PerMonth/i.test(violation.quotaId ?? ""));
    if (!zeroQuota && !dailyQuota) return undefined;
    const seconds = Number.parseFloat(details.find((detail) => detail.retryDelay)?.retryDelay ?? "");
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` (about ${Math.ceil(seconds / 3600)} hours)` : "";
    return new LlmQuotaError(zeroQuota
      ? `Gemini quota is unavailable for ${model}. Configure an API key from a project with available quota or enable billing.`
      : `Gemini daily or monthly quota is exhausted for ${model}. Retry after the quota resets${wait}, or configure an API key from a project with available quota.`);
  } catch { return undefined; }
}

/** Quota that cannot recover during this job; safe to display in HTTP and index errors. */
export class LlmQuotaError extends AppError {
  readonly nonRetryable = true;
  constructor(message: string) {
    super(429, "LLM_QUOTA_EXHAUSTED", message);
    this.name = "LlmQuotaError";
  }
}

function generationRetryDelay(error: unknown, attempt: number): number | undefined {
  const providerError = (error ?? {}) as { status?: number; message?: string; retryDelayMs?: number; nonRetryable?: boolean };
  if (providerError.nonRetryable) return undefined;
  const backoff = 1000 * 2 ** attempt;
  if (providerError.status === 503) return backoff;
  if (providerError.status !== 429) return undefined;
  if (providerError.retryDelayMs !== undefined) return Math.max(backoff, providerError.retryDelayMs);
  // A per-minute limit can recover within a request; a daily/zero quota cannot.
  try {
    const body = JSON.parse(providerError.message ?? "") as {
      error?: { details?: Array<{ retryDelay?: string; violations?: Array<{ quotaId?: string; quotaValue?: string }> }> };
    };
    const details = body.error?.details ?? [];
    const violations = details.flatMap((detail) => detail.violations ?? []);
    if (violations.some((violation) => /PerDay|Daily|PerMonth/i.test(violation.quotaId ?? "") || violation.quotaValue === "0")) return undefined;
    if (violations.some((violation) => /PerMinute|PerSecond/i.test(violation.quotaId ?? ""))) {
      const retrySeconds = Number.parseFloat(details.find((detail) => detail.retryDelay)?.retryDelay ?? "");
      if (!Number.isFinite(retrySeconds)) return undefined;
      const delay = Math.ceil(retrySeconds * 1000) + 1000;
      return delay <= 60000 ? Math.max(backoff, delay) : undefined;
    }
  } catch { /* Older provider errors may contain only a message. */ }
  const message = String(providerError.message ?? error).toLowerCase();
  return /quota exceeded|exceeded your current quota|free_tier_requests|resource_exhausted/.test(message) ? undefined : backoff;
}

export interface GenerateOptions {
  /** Override the default model. Default: GEMINI_MODEL_FAST. */
  model?: string;
  /** System instruction prepended to the prompt. */
  system?: string;
  /** 0..2 — lower = deterministic. Default 0.4. */
  temperature?: number;
  /** Max output tokens. Default 1024. */
  maxOutputTokens?: number;
}

/**
 * Thrown when generation stops because the output hit maxOutputTokens.
 * Retrying with the same budget can never succeed — callers (BullMQ workers)
 * should treat this as non-retryable and fail fast instead of burning quota.
 */
export class LlmTruncationError extends Error {
  readonly nonRetryable = true;
  constructor(model: string, maxOutputTokens: number) {
    super(`Gemini output truncated at MAX_TOKENS (model=${model}, budget=${maxOutputTokens})`);
    this.name = "LlmTruncationError";
  }
}

/**
 * Thrown when the model returns content that is structurally invalid and will
 * not self-heal on retry — unparseable JSON, malformed report shape, or an
 * out-of-range citation. Marked non-retryable so BullMQ workers fail fast
 * instead of burning 5× the (paid, rate-limited) Gemini quota on a hopeless retry.
 */
export class LlmContentError extends Error {
  readonly nonRetryable = true;
  constructor(message: string) {
    super(message);
    this.name = "LlmContentError";
  }
}

export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const personal = personalAiRuntime();
  const model = personal?.model ?? opts.model ?? aiModel();
  const maxOutputTokens = opts.maxOutputTokens ?? 1024;
  const t0 = Date.now();
  try {
    const request = {
      model,
      contents: prompt,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens,
        httpOptions: { timeout: 60000 },
      },
    };
    const result = await (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return personal ? await personalGenerate(personal, prompt, { ...opts, maxOutputTokens }) : await client.models.generateContent(request);
        } catch (error) {
          const quotaError = exhaustedQuota(error, model);
          if (quotaError) throw quotaError;
          const delayMs = generationRetryDelay(error, attempt);
          if (attempt >= 2 || delayMs === undefined) throw error;
          logger.warn({ model, attempt: attempt + 1, delayMs }, "gemini temporarily unavailable; retrying");
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    })();
    // result.text silently returns the PARTIAL text when the model ran out of
    // output budget — detect and fail fast rather than hand back broken JSON.
    const finishReason = String(result.candidates?.[0]?.finishReason ?? "");
    if (finishReason === "MAX_TOKENS") {
      logger.error({ model, maxOutputTokens }, "gemini output truncated at MAX_TOKENS");
      throw new LlmTruncationError(model, maxOutputTokens);
    }
    const text = result.text ?? "";
    logger.debug({ model, ms: Date.now() - t0, chars: text.length }, "gemini.text");
    return text;
  } catch (err) {
    if (!(err instanceof LlmTruncationError)) logger.error({ err, model }, "gemini.text failed");
    throw err;
  }
}

/** Generate and parse JSON. Adds an explicit instruction to return JSON only. */
export async function generateJSON<T = unknown>(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<T> {
  const raw = await generateText(prompt, {
    ...opts,
    system: [
      opts.system ?? "",
      "Return ONLY valid JSON. No markdown fences, no commentary.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  try {
    return JSON.parse(stripJsonFence(raw)) as T;
  } catch {
    // Non-JSON output won't become valid by retrying the same call — fail fast.
    throw new LlmContentError("LLM returned non-JSON output");
  }
}

function stripJsonFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

/**
 * Multi-turn function-calling loop.
 * Returns final text from Gemini after it finishes calling tools.
 * Throws LlmTruncationError (nonRetryable) if maxTurns exceeded.
 */
export async function generateWithTools(
  prompt: string,
  tools: ReadonlyArray<{ name: string; description: string; parameters: object }>,
  executor: (call: { name: string; args: Record<string, unknown> }) => Promise<unknown>,
  opts: GenerateOptions & { maxTurns?: number } = {},
): Promise<string> {
  const personal = personalAiRuntime();
  const model = personal?.model ?? opts.model ?? aiModel("deep");
  const maxOutputTokens = opts.maxOutputTokens ?? env.DEEP_ANALYSIS_MAX_OUTPUT_TOKENS;
  const maxTurns = opts.maxTurns ?? env.DEEP_ANALYSIS_MAX_TURNS;

  if (personal?.provider === "openai-compatible") {
    const result = await personalOpenAiTools(personal, prompt, tools, executor, { ...opts, maxOutputTokens }, maxTurns);
    if (result.truncated) throw new LlmTruncationError(model, maxOutputTokens);
    return result.text;
  }

  type Part = { text?: string; functionCall?: unknown; functionResponse?: unknown };
  type Turn = { role: string; parts: Part[] };

  const history: Turn[] = [{ role: "user", parts: [{ text: prompt }] }];

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = personal ? await personalGenerate(personal, history, { ...opts, maxOutputTokens }, tools) : await client.models.generateContent({
      model,
      contents: history as unknown as Parameters<typeof client.models.generateContent>[0]["contents"],
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens,
        tools: [{ functionDeclarations: tools as unknown as object[] }],
      },
    });

    const finishReason = String(result.candidates?.[0]?.finishReason ?? "");
    if (finishReason === "MAX_TOKENS") {
      logger.error({ model, maxOutputTokens, turn }, "gemini output truncated (deepAnalysis)");
      throw new LlmTruncationError(model, maxOutputTokens);
    }

    const parts = (result.candidates?.[0]?.content?.parts ?? []) as Part[];
    const fnCalls = parts.filter((p) => p.functionCall);
    const textContent = parts.filter((p) => p.text).map((p) => p.text as string).join("");

    history.push({ role: "model", parts });

    if (fnCalls.length === 0) {
      logger.debug({ model, turns: turn + 1, chars: textContent.length }, "gemini.tools done");
      return textContent;
    }

    const toolResults = await Promise.all(
      fnCalls.map(async (p) => {
        const fc = p.functionCall as { name: string; args?: Record<string, unknown> };
        const output = await executor({ name: fc.name, args: fc.args ?? {} });
        return { name: fc.name, response: { output } };
      }),
    );

    history.push({
      role: "user",
      parts: toolResults.map((r) => ({ functionResponse: r })),
    });
  }

  logger.error({ model, maxTurns }, "generateWithTools: maxTurns exhausted");
  throw new LlmTruncationError(model, maxOutputTokens);
}

export { client as geminiClient };
