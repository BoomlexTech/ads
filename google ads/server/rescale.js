// Split an integer target across daily rows in proportion to their current
// values (evenly when they are all empty/zero). Exact: the parts always sum to
// the target. Uses BigInt so large totals never lose precision.
export function distribute(values, target) {
  const n = values.length;
  if (n === 0) return [];
  const T = BigInt(target);
  let w = values.map((v) => BigInt(v > 0 ? v : 0));
  let W = w.reduce((a, b) => a + b, 0n);
  if (W === 0n) {
    w = values.map(() => 1n);
    W = BigInt(n);
  }
  const parts = w.map((x) => (T * x) / W);
  const rems = w.map((x, i) => [(T * x) % W, i]);
  let left = T - parts.reduce((a, b) => a + b, 0n);
  rems.sort((a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : a[1] - b[1]));
  for (let k = 0; left > 0n; k++, left--) parts[rems[k][1]] += 1n;
  return parts.map(Number);
}
