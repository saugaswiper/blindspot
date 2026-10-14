/**
 * Held-out benchmark metrics for screening-order models (brief 010).
 * Any future model must beat the current one here before promotion.
 */

/** Fraction of all includes found within the first k records of `order`. */
export function recallAtK(order: boolean[], k: number): number {
  const total = order.filter(Boolean).length;
  if (total === 0) return 1;
  return order.slice(0, k).filter(Boolean).length / total;
}

/**
 * Work Saved over Sampling at a recall level: the share of records the
 * reviewer skips once `target` recall is reached, minus the (1 - target)
 * a random order would save. `order[i]` is true when the i-th ranked record
 * is a true include. WSS@95 > 0 beats random order.
 */
export function wss(order: boolean[], target = 0.95): number {
  const n = order.length;
  const total = order.filter(Boolean).length;
  if (n === 0 || total === 0) return 0;
  const needed = Math.ceil(target * total);
  let found = 0;
  let k = n;
  for (let i = 0; i < n; i++) {
    if (order[i]) found++;
    if (found >= needed) {
      k = i + 1;
      break;
    }
  }
  return (n - k) / n - (1 - target);
}

/** True when no review id appears in both train and held-out sets. */
export function splitHasNoOverlap(train: string[], heldOut: string[]): boolean {
  const t = new Set(train);
  return !heldOut.some((r) => t.has(r));
}
