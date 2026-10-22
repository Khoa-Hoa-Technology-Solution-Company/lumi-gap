// P2.0 preflight for the second full run (read-only; one free /rate-limit call).
// Usage: node p2_0_preflight.mjs <path/to/.env> <first-run snapshot.json>
// Exit code 0 = all checks pass; 1 = do not run. Never prints the key.
import { readFileSync } from "node:fs";

const [envPath, snapshotPath] = process.argv.slice(2);
const EXPECTED_CREDITS = 335; // 310 measured on 2026-10-22 + 23 /topics pages + 2 year counts
const DAILY_CAP_FRACTION = 0.3; // approved plan: at most 30% of the daily quota
const MIN_HOURS = 24;

const line = readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENALEX_API_KEY="));
const key = line?.slice(17).replace(/^["']|["']$/g, "").trim();
const first = JSON.parse(readFileSync(snapshotPath, "utf8"));
const hours = (Date.now() - new Date(first.finishedAt).getTime()) / 3_600_000;

const checks = { keyConfigured: Boolean(key), keyLength: key?.length ?? 0, hoursSinceFirstRun: Number(hours.toFixed(2)), firstRunFinishedAt: first.finishedAt };
if (key) {
  const res = await fetch("https://api.openalex.org/rate-limit", { headers: { Authorization: `Bearer ${key}` } });
  const r = (await res.json())?.rate_limit ?? {};
  Object.assign(checks, { rateLimitStatus: res.status, creditsLimit: r.credits_limit, creditsUsedToday: r.credits_used, creditsRemaining: r.credits_remaining, resetsAt: r.resets_at });
}
const cap = (checks.creditsLimit ?? 0) * DAILY_CAP_FRACTION;
const verdicts = {
  keyWorks: checks.rateLimitStatus === 200,
  atLeast24h: hours >= MIN_HOURS,
  runFitsInRemaining: (checks.creditsRemaining ?? 0) - EXPECTED_CREDITS >= (checks.creditsLimit ?? Infinity) * 0.5,
  runCostWithin30PctCap: EXPECTED_CREDITS <= cap,
  todayTotalWithin30PctCap: (checks.creditsUsedToday ?? Infinity) + EXPECTED_CREDITS <= cap,
};
const ok = Object.values(verdicts).every(Boolean);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), expectedCredits: EXPECTED_CREDITS, capCredits: cap, ...checks, verdicts, ok }, null, 1));
process.exit(ok ? 0 : 1);
