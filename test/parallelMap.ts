import os from 'node:os';

/** Worker count for in-test parallel loops (separate from Vitest file pool). */
export function defaultInTestParallelism(): number {
  const fromEnv = process.env.VITEST_IN_TEST_PARALLEL;
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return Math.max(2, Math.min(os.cpus().length, 16));
}

/** Split items into fixed-size batches (last batch may be smaller). */
export function batchItems<T>(items: readonly T[], batchSize: number): T[][] {
  if (batchSize <= 0) throw new Error(`batchSize must be > 0, got ${batchSize}`);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize) as T[]);
  }
  return batches;
}
export async function parallelMap<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => R | Promise<R>,
  concurrency = defaultInTestParallelism(),
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function drain(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => drain()));
  return results;
}
