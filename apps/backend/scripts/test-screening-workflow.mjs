import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import process from "node:process";

// Never migrate the developer's application database or print credentials.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const backend = fileURLToPath(new URL("../", import.meta.url));
const isolatedEnv = { ...process.env };
expand({ ...config({ path: `${root}/.env`, processEnv: isolatedEnv }), processEnv: isolatedEnv });
const original = new URL(isolatedEnv.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("This runner requires local PostgreSQL");
const database = "lumigap_screening_workflow_v3_test";
if (original.pathname === `/${database}`) throw new Error("Provide the local application URL; this runner derives its own test database");
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10000, query_timeout: 20000 });
try {
  await admin.connect();
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) {
    await admin.query('CREATE DATABASE "lumigap_screening_workflow_v3_test"');
  }
} finally { await admin.end(); }
const testUrl = new URL(original); testUrl.pathname = `/${database}`;
const env = { ...isolatedEnv, DATABASE_URL: testUrl.toString(), NODE_ENV: "test", SCREENING_INTEGRATION: "1", RATE_LIMIT_STORE: "memory", EMAIL_DELIVERY_MODE: "disabled" };
async function run(args) {
  const process = spawn(globalThis.process.execPath, args, { cwd: backend, env, stdio: "inherit", shell: false });
  await new Promise((resolve, reject) => { process.on("error", reject); process.on("exit", code => code === 0 ? resolve() : reject(new Error(`Test command failed (${code})`))); });
}
await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/projects/__tests__/screening.persistence.test.ts", "src/modules/projects/__tests__/screening.calculator.test.ts", ...(process.argv.includes("--regression") ? ["src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts", "src/modules/projects/__tests__/collaborative-research.persistence.test.ts"] : []), "--maxWorkers=1", "--minWorkers=1"]);
