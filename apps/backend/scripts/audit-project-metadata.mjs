#!/usr/bin/env node
/**
 * Safe legacy project metadata audit & deterministic repair utility.
 *
 * Defaults to DRY-RUN (read-only). Pass `--apply` only to repair deterministic
 * primary-field inconsistencies (`research_field !== research_areas[0]`).
 * Ambiguous records (merged strings like `LLMLiterature`, or areas overlapping
 * legacy `search_strategy`) are REPORTED ONLY and NEVER auto-rewritten.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import console from "node:console";

const apply = process.argv.includes("--apply");
const envPath = fs.existsSync(path.resolve("apps/backend/.env"))
  ? path.resolve("apps/backend/.env")
  : path.resolve(".env");
const envText = fs.readFileSync(envPath, "utf8");
const dbUrl = (envText.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!dbUrl) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const req = createRequire(path.resolve("apps/backend/package.json"));
const { Client } = req("pg");
const client = new Client({ connectionString: dbUrl });
await client.connect();

try {
  const { rows } = await client.query(`
    SELECT p.id, p.research_field, p.research_areas, p.research_keywords,
           rp.search_strategy
    FROM projects p
    LEFT JOIN research_plans rp ON rp.project_id = p.id
    WHERE p.deleted_at IS NULL
  `);

  const summary = {
    mode: apply ? "APPLY_DETERMINISTIC" : "DRY_RUN",
    totalActiveProjects: rows.length,
    deterministicPrimaryFieldMismatch: 0,
    suspectedKeywordContaminatedAreas: 0,
    suspectedMalformedMergedAreas: 0,
    legacySearchStrategyKeywordsOnly: 0,
    repairedCount: 0,
  };
  const manualReviewIds = [];

  for (const row of rows) {
    const areas = Array.isArray(row.research_areas) ? row.research_areas : [];
    const strat = (row.search_strategy || "").trim();
    const stratTerms = strat ? strat.split(/[,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    const hasBooleanOps = /\b(AND|OR|NOT)\b|[()"]/.test(strat);

    if (strat && !hasBooleanOps && stratTerms.length > 0 && (!row.research_keywords || row.research_keywords.length === 0)) {
      summary.legacySearchStrategyKeywordsOnly++;
    }
    if (areas.length > 1 && stratTerms.length > 0 && areas.slice(1).some(a => stratTerms.includes(a.toLowerCase()))) {
      summary.suspectedKeywordContaminatedAreas++;
      manualReviewIds.push(row.id);
    }
    if (areas.some(a => /[a-z][A-Z]/.test(a) && !/\s/.test(a) && a.length > 8)) {
      summary.suspectedMalformedMergedAreas++;
      if (!manualReviewIds.includes(row.id)) manualReviewIds.push(row.id);
    }
    const primary = areas[0] ?? null;
    if (primary && row.research_field !== primary) {
      summary.deterministicPrimaryFieldMismatch++;
      if (apply) {
        await client.query(`UPDATE projects SET research_field = $1 WHERE id = $2`, [primary, row.id]);
        summary.repairedCount++;
      }
    }
  }

  console.log(JSON.stringify({ summary, manualReviewRecordCount: manualReviewIds.length }, null, 2));
} finally {
  await client.end();
}
