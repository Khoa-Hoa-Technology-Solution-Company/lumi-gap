import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/config and dist/config have the same depth. Never depend on shell cwd.
export const backendRoot = fileURLToPath(new URL("../../", import.meta.url));
export const repoRoot = resolve(backendRoot, "../..");

export function loadRootEnv(path = resolve(repoRoot, ".env"), processEnv = process.env) {
  // A missing file is expected in containers: Compose/Jenkins inject the env.
  // Existing process variables always take precedence over the local template.
  // dotenv's dictionary type omits undefined, unlike NodeJS.ProcessEnv.
  const targetEnv = processEnv as Record<string, string>;
  const result = config({ path, processEnv: targetEnv });
  if (result.error && (result.error as NodeJS.ErrnoException).code !== "ENOENT") throw result.error;
  return expand({ ...result, processEnv: targetEnv });
}

loadRootEnv();
