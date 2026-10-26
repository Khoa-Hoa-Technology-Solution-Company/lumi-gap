// P2.2 read-only verification of the Discover API against the live-canary snapshot.
// GET requests only (through createApp) + SELECT counts. No writes.
import { writeFileSync } from "node:fs";

const { createApp } = await import("file:///D:/K9/lumi-gap/apps/backend/src/app.ts");
const { getPrisma } = await import("file:///D:/K9/lumi-gap/apps/backend/src/infrastructure/database/prisma.ts");
const db = getPrisma();
const server = createApp().listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.on("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/trends/discover`;
const get = async (q: string) => { const r = await fetch(`${base}?${q}`); if (r.status !== 200) throw new Error(`${q}: HTTP ${r.status}`); return (await r.json()).data; };
const checks: Array<{ name: string; ok: boolean; detail?: unknown }> = [];
const check = (name: string, ok: boolean, detail?: unknown) => checks.push({ name, ok, ...(detail !== undefined ? { detail } : {}) });

const snap = await db.trendSnapshot.findFirstOrThrow({ where: { isActive: true } });
const out: Record<string, unknown> = { snapshotId: snap.id, checkedAt: new Date().toISOString() };

for (const baseline of ["global", "domain", "field", "subfield"]) {
  const full = await get(`collection=trending&baseline=${baseline}&pageSize=100&page=1`);
  const rising = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: baseline, verdict: "rising" } });
  const risingWithPQ = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: baseline, verdict: "rising", pValue: { not: null }, qValue: { not: null } } });
  const notAssessable = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: baseline, pValue: null, verdict: { not: "insufficient" } } });
  check(`trending ${baseline}: total = stored rising`, full.total === rising && rising === risingWithPQ, { total: full.total, rising, risingWithPQ });
  check(`trending ${baseline}: provenance = active snapshot`, full.provenance.snapshotId === snap.id && full.provenance.source === "openalex" && full.provenance.baselineLevel === baseline && full.items.every((i: { provenance: { snapshotId: string } }) => i.provenance.snapshotId === snap.id));
  check(`trending ${baseline}: excluded.notAssessable = stored rows without p (not insufficient)`, full.excluded.notAssessable === notAssessable, { api: full.excluded.notAssessable, stored: notAssessable });
  out[`trending_${baseline}`] = { total: full.total, excluded: full.excluded, top3: full.items.slice(0, 3).map((i: any) => ({ rank: i.rank, topicId: i.topicId, topicName: i.topicName, rel: i.relativeChangePct, q: i.qValue, family: i.qFamilySize, field: i.taxonomy.fieldName })) };
  // Paging invariance on real data: walk the whole ranking with pageSize 7 and compare with pageSize 100 pages.
  const all: any[] = [];
  for (let p = 1; p <= Math.ceil(full.total / 100); p++) all.push(...(await get(`collection=trending&baseline=${baseline}&pageSize=100&page=${p}`)).items);
  const small: any[] = [];
  for (let p = 1; p <= Math.ceil(full.total / 7); p++) small.push(...(await get(`collection=trending&baseline=${baseline}&pageSize=7&page=${p}`)).items);
  const same = all.length === small.length && all.every((a, k) => a.topicId === small[k].topicId && a.qValue === small[k].qValue && a.mannKendall?.pValue === small[k].mannKendall?.pValue && a.verdict === small[k].verdict && a.rank === small[k].rank && a.qFamilySize === small[k].qFamilySize);
  check(`trending ${baseline}: pageSize 7 vs 100 give the same ranking and statistics`, same, { n: all.length });
  const ordered = all.every((b, k) => k === 0 || (all[k - 1].relativeChangePct ?? -Infinity) > (b.relativeChangePct ?? -Infinity) || (all[k - 1].relativeChangePct === b.relativeChangePct && (all[k - 1].qValue < b.qValue || (all[k - 1].qValue === b.qValue && all[k - 1].topicId < b.topicId))));
  check(`trending ${baseline}: documented order`, ordered);
  const families = await db.trendSnapshotResult.groupBy({ by: ["baselineUnit"], where: { snapshotId: snap.id, baselineLevel: baseline, pValue: { not: null } }, _count: { _all: true } });
  check(`trending ${baseline}: each item's BH family size = topics with p in its baseline unit`, all.every((i) => i.qFamilySize === families.find((f) => f.baselineUnit === i.baselineUnit.id)?._count._all));
}

const fastest = await get("collection=fastest_growing&baseline=field&pageSize=100");
const fastestStored = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: "field", verdict: "rising", ggtConditionsMet: true, ggtMeanPct: { not: null }, ggtSemPct: { not: null } } });
check("fastest field: total = rising ∩ Nelis conditions ∩ mean±SEM", fastest.total === fastestStored, { api: fastest.total, stored: fastestStored });
check("fastest field: every item rising, conditions met, stabilityChecked false", fastest.items.every((i: any) => i.verdict === "rising" && i.ggt.conditionsMet && i.ggt.stabilityChecked === false && i.ggt.semPct !== null));
check("fastest field: ordered by mean GGT", fastest.items.every((b: any, k: number) => k === 0 || fastest.items[k - 1].ggt.meanPct >= b.ggt.meanPct));
const tinyGgt = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: "field", ggtMeanPct: { gt: 100 } } });
check("fastest field: no topic with mean GGT > 100% (small-base artefacts) is ranked", fastest.items.every((i: any) => i.ggt.meanPct <= 100), { topicsWithMeanGgtAbove100: tinyGgt });
out.fastest_field = { total: fastest.total, ggtConditionsNotMet: fastest.excluded.ggtConditionsNotMet, top3: fastest.items.slice(0, 3).map((i: any) => ({ topicId: i.topicId, topicName: i.topicName, mean: i.ggt.meanPct, sem: i.ggt.semPct, years: i.ggt.years, group: i.ggt.nelisThresholdGroup })) };

const byField = await get("collection=by_field&baseline=global&perField=3");
const catalogueFields = await db.trendSnapshotTopic.groupBy({ by: ["fieldId"], where: { snapshotId: snap.id } });
check("by_field: baseline forced to field", byField.baselineLevel === "field");
check("by_field: one group per catalogue field", byField.fields.length === catalogueFields.length, { groups: byField.fields.length, catalogue: catalogueFields.length });
let fieldsOk = true;
for (const f of byField.fields) {
  const stored = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: "field", baselineUnit: f.fieldId } });
  const withP = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: "field", baselineUnit: f.fieldId, pValue: { not: null } } });
  const rising = await db.trendSnapshotResult.count({ where: { snapshotId: snap.id, baselineLevel: "field", baselineUnit: f.fieldId, verdict: "rising" } });
  if (f.topicsInField !== stored || f.qFamilySize !== withP || f.risingTopics !== rising || !f.topics.every((i: any) => i.taxonomy.fieldId === f.fieldId && i.baselineUnit.id === f.fieldId && i.qFamilyKey === `field:${f.fieldId}`)) fieldsOk = false;
}
check("by_field: per field topics, BH family size and rising count = stored; topics belong to the field", fieldsOk);
out.by_field = byField.fields.map((f: any) => ({ field: f.fieldName, topics: f.topicsInField, family: f.qFamilySize, rising: f.risingTopics }));

// The 30 sole members of their subfield.
const sole = await db.$queryRaw<Array<{ topic_id: string }>>`
  SELECT r.topic_id FROM trend_snapshot_results r
   WHERE r.snapshot_id = ${snap.id}::uuid AND r.baseline_level = 'subfield' AND r.p_value IS NULL AND r.verdict = 'stable'`;
const subfieldTrending = await get("collection=trending&baseline=subfield&pageSize=100");
const subfieldAll: any[] = [];
for (let p = 1; p <= Math.ceil(subfieldTrending.total / 100); p++) subfieldAll.push(...(await get(`collection=trending&baseline=subfield&pageSize=100&page=${p}`)).items);
const { assessabilityOf } = await import("file:///D:/K9/lumi-gap/apps/backend/src/modules/trends/trend.discover.service.ts");
const soleRows = await db.trendSnapshotResult.findMany({ where: { snapshotId: snap.id, baselineLevel: "subfield", topicId: { in: sole.map((s) => s.topic_id) } } });
check("sole members: 30 found", sole.length === 30, { n: sole.length });
check("sole members: none ranked in any subfield collection", !subfieldAll.some((i) => sole.some((s) => s.topic_id === i.topicId)));
check("sole members: all classified not_assessable_sole_member", soleRows.every((r) => assessabilityOf(r) === "not_assessable_sole_member"), { classes: [...new Set(soleRows.map((r) => assessabilityOf(r)))] });
check("sole members: counted in excluded.notAssessable (subfield)", subfieldTrending.excluded.notAssessable === 30, { api: subfieldTrending.excluded.notAssessable });

const bad = await fetch(`${base}?collection=emerging`);
check("unsupported collections rejected (no Emerging/Hot/Burst)", bad.status === 400);

out.checks = checks;
out.summary = { passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary), checks.filter((c) => !c.ok).map((c) => c.name));
server.close();
process.exit(0);
