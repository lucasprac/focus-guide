/* Numerical methods for the insight engine: seeded random numbers, intervals, Kaplan–Meier, ridge regression,
   k-means++ and silhouette. Pure and deterministic, with no dependencies. Every interval is a 90 % interval.
   The matrix kernels (ridge, lasso and elastic net, collinearity, k-means, silhouettes) run in Rust compiled to WebAssembly
   (native/stats, embedded by scripts/build-stats.cjs). They give the same doubles as the TypeScript they replaced.
   Call loadStats() once before the first insight; the scalar helpers below stay in TypeScript because a call into
   WebAssembly costs more than they do, and Kaplan–Meier uses log and exp, which differ by an ulp between math libraries. */
import { STATS_WASM } from './stats-wasm';

export const Z90 = 1.6448536269514722;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), state | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* Upper-tail standard normal quantile for 0 < p ≤ 0.5 (Abramowitz and Stegun 26.2.23; error below 4.5e-4). */
export function zUpper(p: number): number {
  const t = Math.sqrt(-2 * Math.log(Math.min(0.5, Math.max(p, 1e-300))));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t ** 3);
}
/* Student t quantile for a two-sided 90 % interval (Cornish–Fisher series; within 0.5 % from df = 2). */
export function t90(df: number): number {
  const z = Z90, z2 = z * z, v = Math.max(1, df);
  return z + z * (z2 + 1) / (4 * v) + z * ((5 * z2 + 16) * z2 + 3) / (96 * v * v) + z * (((3 * z2 + 19) * z2 + 17) * z2 - 15) / (384 * v ** 3) + z * ((((79 * z2 + 776) * z2 + 1482) * z2 - 1920) * z2 - 945) / (92160 * v ** 4);
}
export function variance(values: number[]): number {
  if (values.length < 2) return 0; const m = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}
/* Mean with a t interval. One value gives a zero-width interval. */
export function meanInterval(values: number[]): { estimate: number; low: number; high: number } {
  const estimate = values.reduce((sum, v) => sum + v, 0) / values.length, half = values.length > 1 ? t90(values.length - 1) * Math.sqrt(variance(values) / values.length) : 0;
  return { estimate, low: estimate - half, high: estimate + half };
}
/* Welch interval for mean(a) - mean(b), with the conservative min(n) - 1 degrees of freedom. */
export function differenceInterval(a: number[], b: number[]): { estimate: number; low: number; high: number } {
  const estimate = a.reduce((s, v) => s + v, 0) / a.length - b.reduce((s, v) => s + v, 0) / b.length;
  const half = t90(Math.min(a.length, b.length) - 1) * Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return { estimate, low: estimate - half, high: estimate + half };
}
/* Linear interpolation between order statistics; `sorted` is ascending. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0; const at = (sorted.length - 1) * q, low = Math.floor(at), high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/* Product-limit estimate with Greenwood variance and a log-log band. Points start at time 0 and follow each event time. */
export function kaplanMeier(rows: Array<{ time: number; event: boolean }>): { points: Array<{ time: number; survival: number; low: number; high: number; atRisk: number }>; median: { estimate: number; low: number; high: number } | null } {
  const sorted = rows.filter(r => Number.isFinite(r.time)).sort((a, b) => a.time - b.time);
  const points = [{ time: 0, survival: 1, low: 1, high: 1, atRisk: sorted.length }];
  let survival = 1, greenwood = 0, atRisk = sorted.length;
  for (let i = 0; i < sorted.length;) {
    let j = i, events = 0; while (j < sorted.length && sorted[j].time === sorted[i].time) { if (sorted[j].event) events++; j++; }
    if (events) {
      survival *= 1 - events / atRisk; greenwood = events < atRisk ? greenwood + events / (atRisk * (atRisk - events)) : Infinity;
      const band = survival > 0 ? Z90 * Math.sqrt(greenwood) / Math.abs(Math.log(survival)) : 0;
      points.push({ time: sorted[i].time, survival, low: survival > 0 ? survival ** Math.exp(band) : 0, high: survival > 0 ? survival ** Math.exp(-band) : 0, atRisk });
    }
    atRisk -= j - i; i = j;
  }
  // The median interval is where the band crosses one half; an upper limit that is never reached is the last observed time.
  const cross = (key: 'survival' | 'low' | 'high') => points.find(p => p[key] <= 0.5)?.time;
  const estimate = cross('survival');
  return { points, median: estimate === undefined ? null : { estimate, low: cross('low') ?? estimate, high: cross('high') ?? sorted[sorted.length - 1].time } };
}


/* The WebAssembly module. Buffers are f64 arrays in its memory: inputs are copied in, outputs copied out, and every buffer
   is freed after the call. Views are made again after each call, because the module may grow its memory. */
interface StatsModule {
  memory: WebAssembly.Memory;
  stats_alloc(len: number): number; stats_free(pointer: number, len: number): void;
  ridge_fit(x: number, y: number, n: number, p: number, lambda: number, out: number): void;
  ridge_select(x: number, y: number, n: number, p: number, lambdas: number, count: number, out: number): void;
  penalized_fit(x: number, y: number, n: number, p: number, lambda: number, alpha: number, out: number): void;
  penalized_select(x: number, y: number, n: number, p: number, alpha: number, folds: number, factors: number, steps: number, out: number): void;
  collinearity(x: number, n: number, p: number, out: number): void;
  k_means(points: number, n: number, d: number, k: number, maxIterations: number, centroids: number, labels: number): number;
  silhouettes(points: number, n: number, d: number, labelings: number, count: number, out: number): void;
}
let stats: StatsModule | null = null, loading: Promise<void> | null = null;
// k-means++ draws from the caller's generator through this import, so the seeded stream stays the same.
let draw: () => number = () => { throw new Error('Nenhuma fonte de aleatoriedade foi definida.'); };
/* Compiles the module once. WebAssembly.instantiate is asynchronous because browsers refuse to compile large modules synchronously. */
export function loadStats(): Promise<void> {
  loading ??= (async () => {
    const bytes = Uint8Array.from(atob(STATS_WASM), c => c.charCodeAt(0));
    const { instance } = await WebAssembly.instantiate(bytes, { env: { stats_random: () => draw() } });
    stats = instance.exports as unknown as StatsModule;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
function engine(): StatsModule { if (!stats) throw new Error('O motor de estatística ainda está carregando. Tente novamente em instantes.'); return stats; }
/* Copies `inputs` in, reserves `outputs` slots, runs `call` with the pointers (inputs first) and reads the outputs back. */
function withBuffers<T>(inputs: ArrayLike<number>[], outputs: number[], call: (m: StatsModule, pointers: number[]) => number | void, read: (outs: Float64Array[], result: number | void) => T): T {
  const m = engine(), sizes = [...inputs.map(b => b.length), ...outputs], pointers = sizes.map(len => m.stats_alloc(len));
  try {
    inputs.forEach((buffer, i) => new Float64Array(m.memory.buffer, pointers[i], buffer.length).set(buffer));
    const result = call(m, pointers);
    return read(outputs.map((len, i) => new Float64Array(m.memory.buffer, pointers[inputs.length + i], len).slice()), result);
  } finally { pointers.forEach((pointer, i) => m.stats_free(pointer, sizes[i])); }
}
// Row-major copy; a missing cell is NaN, as x[i][j] would be undefined in arithmetic.
function flatten(rows: number[][], width: number): Float64Array {
  const flat = new Float64Array(rows.length * width);
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < width; j++) flat[i * width + j] = rows[i][j] ?? NaN;
  return flat;
}

/* Ridge regression on centred columns: the intercept is not penalized. Columns are used as given (standardize first). */
export function ridgeFit(x: number[][], y: number[], lambda: number): { intercept: number; coefficients: number[] } {
  const n = y.length, p = x[0]?.length ?? 0;
  return withBuffers([flatten(x.slice(0, n), p), y], [1 + p], (m, [xs, ys, out]) => m.ridge_fit(xs, ys, n, p, lambda, out), ([out]) => ({ intercept: out[0], coefficients: Array.from(out.subarray(1)) }));
}
/* The penalty with the lowest mean squared leave-one-out error (PRESS; ties keep the stronger penalty), its fit, and its mean absolute
   leave-one-out error. Squared error ranks penalties more smoothly than absolute error on integer ratings.
   With X'X = V D V' and U = X V, each penalty costs O(n p): the fit is ȳ + U (z / (d + λ)) with z = V'X'y, the leverage is
   1/n + Σ U² / (d + λ), and the exact leave-one-out residual of this linear smoother is e / (1 - leverage). */
export function ridgeSelect(x: number[][], y: number[], lambdas: readonly number[]): { lambda: number; loo: number; intercept: number; coefficients: number[] } {
  const n = y.length, p = x[0]?.length ?? 0, sorted = [...lambdas].sort((a, b) => b - a);
  return withBuffers([flatten(x.slice(0, n), p), y, sorted], [3 + p], (m, [xs, ys, ls, out]) => m.ridge_select(xs, ys, n, p, ls, sorted.length, out),
    ([out]) => ({ lambda: out[0], loo: out[1], intercept: out[2], coefficients: Array.from(out.subarray(3)) }));
}
/* Mean absolute leave-one-out error, in closed form. */
export function ridgeLoo(x: number[][], y: number[], lambda: number): number { return ridgeSelect(x, y, [lambda]).loo; }

/* k-means++ seeding, then Lloyd iterations. Fewer than k distinct points give fewer centroids; an empty cluster keeps its centroid. */
export function kMeans(points: number[][], k: number, random: () => number, maxIterations = 50): { centroids: number[][]; labels: number[] } {
  const n = points.length, d = points[0]?.length ?? 0;
  if (!n || k < 1) return { centroids: [], labels: points.map(() => 0) };
  const previous = draw; draw = random;
  try {
    return withBuffers([flatten(points, d)], [n * d, n], (m, [ps, centroids, labels]) => m.k_means(ps, n, d, k, maxIterations, centroids, labels),
      ([centroids, labels], count) => ({ centroids: Array.from({ length: count as number }, (_, c) => Array.from(centroids.subarray(c * d, c * d + d))), labels: Array.from(labels) }));
  } finally { draw = previous; }
}
/* Mean silhouette width (Euclidean) of several labelings of the same points; each pairwise distance is computed once.
   A point alone in its cluster scores 0, and so does a labeling with a single cluster. */
export function silhouettes(points: number[][], labelings: number[][]): number[] {
  const n = points.length, d = points[0]?.length ?? 0, flat = new Float64Array(labelings.length * n);
  labelings.forEach((labels, c) => { for (let i = 0; i < n; i++) flat[c * n + i] = labels[i]; });
  return withBuffers([flatten(points, d), flat], [labelings.length], (m, [ps, ls, out]) => m.silhouettes(ps, n, d, ls, labelings.length, out), ([out]) => Array.from(out));
}
export function silhouette(points: number[][], labels: number[]): number { return silhouettes(points, [labels])[0]; }

/* Lasso and elastic net by cyclic coordinate descent on the covariance form, for standardized columns.
   Minimizes 1/(2n) Σ (y - b0 - x·β)² + λ (α Σ|β| + (1 - α)/2 Σ β²): alpha 1 is the lasso, 0 < alpha < 1 the elastic net. */
export interface PenalizedFit { intercept: number; coefficients: number[]; lambda: number }
export function penalizedFit(x: number[][], y: number[], lambda: number, alpha: number): PenalizedFit {
  const n = y.length, p = x[0]?.length ?? 0;
  if (!n || !p) return { intercept: n ? y.reduce((a, b) => a + b, 0) / n : 0, coefficients: new Array(p).fill(0), lambda };
  return withBuffers([flatten(x.slice(0, n), p), y], [1 + p], (m, [xs, ys, out]) => m.penalized_fit(xs, ys, n, p, lambda, alpha, out), ([out]) => ({ intercept: out[0], coefficients: Array.from(out.subarray(1)), lambda }));
}
/* The penalty with the lowest squared error over `folds` interleaved folds, from a descending grid of `steps` values that starts where every
   coefficient is zero; ties keep the stronger penalty. Fold moments come from the totals, so each fold costs O(p²) before its descent.
   The grid factors are computed here, so the power function is the same one the TypeScript version used. */
export function penalizedSelect(x: number[][], y: number[], alpha: number, folds = 5, steps = 12, floor = 1e-3): PenalizedFit {
  const n = y.length, p = x[0]?.length ?? 0;
  if (!n || !p) return { intercept: n ? y.reduce((a, b) => a + b, 0) / n : 0, coefficients: new Array(p).fill(0), lambda: 0 };
  const factors = Array.from({ length: steps }, (_, i) => floor ** (i / (steps - 1)));
  return withBuffers([flatten(x.slice(0, n), p), y, factors], [2 + p], (m, [xs, ys, fs, out]) => m.penalized_select(xs, ys, n, p, alpha, folds, fs, steps, out),
    ([out]) => ({ intercept: out[0], coefficients: Array.from(out.subarray(2)), lambda: out[1] }));
}

/* Pearson correlations between columns, and the variance inflation factor of each (the diagonal of the inverse correlation matrix).
   A column without variation has no correlation (null) and no factor. */
export function collinearity(x: number[][]): { correlation: Array<Array<number | null>>; vif: Array<number | null> } {
  const n = x.length, p = x[0]?.length ?? 0;
  return withBuffers([flatten(x, p)], [p + p * p + p], (m, [xs, out]) => m.collinearity(xs, n, p, out), ([out]) => {
    const live = (j: number) => out[j] === 1;
    return { correlation: Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => live(a) && live(b) ? out[p + a * p + b] : null)), vif: Array.from({ length: p }, (_, j) => live(j) ? out[p + p * p + j] : null) };
  });
}
