import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * In-process mock of the OpenAlex endpoints the P2.1 snapshot worker uses,
 * served over real HTTP so the client's header parsing and 429 handling run
 * unchanged. Behaviour copied from what P2.0 measured on the live API:
 * group_by pages sorted by key with "unknown" first, a final empty page with
 * next_cursor null, meta.count = all matching works (incl. unknown), 1 credit
 * per /works or /topics request, /rate-limit free.
 */
export interface MockTopic {
  id: string;
  name: string;
  subfield: string;
  field: string;
  domain: string;
}

export interface MockDataset {
  topics: MockTopic[];
  /** year → topic id → works. */
  counts: Record<number, Record<string, number>>;
  /** year → works without a primary topic. */
  unknown: Record<number, number>;
}

export interface MockFaults {
  /** 429 with credits left (per-second limit) for these request numbers (1-based, /works + /topics). */
  rateLimit429?: Set<number>;
  /** From this request number on: 429 and Remaining 0 (daily budget spent). */
  quotaExhaustedFrom?: number;
  /** The page after `pageIndex` of this unit is served again instead of the next one. */
  duplicatePage?: { level: string; year: number; pageIndex: number };
  /** The next_cursor of `pageIndex` skips one page. */
  skipPage?: { level: string; year: number; pageIndex: number };
  /** Added to one unit's count at a level (inconsistent taxonomy). */
  taxonomyDelta?: { level: "domain" | "field" | "subfield"; year: number; unit: string; delta: number };
  /** Added to the unknown group at one level only. */
  unknownDelta?: { level: "topic" | "domain" | "field" | "subfield"; year: number; delta: number };
  /** Topic counted in /works but absent from /topics. */
  uncataloguedTopic?: { id: string; year: number; count: number };
  /** Requests for which the socket is destroyed (network failure). */
  dropRequest?: (n: number) => boolean;
}

export interface MockOpenAlex {
  baseUrl: string;
  dataset: MockDataset;
  faults: MockFaults;
  state: { creditsLimit: number; creditsUsed: number; resetSeconds: number };
  /** Every /works and /topics request, in order. */
  log: Array<{ n: number; path: string; level: string; year: number; cursor: string; status: number }>;
  close(): Promise<void>;
}

const LEVEL_OF: Record<string, string> = {
  "primary_topic.id:include_unknown": "topic",
  "primary_topic.domain.id:include_unknown": "domain",
  "primary_topic.field.id:include_unknown": "field",
  "primary_topic.subfield.id:include_unknown": "subfield",
};

/** Deterministic dataset: 2 domains, 3 fields, 4 subfields, `topicCount` topics. */
export function makeDataset(options: { topicCount?: number; years?: number[]; growth?: (topicIndex: number, yearIndex: number) => number } = {}): MockDataset {
  const years = options.years ?? [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const subfields = [
    { subfield: "1101", field: "11", domain: "1" },
    { subfield: "1102", field: "11", domain: "1" },
    { subfield: "1201", field: "12", domain: "1" },
    { subfield: "2201", field: "22", domain: "2" },
  ];
  const topics: MockTopic[] = Array.from({ length: options.topicCount ?? 8 }, (_, i) => {
    const s = subfields[i % subfields.length]!;
    return { id: `T${10001 + i}`, name: `Topic ${i + 1}`, ...s };
  });
  const growth = options.growth ?? ((t, y) => 60 + t * 15 + y * ((t % 3) - 1) * 6 + ((t * 7 + y * 3) % 5));
  const counts: MockDataset["counts"] = {};
  const unknown: MockDataset["unknown"] = {};
  years.forEach((year, y) => {
    counts[year] = Object.fromEntries(topics.map((t, i) => [t.id, Math.max(0, Math.round(growth(i, y)))]));
    unknown[year] = 20 + y;
  });
  return { topics, counts, unknown };
}

function groupsFor(dataset: MockDataset, faults: MockFaults, level: string, year: number) {
  const byTopic = { ...(dataset.counts[year] ?? {}) };
  if (faults.uncataloguedTopic && faults.uncataloguedTopic.year === year) byTopic[faults.uncataloguedTopic.id] = faults.uncataloguedTopic.count;
  const groups = new Map<string, { key: string; key_display_name: string; count: number }>();
  for (const [topicId, count] of Object.entries(byTopic)) {
    const topic = dataset.topics.find((t) => t.id === topicId);
    const unit = level === "topic" ? topicId : topic ? topic[level as "domain" | "field" | "subfield"] : null;
    if (unit === null) continue; // an uncatalogued topic has no parent in this mock
    const key = level === "topic" ? `https://openalex.org/${unit}` : `https://openalex.org/${level}s/${unit}`;
    const g = groups.get(key) ?? { key, key_display_name: `${level} ${unit}`, count: 0 };
    g.count += count;
    groups.set(key, g);
  }
  let unknown = dataset.unknown[year] ?? 0;
  if (faults.unknownDelta && faults.unknownDelta.level === level && faults.unknownDelta.year === year) unknown += faults.unknownDelta.delta;
  if (faults.taxonomyDelta && faults.taxonomyDelta.level === level && faults.taxonomyDelta.year === year) {
    const g = [...groups.values()].find((x) => x.key.endsWith(`/${faults.taxonomyDelta!.unit}`));
    if (g) g.count += faults.taxonomyDelta.delta;
  }
  // meta.count is the number of works, computed before any taxonomy fault.
  const metaCount = Object.values(byTopic).reduce((a, b) => a + b, 0) + (dataset.unknown[year] ?? 0);
  const sorted = [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return { list: [{ key: "unknown", key_display_name: "unknown", count: unknown }, ...sorted], metaCount };
}

const encode = (unit: string, page: number) => Buffer.from(`${unit}|${page}`).toString("base64url");
const decode = (cursor: string) => {
  if (cursor === "*") return 0;
  return Number(Buffer.from(cursor, "base64url").toString().split("|")[1]);
};

export async function startMockOpenAlex(options: { dataset?: MockDataset; pageSize?: number; creditsLimit?: number; creditsUsed?: number } = {}): Promise<MockOpenAlex> {
  const dataset = options.dataset ?? makeDataset();
  const pageSize = options.pageSize ?? 3;
  const faults: MockFaults = {};
  const state = { creditsLimit: options.creditsLimit ?? 10_000, creditsUsed: options.creditsUsed ?? 0, resetSeconds: 3600 };
  const log: MockOpenAlex["log"] = [];
  let n = 0;

  const send = (res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) => {
    const remaining = Math.max(0, state.creditsLimit - state.creditsUsed);
    res.writeHead(status, {
      "content-type": "application/json",
      "x-ratelimit-limit": String(state.creditsLimit),
      "x-ratelimit-remaining": String(remaining),
      "x-ratelimit-reset": String(state.resetSeconds),
      ...extra,
    });
    res.end(JSON.stringify(body));
  };

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://mock");
    if (url.pathname === "/rate-limit") {
      return send(res, 200, { rate_limit: { credits_limit: state.creditsLimit, credits_used: state.creditsUsed, credits_remaining: Math.max(0, state.creditsLimit - state.creditsUsed), resets_at: new Date(Date.now() + state.resetSeconds * 1000).toISOString() } });
    }
    n += 1;
    const cursor = url.searchParams.get("cursor") ?? "*";
    const isTopics = url.pathname === "/topics";
    const level = isTopics ? "catalogue" : LEVEL_OF[url.searchParams.get("group_by") ?? ""] ?? "?";
    const year = isTopics ? 0 : Number(/publication_year:(\d{4})/.exec(url.searchParams.get("filter") ?? "")?.[1]);
    const entry = { n, path: url.pathname, level, year, cursor, status: 200 };
    log.push(entry);

    if (faults.dropRequest?.(n)) { entry.status = 0; req.socket.destroy(); return; }
    if (faults.quotaExhaustedFrom !== undefined && n >= faults.quotaExhaustedFrom) {
      state.creditsUsed = state.creditsLimit;
      entry.status = 429;
      return send(res, 429, { error: "Daily budget exceeded" });
    }
    if (faults.rateLimit429?.has(n)) { entry.status = 429; return send(res, 429, { error: "Too many requests" }, { "retry-after": "0" }); }
    if (!isTopics && url.searchParams.get("corpus") !== "core") { entry.status = 400; return send(res, 400, { error: "corpus=core expected" }); }
    state.creditsUsed += 1;

    let items: unknown[];
    let metaCount: number;
    if (isTopics) {
      items = dataset.topics.map((t) => ({ id: `https://openalex.org/${t.id}`, display_name: t.name, subfield: { id: `https://openalex.org/subfields/${t.subfield}`, display_name: `subfield ${t.subfield}` }, field: { id: `https://openalex.org/fields/${t.field}`, display_name: `field ${t.field}` }, domain: { id: `https://openalex.org/domains/${t.domain}`, display_name: `domain ${t.domain}` } }));
      metaCount = items.length;
    } else {
      const g = groupsFor(dataset, faults, level, year);
      items = g.list;
      metaCount = g.metaCount;
    }
    const page = decode(cursor);
    const dataPages = Math.ceil(items.length / pageSize);
    const slice = items.slice(page * pageSize, (page + 1) * pageSize);
    // Like the live API: after the last data page comes one empty page whose next_cursor is null.
    let next: number | null = page < dataPages ? page + 1 : null;
    const same = (f?: { level: string; year: number; pageIndex: number }) => f && f.level === level && f.year === year && f.pageIndex === page;
    if (same(faults.duplicatePage)) next = page; // the next request gets this page again
    if (same(faults.skipPage) && next !== null) next = Math.min(dataPages, next + 1);
    const unitId = `${level}:${year}`;
    const body = isTopics
      ? { meta: { count: metaCount, next_cursor: next === null ? null : encode(unitId, next) }, results: slice }
      : { meta: { count: metaCount, next_cursor: next === null ? null : encode(unitId, next), cost_usd: 0.0001 }, group_by: slice };
    // A duplicated page is served once more with a fresh cursor so the client cannot tell from the cursor alone.
    if (same(faults.duplicatePage)) faults.duplicatePage = undefined;
    send(res, 200, body, { "x-ratelimit-credits-used": "1", "x-ratelimit-cost-usd": "0.0001" });
  };

  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataset,
    faults,
    state,
    log,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

/** Pages one complete snapshot needs from the mock (data pages + the final empty page per unit). */
export function expectedPages(dataset: MockDataset, pageSize: number, years: number[]): number {
  const levelUnits = (level: "domain" | "field" | "subfield") => new Set(dataset.topics.map((t) => t[level])).size + 1;
  const perUnit = (groups: number) => Math.ceil(groups / pageSize) + 1;
  const catalogue = perUnit(dataset.topics.length);
  const perYear = perUnit(dataset.topics.length + 1) + perUnit(levelUnits("domain")) + perUnit(levelUnits("field")) + perUnit(levelUnits("subfield"));
  return catalogue + perYear * years.length;
}
