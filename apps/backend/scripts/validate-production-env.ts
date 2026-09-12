import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { validateProductionEnvironment, type ProductionEnvironment } from "../src/config/production-env-validator.js";

const args = process.argv.slice(2);
const useProcessEnvironment = args.includes("--process-env");
const explicitPath = args.find((arg) => !arg.startsWith("--"));
const defaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.production");

function loadEnvironment(): { values: ProductionEnvironment; duplicateKeys: string[]; source: string } {
  if (useProcessEnvironment) {
    return { values: process.env, duplicateKeys: [], source: "process environment" };
  }

  const envPath = path.resolve(explicitPath ?? defaultPath);
  if (!fs.existsSync(envPath)) {
    throw new Error(`production environment file not found: ${envPath}`);
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const seen = new Set<string>();
  const duplicateKeys = raw
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1])
    .filter((key): key is string => Boolean(key))
    .filter((key) => {
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });

  return { values: parse(raw), duplicateKeys: [...new Set(duplicateKeys)], source: envPath };
}

try {
  const { values, duplicateKeys, source } = loadEnvironment();
  const errors = validateProductionEnvironment(values);
  for (const key of duplicateKeys) errors.push(`${key} is declared more than once`);

  if (errors.length > 0) {
    console.error(`Production environment validation failed (${source}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Production environment is valid (${source}). No secret values were printed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to validate production environment");
  process.exit(1);
}
