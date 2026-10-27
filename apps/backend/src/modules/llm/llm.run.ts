import { cache, hashKey, LLM_CACHE_TTL_SECONDS } from "../../infrastructure/cache.js";
import { generateJSON, generateText, type GenerateOptions } from "./gemini.client.js";
import { aiCacheNamespace, aiModel, personalAiRuntime } from "../user-ai/user-ai.runtime.js";
import { platformAiRuntime, refreshPlatformAi } from "../user-ai/platform-ai.runtime.js";

export type LlmTask = "rerank" | "extract" | "chat" | "report" | "gap" | "judge" | "compare" | "directions" | "trend" | "summary" | "gap-closure-queries" | "gap-closure-screen" | "gap-refine";

interface CachedGenerateBase<T> {
  task: LlmTask;
  promptVersion: string;
  keyParts: unknown;
  inputHash?: string;
  ttlSeconds?: number;
  model?: string;
  bypassCache?: boolean;
  onCacheHit?: () => void | Promise<void>;
  onCacheMiss?: () => void | Promise<void>;
  validate?: (output: T) => T;
  generate: (model: string) => Promise<T>;
}

export function routeLlmModel(task: LlmTask, override?: string): string {
  if (personalAiRuntime()) return personalAiRuntime()!.model;
  if (override) return override;
  // aiModel falls back from the platform connection to the env defaults.
  return aiModel(task === "report" || task === "gap" || task === "gap-refine" || task === "trend" ? "deep" : "fast");
}

export function buildLlmCacheKey(args: {
  task: LlmTask;
  promptVersion: string;
  model: string;
  keyParts: unknown;
  inputHash?: string;
}): string {
  return `llm:${args.task}:${args.promptVersion}:${hashKey({
    ...(personalAiRuntime() || platformAiRuntime() ? { providerScope: aiCacheNamespace() } : {}),
    model: args.model,
    keyParts: args.keyParts,
    inputHash: args.inputHash ?? null,
  })}`;
}

export async function cachedGenerate<T>(args: CachedGenerateBase<T>): Promise<T> {
  await refreshPlatformAi();
  const model = routeLlmModel(args.task, args.model);
  const cacheKey = buildLlmCacheKey({
    task: args.task,
    promptVersion: args.promptVersion,
    model,
    keyParts: args.keyParts,
    inputHash: args.inputHash,
  });

  if (!args.bypassCache) {
    const cached = await cache.get<T>(cacheKey);
    if (cached !== null) {
      if (args.validate) {
        try {
          const validated = args.validate(cached);
          await args.onCacheHit?.();
          return validated;
        } catch {
          await cache.del(cacheKey);
        }
      } else {
      await args.onCacheHit?.();
      return cached;
      }
    }
  }
  await args.onCacheMiss?.();

  const output = args.validate ? args.validate(await args.generate(model)) : await args.generate(model);
  await cache.set(cacheKey, output, args.ttlSeconds ?? LLM_CACHE_TTL_SECONDS);
  return output;
}

export async function cachedGenerateJSON<T>(
  args: Omit<CachedGenerateBase<T>, "generate"> & {
    prompt: string;
    options?: Omit<GenerateOptions, "model">;
  },
): Promise<T> {
  return cachedGenerate<T>({
    ...args,
    inputHash: args.inputHash ?? hashKey({ prompt: args.prompt, system: args.options?.system ?? null }),
    generate: (model) =>
      generateJSON<T>(args.prompt, {
        ...args.options,
        model,
      }),
  });
}

export async function cachedGenerateText(
  args: Omit<CachedGenerateBase<string>, "generate"> & {
    prompt: string;
    options?: Omit<GenerateOptions, "model">;
  },
): Promise<string> {
  return cachedGenerate<string>({
    ...args,
    inputHash: args.inputHash ?? hashKey({ prompt: args.prompt, system: args.options?.system ?? null }),
    generate: (model) =>
      generateText(args.prompt, {
        ...args.options,
        model,
      }),
  });
}
