import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Forward-only migrations run exclusively against this dedicated local test database.
const backend = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const values = { ...process.env };
const flag = process.argv.indexOf("--env-file");
const envFile = flag >= 0 ? process.argv[flag + 1] : resolve(root, ".env");
if (!envFile) throw new Error("--env-file requires a local environment file");
expand({ ...config({ path: envFile, processEnv: values, quiet: true }), processEnv: values });
const original = new URL(values.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("Only local PostgreSQL is allowed");
const database = `lumigap_screening_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
if (original.pathname === `/${database}`) throw new Error("Provide the application URL; the runner derives its isolated database");
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
try {
  await admin.connect();
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) await admin.query(`CREATE DATABASE "${database}"`);
} finally { await admin.end(); }
const testUrl = new URL(original); testUrl.pathname = `/${database}`;
const env = { ...values, DATABASE_URL: testUrl.href, NODE_ENV: "test", SCREENING_INTEGRATION: "1", RATE_LIMIT_STORE: "memory", EMAIL_DELIVERY_MODE: "disabled", LOG_LEVEL: "error", VITE_API_BASE: "/api/v1", SCREENING_BROWSER: process.argv.includes("--browser") ? "1" : "0" };
async function run(args) {
  const child = spawn(process.execPath, args, { cwd: backend, env, stdio: "inherit", shell: false, windowsHide: true });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Verification failed (${code})`))); });
}
try {
await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/projects/__tests__/screening-consensus.persistence.test.ts", "src/modules/projects/__tests__/screening.calculator.test.ts", "src/modules/projects/__tests__/screening-events.test.ts", "src/modules/projects/__tests__/screening-queue.persistence.test.ts", "src/modules/projects/__tests__/screening-rescreening.persistence.test.ts", ...(process.argv.includes("--browser") ? ["--testNamePattern=browser:"] : process.argv.filter(arg => arg.startsWith("--testNamePattern="))), "--testTimeout=60000", "--maxWorkers=1", "--minWorkers=1"]);

} finally {
  if (!/^lumigap_screening_[a-f0-9]{12}_test$/.test(database)) throw new Error("Unsafe test database name");
  const cleanup = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
  try { await cleanup.connect(); await cleanup.query(`DROP DATABASE "${database}" WITH (FORCE)`); }
  finally { await cleanup.end(); }
}
