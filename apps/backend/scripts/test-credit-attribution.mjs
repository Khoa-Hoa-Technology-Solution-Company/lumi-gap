import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { resolve } from "node:path";
const backend = fileURLToPath(new URL("../", import.meta.url)), values = { ...process.env };
const flag = process.argv.indexOf("--env-file");
expand({ ...config({ path: flag >= 0 ? process.argv[flag + 1] : resolve(backend, "../../.env"), processEnv: values, quiet: true }), processEnv: values });
const original = new URL(values.DATABASE_URL), database = "lumigap_credit_attribution_test";
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("Local PostgreSQL is required");
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
try { await admin.connect(); if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) await admin.query('CREATE DATABASE "lumigap_credit_attribution_test"'); } finally { await admin.end(); }
const url = new URL(original); url.pathname = `/${database}`;
const redis = new URL(values.REDIS_URL); if (!["localhost", "127.0.0.1"].includes(redis.hostname)) throw new Error("Local Redis is required"); redis.pathname = "/13";
const env = { ...values, DATABASE_URL: url.href, REDIS_URL: redis.href, NODE_ENV: "test", CREDIT_ATTRIBUTION_INTEGRATION: "1", EMAIL_DELIVERY_MODE: "disabled", RATE_LIMIT_STORE: "memory", LOG_LEVEL: "error" };
if (process.argv.includes("--extended")) env.MANUSCRIPT_INTEGRITY_INTEGRATION = "1";
async function run(args) {
  const child = spawn(process.execPath, args, { cwd: backend, env, windowsHide: true, shell: false, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Verification failed (${code})`))); });
}
await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/workspaces/__tests__/credit-attribution.persistence.test.ts", "src/modules/projects/__tests__/contribution-matrix.calculator.test.ts", "src/modules/projects/__tests__/contribution-matrix.workflow.test.ts", "src/modules/projects/__tests__/project-contribution.rules.test.ts", "src/modules/projects/__tests__/contributions-domain.test.ts", "--maxWorkers=1", "--minWorkers=1", "--testTimeout=60000"]);
if (process.argv.includes("--extended")) await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/workspaces/__tests__/manuscript-integrity.persistence.test.ts", "src/modules/projects/__tests__/research-trust-security.workflow.test.ts", "--maxWorkers=1", "--minWorkers=1", "--testTimeout=60000"]);
