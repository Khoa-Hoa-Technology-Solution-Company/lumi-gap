export interface PopulationBucket {
  key: string;
  population: number;
}

export interface Allocation {
  key: string;
  population: number;
  quota: number;
}

export interface DomainAllocation extends Allocation {
  floor: number;
}

export interface SeededSamplePartitionPlan {
  partitionKey: string;
  stratumKey: string;
  filterExpression: string;
  plannedPopulation: number;
  targetCount: number;
  seed: number;
}

// OpenAlex accepts sample values up to 10k, but list responses remain capped
// at 100 and sampled requests do not expose a usable next_cursor. A durable
// campaign must therefore request one 100-work sample per partition.
export const OPENALEX_CAMPAIGN_SAMPLE_SIZE = 100;

/**
 * Allocate a bounded target proportionally without allowing a bucket to receive
 * more records than its known provider population. Ties are broken by key so a
 * manifest can be reproduced from the same planning snapshot.
 */
export function allocateLargestRemainder(
  target: number,
  buckets: readonly PopulationBucket[],
): Allocation[] {
  const normalized = buckets
    .filter((bucket) => Number.isInteger(bucket.population) && bucket.population > 0)
    .map((bucket) => ({ ...bucket, quota: 0 }));
  let remaining = Math.min(Math.max(0, Math.floor(target)), normalized.reduce((sum, item) => sum + item.population, 0));

  while (remaining > 0) {
    const eligible = normalized.filter((item) => item.quota < item.population);
    if (eligible.length === 0) break;

    const weight = eligible.reduce((sum, item) => sum + item.population, 0);
    const proposed = eligible.map((item) => {
      const exact = (remaining * item.population) / weight;
      return { item, whole: Math.min(item.population - item.quota, Math.floor(exact)), remainder: exact % 1 };
    });
    const allocated = proposed.reduce((sum, proposal) => sum + proposal.whole, 0);
    for (const proposal of proposed) proposal.item.quota += proposal.whole;
    remaining -= allocated;
    if (remaining === 0) break;

    proposed
      .filter((proposal) => proposal.item.quota < proposal.item.population)
      .sort((a, b) => b.remainder - a.remainder || a.item.key.localeCompare(b.item.key))
      .slice(0, remaining)
      .forEach((proposal) => {
        proposal.item.quota += 1;
        remaining -= 1;
      });
  }

  return normalized.map(({ key, population, quota }) => ({ key, population, quota }));
}

/**
 * Baseline policy from the million-scale ingest specification: a bounded,
 * equal floor prevents small OpenAlex domains disappearing, then the remaining
 * budget follows provider population by largest-remainder allocation.
 */
export function planDomainBaseline(
  target: number,
  buckets: readonly PopulationBucket[],
  options: { floorBudgetRatio?: number; maxFloorPerDomain?: number } = {},
): DomainAllocation[] {
  const eligible = buckets
    .filter((bucket) => Number.isInteger(bucket.population) && bucket.population > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (eligible.length === 0 || target <= 0) return eligible.map((bucket) => ({ ...bucket, floor: 0, quota: 0 }));

  const boundedTarget = Math.min(Math.floor(target), eligible.reduce((sum, bucket) => sum + bucket.population, 0));
  const floorBudget = Math.min(
    Math.floor(boundedTarget * (options.floorBudgetRatio ?? 0.2)),
    eligible.length * (options.maxFloorPerDomain ?? 20_000),
    boundedTarget,
  );

  let remainingFloor = floorBudget;
  const allocations = eligible.map((bucket) => ({ ...bucket, floor: 0, quota: 0 }));
  while (remainingFloor > 0) {
    const candidates = allocations.filter((item) => item.floor < item.population);
    if (candidates.length === 0) break;
    const each = Math.max(1, Math.floor(remainingFloor / candidates.length));
    let consumed = 0;
    for (const item of candidates) {
      const added = Math.min(each, item.population - item.floor, remainingFloor - consumed);
      item.floor += added;
      consumed += added;
      if (consumed === remainingFloor) break;
    }
    remainingFloor -= consumed;
  }

  const floorTotal = allocations.reduce((sum, item) => sum + item.floor, 0);
  const proportional = allocateLargestRemainder(
    boundedTarget - floorTotal,
    allocations.map((item) => ({ key: item.key, population: item.population - item.floor })),
  );
  const proportionalByKey = new Map(proportional.map((item) => [item.key, item.quota]));
  return allocations.map((item) => ({
    key: item.key,
    population: item.population,
    floor: item.floor,
    quota: item.floor + (proportionalByKey.get(item.key) ?? 0),
  }));
}

/**
 * OpenAlex list responses are one page of at most 100 works for this sampled
 * path. Split a stratum into deterministic one-page requests with an
 * apportioned population basis. The sample requests are independent, so
 * campaigns remain at-least-once and deduplicate on
 * DOI/OpenAlex ID at write time. A follow-up refill campaign is required when
 * an operator needs an exact unique-work threshold after deduplication.
 */
export function splitSeededSampleQuota(input: {
  partitionPrefix: string;
  stratumKey: string;
  filterExpression: string;
  population: number;
  quota: number;
  seedNamespace: string;
}): SeededSamplePartitionPlan[] {
  const quota = Math.min(Math.max(0, Math.floor(input.quota)), Math.max(0, Math.floor(input.population)));
  if (quota === 0 || input.population <= 0) return [];

  const targetChunks: number[] = [];
  for (let remaining = quota; remaining > 0; remaining -= OPENALEX_CAMPAIGN_SAMPLE_SIZE) {
    targetChunks.push(Math.min(OPENALEX_CAMPAIGN_SAMPLE_SIZE, remaining));
  }
  const populationChunks = allocateLargestRemainder(
    Math.floor(input.population),
    targetChunks.map((targetCount, index) => ({ key: String(index), population: targetCount })),
  );
  return targetChunks.map((targetCount, index) => ({
    partitionKey: `${input.partitionPrefix}:${index + 1}`,
    stratumKey: input.stratumKey,
    filterExpression: input.filterExpression,
    plannedPopulation: populationChunks[index]?.quota ?? targetCount,
    targetCount,
    seed: stableSeed(`${input.seedNamespace}:${input.partitionPrefix}:${index + 1}`),
  }));
}

/** Stable positive 32-bit seed accepted by OpenAlex's sample API. */
export function stableSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) || 1;
}
