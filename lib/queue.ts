/**
 * Run async tasks with a fixed concurrency limit. No dependency. Preserves the
 * ability for one task to fail without aborting the rest (the task itself must
 * catch — the pool just schedules).
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const n = Math.max(1, limit | 0);
  let cursor = 0;
  const runners: Promise<void>[] = [];

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  }
  for (let k = 0; k < Math.min(n, items.length); k++) runners.push(runner());
  await Promise.all(runners);
}
