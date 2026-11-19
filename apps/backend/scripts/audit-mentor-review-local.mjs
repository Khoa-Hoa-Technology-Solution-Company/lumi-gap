// Read-only audit. Never reconciles migrations or changes application records.
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { URL } from "node:url";
import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";

const backend = fileURLToPath(new URL("../", import.meta.url));
const values = { ...process.env };
expand({ ...config({ path: resolve(backend, "../../.env"), processEnv: values, quiet: true }), processEnv: values });
if (!["localhost", "127.0.0.1"].includes(new URL(values.DATABASE_URL).hostname)) throw Error("Local PostgreSQL only");
const client = new Client({ connectionString: values.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
const rows = async (sql, parameters) => (await client.query(sql, parameters)).rows;
const identifier = value => `"${value.replaceAll('"', '""')}"`;
try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const migrationsPath = resolve(backend, "prisma/migrations");
  const folders = (await readdir(migrationsPath, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
  const migrations = await rows("SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at");
  const applied = migrations.filter(m => m.finished_at && !m.rolled_back_at);
  const checksumMismatches = [];
  const lineEndingDifferences = [];
  const referenceIndex = process.argv.indexOf("--reference-migrations");
  const referenceFolder = referenceIndex >= 0 ? resolve(process.argv[referenceIndex + 1]) : undefined;
  const referenceMatches = [];
  const historicalMatches = [];
  for (const migration of applied.filter(m => folders.includes(m.migration_name))) {
    const contents = await readFile(resolve(migrationsPath, migration.migration_name, "migration.sql"));
    const checksum = createHash("sha256").update(contents).digest("hex");
    if (checksum !== migration.checksum) {
      const lf = contents.toString("utf8").replaceAll("\r\n", "\n");
      const variants = [lf, lf.replaceAll("\n", "\r\n")];
      if (variants.some(text => createHash("sha256").update(text).digest("hex") === migration.checksum)) lineEndingDifferences.push(migration.migration_name);
      else checksumMismatches.push(migration.migration_name);
    }
  }
  if (referenceFolder) for (const migration of applied.filter(m => !folders.includes(m.migration_name) || checksumMismatches.includes(m.migration_name))) {
    let contents;
    try { contents = await readFile(resolve(referenceFolder, migration.migration_name, "migration.sql"), "utf8"); }
    catch (error) { if (error.code === "ENOENT") { referenceMatches.push({ name: migration.migration_name, found: false }); continue; } throw error; }
    const lf = contents.replaceAll("\r\n", "\n");
    referenceMatches.push({ name: migration.migration_name, found: true, matchesApplied: [contents, lf, lf.replaceAll("\n", "\r\n")].some(text => createHash("sha256").update(text).digest("hex") === migration.checksum) });
  }
  if (process.argv.includes("--git-history")) for (const name of checksumMismatches) {
    const path = `apps/backend/prisma/migrations/${name}/migration.sql`;
    const cwd = resolve(backend, "../..");
    const commits = execFileSync("git", ["log", "--all", "-n", "100", "--format=%H", "--", path], { cwd, encoding: "utf8", windowsHide: true }).trim().split("\n").filter(Boolean);
    const appliedChecksum = applied.find(m => m.migration_name === name).checksum;
    let match = null;
    for (const commit of commits) {
      const contents = execFileSync("git", ["show", `${commit}:${path}`], { cwd, encoding: "utf8", windowsHide: true });
      const lf = contents.replaceAll("\r\n", "\n");
      if ([contents, lf, lf.replaceAll("\n", "\r\n")].some(text => createHash("sha256").update(text).digest("hex") === appliedChecksum)) { match = commit; break; }
    }
    historicalMatches.push({ name, commitsChecked: commits.length, matchingCommit: match });
  }
  const duplicates = await rows("SELECT openalex_id, count(*)::int AS copies, min(created_at) AS first_created, max(created_at) AS last_created FROM papers WHERE openalex_id IS NOT NULL GROUP BY openalex_id HAVING count(*)>1 ORDER BY openalex_id");
  const foreignKeys = await rows(`SELECT ns.nspname AS schema, tab.relname AS table, attr.attname AS column
    FROM pg_constraint c JOIN pg_class tab ON tab.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=tab.relnamespace
    JOIN pg_attribute attr ON attr.attrelid=tab.oid AND attr.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='papers'::regclass AND cardinality(c.conkey)=1 ORDER BY tab.relname`);
  const duplicateReferences = [];
  for (const fk of foreignKeys) {
    const [count] = await rows(`SELECT count(*)::int AS count FROM ${identifier(fk.schema)}.${identifier(fk.table)} r JOIN papers p ON r.${identifier(fk.column)}=p.id WHERE p.openalex_id IN (SELECT openalex_id FROM papers WHERE openalex_id IS NOT NULL GROUP BY openalex_id HAVING count(*)>1)`);
    if (count.count) duplicateReferences.push({ ...fk, count: count.count });
  }
  const result = {
    generatedAt: new Date().toISOString(), readOnly: true,
    migrations: { checkedIn: folders.length, applied: applied.length,
      absentFromCheckout: applied.filter(m => !folders.includes(m.migration_name)).map(m => m.migration_name),
      pending: folders.filter(name => !applied.some(m => m.migration_name === name)), checksumMismatches, lineEndingDifferences,
      referenceMatches,
      historicalMatches,
      failed: migrations.filter(m => !m.finished_at && !m.rolled_back_at).map(m => m.migration_name),
      rolledBack: migrations.filter(m => m.rolled_back_at).map(m => m.migration_name) },
    reviewSchema: await rows("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='reviewer_assignments' AND column_name='mentor_access_id'"),
    relevantIndexes: await rows("SELECT indexname,indexdef FROM pg_indexes WHERE tablename IN ('papers','reviewer_assignments') AND (indexdef LIKE '%openalex_id%' OR indexdef LIKE '%mentor_access_id%')"),
    scopedGrantForeignKey: await rows("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='reviewer_assignments'::regclass AND conname='reviewer_assignments_mentor_access_id_fkey'"),
    pendingMigrationPreflight: {
      verifiedOrcidDuplicateGroups: (await rows("SELECT count(*)::int AS count FROM (SELECT identifier FROM academic_identity_links WHERE provider='ORCID' AND verification_status='PROVIDER_CONNECTED' AND identifier IS NOT NULL GROUP BY identifier HAVING count(*)>1) duplicates"))[0].count,
      verifiedOrcidIndexes: await rows("SELECT indexname,indexdef FROM pg_indexes WHERE tablename='academic_identity_links' AND indexdef LIKE '%ORCID%'"),
      screeningStatusConstraint: await rows("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='screening_rounds'::regclass AND conname='screening_rounds_status_check'"),
      screeningStatuses: await rows("SELECT status,count(*)::int AS count FROM screening_rounds GROUP BY status ORDER BY status"),
    },
    openalex: { duplicates, duplicateReferences },
    reviewData: (await rows(`SELECT
      (SELECT count(*)::int FROM review_requests WHERE origin='MENTOR_GUIDANCE') AS mentor_requests,
      (SELECT count(*)::int FROM reviewer_assignments WHERE mentor_access_id IS NOT NULL) AS scoped_grants,
      (SELECT count(*)::int FROM review_requests r LEFT JOIN reviewer_assignments a ON a.review_request_id=r.id WHERE r.origin='MENTOR_GUIDANCE' AND (a.id IS NULL OR a.submission_id<>r.submission_id OR a.artifact_revision_id<>r.artifact_revision_id)) AS mismatched_requests,
      (SELECT count(*)::int FROM human_reviews h JOIN submission_revisions v ON v.id=h.revision_id WHERE h.submission_id<>v.submission_id) AS mismatched_feedback,
      (SELECT count(*)::int FROM (SELECT submission_id,reviewer_id FROM reviewer_assignments WHERE status IN ('assigned','accepted') GROUP BY submission_id,reviewer_id HAVING count(*)>1) duplicates) AS duplicate_active_assignments,
      (SELECT count(*)::int FROM submission_revisions WHERE manuscript_snapshot_id IS NOT NULL AND (content_snapshot IS NULL OR content_snapshot LIKE '%Manuscript Snapshot%')) AS possibly_placeholder_snapshots`))[0],
  };
  await client.query("ROLLBACK");
  console.log(JSON.stringify(result, null, 2));
} finally { await client.end(); }
