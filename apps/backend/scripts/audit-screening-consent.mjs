import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const values = { ...process.env };
expand({ ...config({ path: resolve(root, ".env"), processEnv: values, quiet: true }), processEnv: values });
const url = new URL(values.DATABASE_URL);
if (!["localhost","127.0.0.1","[::1]"].includes(url.hostname)) throw new Error("Local read-only audit only");
const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000 });
try {
  await db.connect(); await db.query("BEGIN TRANSACTION READ ONLY");
  const migrations = (await db.query("SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name")).rows;
  const directory = resolve(root,"apps/backend/prisma/migrations"), names = (await readdir(directory,{withFileTypes:true})).filter(f=>f.isDirectory()).map(f=>f.name);
  const applied = migrations.filter(m=>m.finished_at && !m.rolled_back_at), changed = [], lineEndingOnly = [];
  for (const m of applied) {
    try { const sql = await readFile(resolve(directory,m.migration_name,"migration.sql"));
      const hash = value => createHash("sha256").update(value).digest("hex");
      if (hash(sql) !== m.checksum) {
        const lf = sql.toString("utf8").replaceAll("\r\n","\n");
        if ([hash(lf),hash(lf.replaceAll("\n","\r\n"))].includes(m.checksum)) lineEndingOnly.push(m.migration_name);
        else changed.push(m.migration_name);
      } }
    catch { changed.push(m.migration_name+" (missing source)"); }
  }
  const report = { readOnly: true, recordedAt: new Date().toISOString(), appliedMigrations: applied.length,
    pendingMigrations: names.filter(n=>!applied.some(m=>m.migration_name===n)), modifiedHistoricalMigrations: changed, lineEndingOnlyMigrations: lineEndingOnly,
    historicalTimeoutResults: (await db.query("SELECT decision, count(*)::int AS count FROM screening_final_decisions WHERE resolution_type = 'CONSENSUS_NOT_REACHED' GROUP BY decision")).rows,
    timeoutAuditCount: (await db.query("SELECT count(*)::int AS count FROM screening_audit WHERE type='CONSENSUS_EXPIRED'")).rows[0].count,
    overdueOpenDiscussions: (await db.query("SELECT count(*)::int AS count FROM screening_rounds WHERE active AND status IN ('CONSENSUS_REQUIRED','CONSENSUS_IN_PROGRESS') AND consensus_deadline <= now()")).rows[0].count,
    paperCount: (await db.query("SELECT count(*)::int AS count FROM papers")).rows[0].count,
    invariantViolations: (await db.query("SELECT project_id, paper_id, count(*)::int AS count FROM screening_rounds WHERE active GROUP BY project_id,paper_id HAVING count(*)>1")).rows };
  await db.query("ROLLBACK"); const output = resolve(root,"docs/audits/2026-11-22-screening-consent"); await mkdir(output,{recursive:true});
  await writeFile(resolve(output,"local-read-only-audit.json"),JSON.stringify(report,null,2)+"\n"); console.log(JSON.stringify(report,null,2));
} finally { await db.end(); }
