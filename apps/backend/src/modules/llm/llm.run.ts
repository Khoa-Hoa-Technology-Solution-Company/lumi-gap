import { env } from "../../config/env.js";
import { cache, hashKey, LLM_CACHE_TTL_SECONDS } from "../../infrastructure/cache.js";
import { generateJSON, generateText, type GenerateOptions } from "./gemini.client.js";

export type LlmTask = "rerank" | "extract" | "chat" | "report" | "gap" | "judge" | "compare" | "directions" | "trend";

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
  if (override) return override;
  if (task === "report" || task === "gap" || task === "trend") return env.GEMINI_MODEL_DEEP;
  return env.GEMINI_MODEL_FAST;
}

export function buildLlmCacheKey(args: {
  task: LlmTask;
  promptVersion: string;
  model: string;
  keyParts: unknown;
  inputHash?: string;
}): string {
  return `llm:${args.task}:${args.promptVersion}:${hashKey({
    model: args.model,
    keyParts: args.keyParts,
    inputHash: args.inputHash ?? null,
  })}`;
}

export async function cachedGenerate<T>(args: CachedGenerateBase<T>): Promise<T> {
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
