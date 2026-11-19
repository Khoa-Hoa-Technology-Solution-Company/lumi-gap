import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer } from "node:http";
const backend = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const values = { ...process.env }, flag = process.argv.indexOf("--env-file");
const envFile = flag >= 0 ? process.argv[flag + 1] : resolve(root, ".env");
if (!envFile) throw new Error("--env-file requires a local path");
expand({ ...config({ path: envFile, processEnv: values, quiet: true }), processEnv: values });
const original = new URL(values.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("Local PostgreSQL is required");
const database = "codex_mentorship_1a6e9c202611_test";
if (original.pathname === `/${database}`) throw new Error("Provide the application URL; the test URL is derived separately");
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 10000 });
try { await admin.connect(); if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [database])).rowCount) await admin.query('CREATE DATABASE "codex_mentorship_1a6e9c202611_test"'); }
finally { await admin.end(); }
const testUrl = new URL(original); testUrl.pathname = `/${database}`;
const env = { ...values, DATABASE_URL: testUrl.href, NODE_ENV: "test", MANUSCRIPT_INTEGRITY_INTEGRATION: "1", MANUSCRIPT_COMPILER_INTEGRATION: "1", RATE_LIMIT_STORE: "memory", EMAIL_DELIVERY_MODE: "disabled", LOG_LEVEL: "error" };
// Optional loopback-only bridge to the already-running isolated compiler. No new container or image.
// Request data and its internal header travel over stdin, never shell arguments or logs.
let bridge;
if (process.argv.includes("--compiler-via-docker")) {
  const python = "import sys,json,urllib.request\np=json.load(sys.stdin)\nr=urllib.request.Request('http://127.0.0.1:8020/compile',data=p['body'].encode(),headers={'Content-Type':'application/json','X-Internal-Key':p['key']},method='POST')\ntry:\n with urllib.request.urlopen(r,timeout=75) as v: sys.stdout.buffer.write(v.read(31000001))\nexcept Exception:\n sys.exit(1)";
  bridge = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/compile") { res.writeHead(404).end(); return; }
    if (!values.INTERNAL_SERVICE_KEY || req.headers["x-internal-key"] !== values.INTERNAL_SERVICE_KEY) { res.writeHead(401).end(); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 30000000) throw new Error("Compile input limit exceeded"); chunks.push(chunk); }
      const child = spawn("docker", ["exec", "-i", "lumi-gap-manuscript-compiler-1", "python3", "-c", python], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"], timeout: 80000 });
      const output = []; let length = 0;
      child.stdout.on("data", chunk => { length += chunk.length; if (length > 31000000) child.kill(); else output.push(chunk); });
      const finished = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 && length <= 31000000 ? resolve() : reject(new Error("Isolated compiler unavailable"))); });
      child.stdin.on("error", () => {}); child.stdin.end(JSON.stringify({ body: Buffer.concat(chunks).toString("utf8"), key: values.INTERNAL_SERVICE_KEY }));
      await finished; res.writeHead(200, { "Content-Type": "application/json" }).end(Buffer.concat(output));
    } catch { res.writeHead(503).end("Isolated compiler unavailable"); }
  });
  await new Promise(resolve => bridge.listen(0, "127.0.0.1", resolve));
  env.MANUSCRIPT_COMPILER_URL = `http://127.0.0.1:${bridge.address().port}`;
}
async function run(args) {
  const child = spawn(process.execPath, args, { cwd: backend, env, stdio: "inherit", shell: false, windowsHide: true });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Verification failed (${code})`))); });
}
try {
  await run(["../../node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]);
  await run(["../../node_modules/vitest/vitest.mjs", "run", "src/modules/workspaces/__tests__/integrity-citations.test.ts", "src/modules/workspaces/__tests__/manuscript-integrity.persistence.test.ts", "src/modules/workspaces/__tests__/manuscripts.persistence.test.ts", "src/modules/workspaces/__tests__/manuscript-ai.persistence.test.ts", "--maxWorkers=1", "--minWorkers=1"]);
} finally { if (bridge) { bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve)); } }
