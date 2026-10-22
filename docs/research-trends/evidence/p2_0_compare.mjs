// P2.0: compare two full-run snapshots (p2_0_fullrun.mjs output). Pure file comparison, no network.
// Usage: node p2_0_compare.mjs <first.json> <second.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [aPath, bPath, outPath] = process.argv.slice(2);
const A = JSON.parse(readFileSync(aPath, "utf8"));
const B = JSON.parse(readFileSync(bPath, "utf8"));
const LEVELS = ["topic", "domain", "field", "subfield"];
// [QUY ƯỚC] A topic-year change is "notable" when |Δ| ≥ 20 papers AND |Δ| ≥ 2% of the first count,
// or when the topic appears/disappears in a year. Thresholds are for reporting only.
const NOTABLE_ABS = 20, NOTABLE_REL = 0.02;

const hoursApart = (new Date(B.startedAt) - new Date(A.finishedAt)) / 3_600_000;
const known = (o) => Object.entries(o ?? {}).filter(([k]) => k !== "unknown");
const sum = (o) => known(o).reduce((s, [, v]) => s + v, 0);
const pct = (x, base) => (base ? (100 * x) / base : null);

const years = Object.keys(A.snapshot.topic).filter((y) => y in B.snapshot.topic).sort();
const out = { firstRun: [A.startedAt, A.finishedAt], secondRun: [B.startedAt, B.finishedAt], hoursApart: Number(hoursApart.toFixed(2)), years, cost: { first: { requests: A.requests, credits: A.credits, usd: A.usd }, second: { requests: B.requests, credits: B.credits, usd: B.usd } }, perYear: {}, levels: {}, notable: [], taxonomyConsistency: {} };

const allDeltas = [];
for (const y of years) {
  const a = A.snapshot.topic[y], b = B.snapshot.topic[y];
  const ids = new Set([...known(a).map(([k]) => k), ...known(b).map(([k]) => k)]);
  let changed = 0, up = 0, down = 0, appeared = 0, disappeared = 0, absSum = 0;
  for (const id of ids) {
    const x = a[id] ?? 0, z = b[id] ?? 0, d = z - x;
    if (!(id in a)) appeared++;
    if (!(id in b)) disappeared++;
    if (d !== 0) { changed++; d > 0 ? up++ : down++; absSum += Math.abs(d); allDeltas.push({ id, year: Number(y), first: x, second: z, delta: d, relPct: pct(d, x) }); }
    if (!(id in a) || !(id in b) || (Math.abs(d) >= NOTABLE_ABS && Math.abs(d) >= NOTABLE_REL * x)) out.notable.push({ id, year: Number(y), first: id in a ? x : null, second: id in b ? z : null, delta: d, relPct: x ? Number(pct(d, x).toFixed(3)) : null });
  }
  out.perYear[y] = {
    topicsCompared: ids.size, topicsChanged: changed, changedPct: Number(pct(changed, ids.size).toFixed(2)), up, down, appeared, disappeared,
    classifiedFirst: sum(a), classifiedSecond: sum(b), classifiedDelta: sum(b) - sum(a), classifiedDeltaPct: Number(pct(sum(b) - sum(a), sum(a)).toFixed(4)),
    unknownFirst: a.unknown ?? 0, unknownSecond: b.unknown ?? 0, unknownDelta: (b.unknown ?? 0) - (a.unknown ?? 0),
    sumAbsTopicDelta: absSum, sumAbsTopicDeltaPctOfClassified: Number(pct(absSum, sum(a)).toFixed(4)),
  };
  // Taxonomy consistency inside the second run: every level sums to the same classified total and unknown.
  out.taxonomyConsistency[y] = Object.fromEntries(LEVELS.slice(1).map((l) => [l, { sumDiffVsTopics: sum(B.snapshot[l][y]) - sum(b), unknownDiffVsTopics: (B.snapshot[l][y].unknown ?? 0) - (b.unknown ?? 0) }]));
}
for (const l of LEVELS.slice(1)) {
  out.levels[l] = {};
  for (const y of years) {
    const a = A.snapshot[l][y], b = B.snapshot[l][y];
    const ids = new Set([...known(a).map(([k]) => k), ...known(b).map(([k]) => k)]);
    const diffs = [...ids].map((id) => ({ id, delta: (b[id] ?? 0) - (a[id] ?? 0), relPct: a[id] ? pct((b[id] ?? 0) - a[id], a[id]) : null })).filter((d) => d.delta !== 0);
    out.levels[l][y] = { units: ids.size, unitsChanged: diffs.length, maxAbsDelta: Math.max(0, ...diffs.map((d) => Math.abs(d.delta))), maxAbsRelPct: Number(Math.max(0, ...diffs.map((d) => Math.abs(d.relPct ?? 0))).toFixed(4)), newOrMissing: [...ids].filter((id) => !(id in a) || !(id in b)) };
  }
}
const absRel = allDeltas.filter((d) => d.first > 0).map((d) => Math.abs(d.relPct)).sort((p, q) => p - q);
const q = (f) => (absRel.length ? Number(absRel[Math.min(absRel.length - 1, Math.floor(f * absRel.length))].toFixed(4)) : 0);
out.volatility = { topicYearCellsChanged: allDeltas.length, absRelPctQuantiles: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) }, largestAbs: [...allDeltas].sort((p, r) => Math.abs(r.delta) - Math.abs(p.delta)).slice(0, 15), largestRel: allDeltas.filter((d) => d.first >= 50).sort((p, r) => Math.abs(r.relPct) - Math.abs(p.relPct)).slice(0, 15) };
out.notable.sort((p, r) => Math.abs(r.delta) - Math.abs(p.delta));
out.notableCount = out.notable.length;
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ hoursApart: out.hoursApart, perYear: out.perYear, volatility: { ...out.volatility, largestAbs: undefined, largestRel: undefined }, notableCount: out.notableCount }, null, 1));
