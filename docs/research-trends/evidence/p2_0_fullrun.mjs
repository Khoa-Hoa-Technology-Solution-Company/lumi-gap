// P2.0 complete collection run (read-only): what a P2.1 worker would fetch for the default scope,
// 10 years × {topic, domain, field, subfield} group_by via cursor. Key only in the Authorization header.
import { readFileSync, writeFileSync } from "node:fs";

const [envPath, outPath] = process.argv.slice(2);
const MAX_REQUESTS = 500;
const MIN_REMAINING_FRACTION = 0.5;
const SCOPE = "type:article|review|preprint|conference-paper|book-chapter";
const key = readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENALEX_API_KEY=")).slice(17).replace(/^["']|["']$/g, "").trim();

const requests = [];
let stopped = null;
async function get(params) {
  if (stopped || requests.length >= MAX_REQUESTS) throw new Error(stopped ?? "request cap");
  const url = new URL("https://api.openalex.org/works");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) });
  const body = await res.json();
  const h = (n) => res.headers.get(n);
  requests.push({ status: res.status, ms: Date.now() - t0, credits: Number(h("x-ratelimit-credits-used")), usd: Number(h("x-ratelimit-cost-usd")), remaining: Number(h("x-ratelimit-remaining")), limit: Number(h("x-ratelimit-limit")) });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (Number(h("x-ratelimit-remaining")) / Number(h("x-ratelimit-limit")) < MIN_REMAINING_FRACTION) stopped = "budget below 50%";
  await new Promise((r) => setTimeout(r, 120));
  return body;
}

async function groups(filter, groupBy) {
  const out = {}; let cursor = "*", pages = 0;
  while (cursor) {
    const body = await get({ filter, group_by: groupBy, per_page: "200", cursor });
    pages++;
    for (const g of body.group_by) out[String(g.key).replace(/^https:\/\/openalex\.org\/((domains|fields|subfields)\/)?/, "")] = g.count;
    cursor = body.meta.next_cursor ?? null;
  }
  return { out, pages };
}

const started = new Date().toISOString();
const t0 = Date.now();
const snapshot = { topic: {}, domain: {}, field: {}, subfield: {} };
const pages = {};
let error = null;
try {
  for (let year = 2016; year <= 2025; year++) {
    const filter = `${SCOPE},publication_year:${year}`;
    for (const [level, groupBy] of [["topic", "primary_topic.id:include_unknown"], ["domain", "primary_topic.domain.id:include_unknown"], ["field", "primary_topic.field.id:include_unknown"], ["subfield", "primary_topic.subfield.id:include_unknown"]]) {
      const r = await groups(filter, groupBy);
      snapshot[level][year] = r.out;
      pages[`${level}:${year}`] = r.pages;
    }
  }
} catch (err) { error = String(err?.message ?? err); }

const sum = (o) => Object.entries(o).filter(([k]) => k !== "unknown").reduce((a, [, v]) => a + v, 0);
const reconcile = Object.fromEntries(Object.keys(snapshot.topic).map((y) => [y, {
  topicSum: sum(snapshot.topic[y]), domainSum: sum(snapshot.domain[y]), fieldSum: sum(snapshot.field[y]), subfieldSum: sum(snapshot.subfield[y]),
  unknown: [snapshot.topic[y].unknown, snapshot.domain[y].unknown, snapshot.field[y].unknown, snapshot.subfield[y].unknown],
  topicGroups: Object.keys(snapshot.topic[y]).length - ("unknown" in snapshot.topic[y] ? 1 : 0),
}]));
const result = {
  startedAt: started, finishedAt: new Date().toISOString(), wallSeconds: (Date.now() - t0) / 1000, error, stopped,
  requests: requests.length, credits: requests.reduce((a, r) => a + r.credits, 0), usd: Number(requests.reduce((a, r) => a + r.usd, 0).toFixed(4)),
  statuses: requests.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}),
  remainingFirstLast: [requests[0]?.remaining, requests.at(-1)?.remaining], limit: requests[0]?.limit,
  msMedian: [...requests].map((r) => r.ms).sort((a, b) => a - b)[Math.floor(requests.length / 2)],
  pages, reconcile, snapshot,
};
const s = JSON.stringify(result);
if (s.includes(key)) throw new Error("key material in output");
writeFileSync(outPath, s);
console.log(JSON.stringify({ ...result, pages: undefined, snapshot: undefined, reconcile: undefined }));
