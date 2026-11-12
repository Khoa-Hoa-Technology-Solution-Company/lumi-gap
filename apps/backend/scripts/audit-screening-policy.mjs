import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { Client } from "pg";
import { fileURLToPath } from "node:url";

// Read-only aggregate audit. No tokens, email addresses, review text or credentials.
const isolatedEnv = { ...process.env };
expand({ ...config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), processEnv: isolatedEnv, quiet: true }), processEnv: isolatedEnv });
const db = new Client({ connectionString: isolatedEnv.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 20000 });
try {
  await db.connect();
  await db.query("BEGIN READ ONLY");
  const { rows: rounds } = await db.query(`SELECT r.settings->>'reviewMode' AS mode,
    r.settings->>'requiredReviewers' AS required, r.settings->>'workflowVersion' AS workflow_version, r.phase, r.status,
    count(a.id) FILTER (WHERE a.active) AS assigned,
    count(a.id) FILTER (WHERE a.active AND a.submitted_at IS NOT NULL) AS submitted,
    count(a.id) FILTER (WHERE a.active AND a.submitted_at IS NULL AND a.due_at <= now()) AS expired
    FROM screening_rounds r LEFT JOIN screening_assignments a ON a.round_id = r.id
    WHERE r.active GROUP BY r.id`);
  const cohorts = new Map();
  for (const r of rounds) {
    const key = JSON.stringify(r); cohorts.set(key, (cohorts.get(key) ?? 0) + 1);
  }
  const { rows: settings } = await db.query("SELECT review_mode, required_reviewers, count(*)::int AS projects FROM screening_settings GROUP BY review_mode, required_reviewers");
  const { rows: [preserved] } = await db.query(`SELECT
    (SELECT count(*)::int FROM screening_assignments) AS assignments,
    (SELECT count(*)::int FROM screening_reviews) AS reviews,
    (SELECT count(*)::int FROM screening_final_decisions) AS decisions`);
  console.log(JSON.stringify({ activeRounds: rounds.length, preserved, cohorts: [...cohorts].map(([key, count]) => ({ ...JSON.parse(key), count })), settings }, null, 2));
  await db.query("ROLLBACK");
} finally { await db.end(); }
