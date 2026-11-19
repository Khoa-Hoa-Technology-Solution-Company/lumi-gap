// Fresh disposable PostgreSQL only. Never migrates or seeds the application DB.
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
const backend = fileURLToPath(new URL("../", import.meta.url));
const values = { ...process.env };
expand({ ...config({ path: resolve(backend, "../../.env"), processEnv: values, quiet: true }), processEnv: values });
const original = new URL(values.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(original.hostname)) throw new Error("Local PostgreSQL required");
const name = `codex_manuscript_templates_${randomBytes(6).toString("hex")}_test`;
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const testUrl = new URL(original); testUrl.pathname = `/${name}`;
const env = { ...values, DATABASE_URL: testUrl.href, NODE_ENV: "test", MANUSCRIPT_TEMPLATE_INTEGRATION: "1", EMAIL_DELIVERY_MODE: "disabled", LOG_LEVEL: "error" };
async function query(sql) {
  const client = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
  try { await client.connect(); await client.query(sql); } finally { await client.end(); }
}
async function run(args) {
  const child = spawn(process.execPath, args, { cwd: backend, env, shell: false, windowsHide: true, stdio: "inherit" });
  await new Promise((ok, fail) => { child.on("error", fail); child.on("exit", code => code === 0 ? ok() : fail(new Error(`Test command failed (${code})`))); });
}
let created = false;
try {
  await query(`CREATE DATABASE "${name}"`); created = true;
  await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
  await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/workspaces/__tests__/manuscript-template.persistence.test.ts", ...(process.argv.includes("--regression") ? ["src/modules/workspaces/__tests__/manuscripts.persistence.test.ts"] : []), "--maxWorkers=1", "--minWorkers=1", "--testTimeout=60000", "--hookTimeout=60000"]);
} finally {
  if (created && /^codex_manuscript_templates_[a-f0-9]{12}_test$/.test(name) && original.pathname !== `/${name}`) await query(`DROP DATABASE "${name}" WITH (FORCE)`);
}
