/** Runs fn over items with at most `limit` calls in flight; keeps input order. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Inclusive integer range; empty when from > to. */
export function range(from: number, to: number): number[] {
  return from > to ? [] : Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
