// Local-only, narrowly scoped migration. Never repairs or replays unrelated history.
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import { spawn } from "node:child_process";
import process from "node:process";

const backend = fileURLToPath(new URL("../", import.meta.url));
const values = { ...process.env };
expand({ ...config({ path: resolve(backend, "../../.env"), processEnv: values, quiet: true }), processEnv: values });
const url = new URL(values.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || ["/postgres", "/template0", "/template1"].includes(url.pathname)) throw new Error("Only a local application/test database is allowed");
const name = "20261117170000_simple_mentor_invitations";
const source = await readFile(resolve(backend, "prisma/migrations", name, "migration.sql"));
const hash = value => createHash("sha256").update(value).digest("hex");
const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000 });
await db.connect();
async function fingerprints(table) {
  // Fixed whitelist only. Do not accept a caller-provided table/SQL expression.
  if (!["mentorship_requests", "mentor_relationships", "mentorship_drafts"].includes(table)) throw new Error("Invalid table");
  const result = await db.query(`SELECT id, to_jsonb(r)::text AS content FROM ${table} r ORDER BY id`);
  return new Map(result.rows.map(r => [r.id, hash(r.content)]));
}
try {
  const records = await db.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at,id");
  const existing = records.rows.find(r => r.migration_name === name && r.finished_at && !r.rolled_back_at);
  if (existing) { if (existing.checksum !== hash(source)) throw new Error("Applied migration checksum differs; no repair attempted"); console.log(JSON.stringify({ migration: name, alreadyApplied: true })); }
  else {
    const unfinished = await db.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL");
    if (unfinished.rows[0].n) throw new Error("Resolve unfinished migrations with the team before applying this change");
    const required = ["mentorship_requests_role_check", "mentor_relationships_role_check", "mentor_candidates_mentor_role_check", "mentorship_drafts_mentor_role_check"];
    const checks = await db.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname=ANY($1::text[])", [required]);
    if (checks.rows.length !== required.length) throw new Error("Unexpected local schema; no migration was applied");
    if (!process.argv.includes("--apply")) console.log(JSON.stringify({ migration: name, preflight: "passed", mode: "read-only", unrelatedMigrations: "will not be replayed", instruction: "Use --apply only for this local database" }));
    else {
      const tables = ["mentorship_requests", "mentor_relationships", "mentorship_drafts"], before = await Promise.all(tables.map(fingerprints));
      const directory = resolve(backend, ".cache", `simple-mentor-migration-${randomUUID()}`), migrations = resolve(directory, "migrations");
      await mkdir(resolve(migrations, name), { recursive: true });
      await writeFile(resolve(migrations, name, "migration.sql"), source);
      await writeFile(resolve(migrations, "migration_lock.toml"), 'provider = "postgresql"\n');
      const configPath = resolve(directory, "prisma.config.ts");
      await writeFile(configPath, `import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:${JSON.stringify(resolve(backend, "prisma"))},migrations:{path:${JSON.stringify(migrations)}},datasource:{url:process.env.DATABASE_URL ?? ""}});\n`);
      const child = spawn(process.execPath, [resolve(backend, "../../node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", configPath], { cwd: backend, env: values, shell: false, windowsHide: true, stdio: "inherit" });
      await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Scoped local migration failed (${code}); no automatic repair attempted`))); });
      const after = await Promise.all(tables.map(fingerprints));
      const historicalRowsUnchanged = before.every((map, i) => [...map].every(([id, digest]) => after[i].get(id) === digest));
      const historyAfter = await db.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name<>$1 ORDER BY started_at,id", [name]);
      const priorMigrationHistoryUnchanged = JSON.stringify(records.rows) === JSON.stringify(historyAfter.rows);
      console.log(JSON.stringify({ migration: name, applied: true, historicalRowsChecked: before.reduce((n, m) => n + m.size, 0), historicalRowsUnchanged, priorMigrationHistoryUnchanged }));
      if (!historicalRowsUnchanged || !priorMigrationHistoryUnchanged) throw new Error("Concurrent historical changes detected; inspect before continuing. No data repair was attempted.");
    }
  }
} finally { await db.end(); }
