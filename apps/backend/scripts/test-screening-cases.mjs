import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const backend = fileURLToPath(new URL("../", import.meta.url));
const local = { ...process.env };
expand({ ...config({ path: `${root}/.env`, processEnv: local }), processEnv: local });
const original = new URL(local.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("Screening case tests require local PostgreSQL");
const database = "lumigap_evidence_workspace_test";
if (original.pathname === `/${database}`) throw new Error("Provide the application URL; this runner derives its isolated test URL");
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10000, query_timeout: 20000 });
try {
  await admin.connect();
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) await admin.query('CREATE DATABASE "lumigap_evidence_workspace_test"');
} finally { await admin.end(); }
const testUrl = new URL(original); testUrl.pathname = `/${database}`;
const env = { ...local, DATABASE_URL: testUrl.toString(), NODE_ENV: "test", SCREENING_INTEGRATION: "1", RATE_LIMIT_STORE: "memory", EMAIL_DELIVERY_MODE: "disabled" };
async function run(args) {
  const child = spawn(process.execPath, args, { cwd: backend, env, stdio: "inherit", shell: false, windowsHide: true });
  await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Screening case test command failed (${code})`))); });
}
await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
// Targeted reruns share the same isolated database and disabled delivery policy.
const namePattern = process.argv.find(arg => arg.startsWith("--testNamePattern="));
const slowMachine = process.argv.includes("--slow");
await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/projects/__tests__/screening-case.persistence.test.ts", ...(process.argv.includes("--tasks") ? ["src/modules/projects/__tests__/screening-slots.persistence.test.ts"] : []), ...(process.argv.includes("--regression") ? ["src/modules/projects/__tests__/screening.persistence.test.ts", "src/modules/projects/__tests__/screening-slots.persistence.test.ts", "src/modules/projects/__tests__/evidence-workspace.persistence.test.ts", "src/modules/projects/__tests__/research-synthesis.persistence.test.ts", "src/modules/projects/__tests__/collaborative-research.persistence.test.ts"] : []), ...namePattern ? [namePattern] : [], ...slowMachine ? ["--testTimeout=60000"] : [], "--maxWorkers=1", "--minWorkers=1"]);
