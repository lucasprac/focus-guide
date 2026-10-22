/* Numerical methods for the insight engine: seeded random numbers, intervals, Kaplan–Meier, ridge regression,
   k-means++ and silhouette. Pure and deterministic, with no dependencies. Every interval is a 90 % interval. */
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

/* Ridge regression on centred columns: the intercept is not penalized. Columns are used as given (standardize first). */
interface RidgeSetup { n: number; p: number; means: Float64Array; meanY: number; centred: Float64Array; gram: Float64Array; xty: Float64Array; y: Float64Array }
function ridgeSetup(x: number[][], y: number[]): RidgeSetup {
  const n = y.length, p = x[0]?.length ?? 0, means = new Float64Array(p), centred = new Float64Array(n * p), gram = new Float64Array(p * p), xty = new Float64Array(p);
  const meanY = n ? y.reduce((sum, v) => sum + v, 0) / n : 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) means[j] += x[i][j] / n;
  for (let i = 0; i < n; i++) {
    const row = i * p, dy = y[i] - meanY;
    for (let j = 0; j < p; j++) { const v = x[i][j] - means[j]; centred[row + j] = v; xty[j] += v * dy; }
    for (let j = 0; j < p; j++) { const v = centred[row + j]; if (v) for (let k = 0; k <= j; k++) gram[j * p + k] += v * centred[row + k]; }
  }
  return { n, p, means, meanY, centred, gram, xty, y: Float64Array.from(y) };
}
/* Lower Cholesky factor of gram + lambda I. A tiny jitter keeps constant or collinear columns solvable. */
function cholesky(s: RidgeSetup, lambda: number): Float64Array {
  const { p, gram } = s, l = new Float64Array(p * p);
  for (let j = 0; j < p; j++) for (let k = 0; k <= j; k++) {
    let sum = gram[j * p + k] + (j === k ? lambda + 1e-10 : 0);
    for (let m = 0; m < k; m++) sum -= l[j * p + m] * l[k * p + m];
    l[j * p + k] = j === k ? Math.sqrt(Math.max(sum, 1e-12)) : sum / l[k * p + k];
  }
  return l;
}
function forward(l: Float64Array, p: number, b: ArrayLike<number>): Float64Array {
  const v = new Float64Array(p);
  for (let j = 0; j < p; j++) { let sum = b[j]; for (let k = 0; k < j; k++) sum -= l[j * p + k] * v[k]; v[j] = sum / l[j * p + j]; }
  return v;
}
function coefficientsOf(s: RidgeSetup, l: Float64Array): Float64Array {
  const { p } = s, v = forward(l, p, s.xty), beta = new Float64Array(p);
  for (let j = p - 1; j >= 0; j--) { let sum = v[j]; for (let k = j + 1; k < p; k++) sum -= l[k * p + j] * beta[k]; beta[j] = sum / l[j * p + j]; }
  return beta;
}
const fitOf = (s: RidgeSetup, beta: Float64Array) => ({ intercept: s.meanY - beta.reduce((sum, b, j) => sum + b * s.means[j], 0), coefficients: [...beta] });
export function ridgeFit(x: number[][], y: number[], lambda: number): { intercept: number; coefficients: number[] } {
  const s = ridgeSetup(x, y); return fitOf(s, coefficientsOf(s, cholesky(s, lambda)));
}
/* Cyclic Jacobi eigen-decomposition of a symmetric p×p matrix: eigenvalues and eigenvectors (columns). */
function eigen(matrix: Float64Array, p: number): { values: Float64Array; vectors: Float64Array } {
  const a = Float64Array.from(matrix), v = new Float64Array(p * p), scale = a.reduce((sum, x) => sum + x * x, 0);
  for (let i = 0; i < p; i++) v[i * p + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += a[i * p + j] ** 2;
    if (off <= 1e-24 * scale) break;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
      const aij = a[i * p + j]; if (!aij) continue;
      const theta = (a[j * p + j] - a[i * p + i]) / (2 * aij), t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < p; k++) { const x = a[k * p + i], y = a[k * p + j]; a[k * p + i] = c * x - s * y; a[k * p + j] = s * x + c * y; }
      for (let k = 0; k < p; k++) { const x = a[i * p + k], y = a[j * p + k]; a[i * p + k] = c * x - s * y; a[j * p + k] = s * x + c * y; }
      for (let k = 0; k < p; k++) { const x = v[k * p + i], y = v[k * p + j]; v[k * p + i] = c * x - s * y; v[k * p + j] = s * x + c * y; }
    }
  }
  return { values: Float64Array.from({ length: p }, (_, i) => Math.max(0, a[i * p + i])), vectors: v };
}
/* The penalty with the lowest mean squared leave-one-out error (PRESS; ties keep the stronger penalty), its fit, and its mean absolute
   leave-one-out error. Squared error ranks penalties more smoothly than absolute error on integer ratings.
   With X'X = V D V' and U = X V, each penalty costs O(n p): the fit is ȳ + U (z / (d + λ)) with z = V'X'y, the leverage is
   1/n + Σ U² / (d + λ), and the exact leave-one-out residual of this linear smoother is e / (1 - leverage). */
export function ridgeSelect(x: number[][], y: number[], lambdas: readonly number[]): { lambda: number; loo: number; intercept: number; coefficients: number[] } {
  const s = ridgeSetup(x, y), { n, p } = s, full = new Float64Array(p * p);
  for (let j = 0; j < p; j++) for (let k = 0; k <= j; k++) full[j * p + k] = full[k * p + j] = s.gram[j * p + k];
  const { values, vectors } = eigen(full, p), u = new Float64Array(n * p), z = new Float64Array(p), shrink = new Float64Array(p), weights = new Float64Array(p);
  for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) { const value = s.centred[i * p + k]; if (value) for (let j = 0; j < p; j++) u[i * p + j] += value * vectors[k * p + j]; }
  for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) z[j] += vectors[k * p + j] * s.xty[k];
  const scores = [...lambdas].sort((a, b) => b - a).map(lambda => {
    for (let j = 0; j < p; j++) { shrink[j] = 1 / (values[j] + lambda + 1e-10); weights[j] = z[j] * shrink[j]; }
    let total = 0, squares = 0;
    for (let i = 0; i < n; i++) {
      let fitted = s.meanY, leverage = 1 / n;
      for (let j = 0; j < p; j++) { const value = u[i * p + j]; fitted += value * weights[j]; leverage += value * value * shrink[j]; }
      const error = Math.abs((s.y[i] - fitted) / Math.max(1 - leverage, 1e-9)); total += error; squares += error * error;
    }
    return { lambda, loo: n ? total / n : 0, press: n ? squares / n : 0 };
  });
  const best = scores.reduce<{ lambda: number; loo: number; press: number }>((low, score) => score.press < low.press - 1e-12 ? score : low, { lambda: 0, loo: Infinity, press: Infinity });
  const beta = new Float64Array(p);
  for (let k = 0; k < p; k++) for (let j = 0; j < p; j++) beta[k] += vectors[k * p + j] * z[j] / (values[j] + best.lambda + 1e-10);
  return { lambda: best.lambda, loo: Number.isFinite(best.loo) ? best.loo : 0, ...fitOf(s, beta) };
}
/* Mean absolute leave-one-out error, in closed form. */
export function ridgeLoo(x: number[][], y: number[], lambda: number): number { return ridgeSelect(x, y, [lambda]).loo; }

function nearest(flat: Float64Array, i: number, centroids: Float64Array, k: number, d: number): number {
  let best = 0, bestDistance = Infinity;
  for (let c = 0; c < k; c++) { let sum = 0; for (let j = 0; j < d; j++) { const diff = flat[i * d + j] - centroids[c * d + j]; sum += diff * diff; } if (sum < bestDistance) { bestDistance = sum; best = c; } }
  return best;
}
/* k-means++ seeding, then Lloyd iterations. Fewer than k distinct points give fewer centroids; an empty cluster keeps its centroid. */
export function kMeans(points: number[][], k: number, random: () => number, maxIterations = 50): { centroids: number[][]; labels: number[] } {
  const n = points.length, d = points[0]?.length ?? 0;
  if (!n || k < 1) return { centroids: [], labels: points.map(() => 0) };
  const flat = new Float64Array(n * d); points.forEach((point, i) => point.forEach((v, j) => { flat[i * d + j] = v; }));
  const chosen = [Math.min(n - 1, Math.floor(random() * n))], distances = new Float64Array(n).fill(Infinity);
  while (true) {
    const last = chosen[chosen.length - 1]; let total = 0;
    for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < d; j++) { const diff = flat[i * d + j] - flat[last * d + j]; sum += diff * diff; } if (sum < distances[i]) distances[i] = sum; total += distances[i]; }
    if (chosen.length >= k || total <= 0) break;
    let target = random() * total, pick = -1;
    for (let i = 0; i < n; i++) if (distances[i] > 0) { pick = i; target -= distances[i]; if (target <= 0) break; }
    chosen.push(pick);
  }
  const count = chosen.length, centroids = new Float64Array(count * d), labels = new Int32Array(n).fill(-1), sums = new Float64Array(count * d), sizes = new Int32Array(count);
  chosen.forEach((index, c) => { for (let j = 0; j < d; j++) centroids[c * d + j] = flat[index * d + j]; });
  for (let iteration = 0; ; iteration++) {
    let changed = false;
    for (let i = 0; i < n; i++) { const c = nearest(flat, i, centroids, count, d); if (c !== labels[i]) { labels[i] = c; changed = true; } }
    if (!changed || iteration >= maxIterations) break;
    sums.fill(0); sizes.fill(0);
    for (let i = 0; i < n; i++) { const c = labels[i]; sizes[c]++; for (let j = 0; j < d; j++) sums[c * d + j] += flat[i * d + j]; }
    for (let c = 0; c < count; c++) if (sizes[c]) for (let j = 0; j < d; j++) centroids[c * d + j] = sums[c * d + j] / sizes[c];
  }
  return { centroids: Array.from({ length: count }, (_, c) => Array.from(centroids.subarray(c * d, c * d + d))), labels: Array.from(labels) };
}
/* Mean silhouette width (Euclidean) of several labelings of the same points; each pairwise distance is computed once.
   A point alone in its cluster scores 0, and so does a labeling with a single cluster. */
export function silhouettes(points: number[][], labelings: number[][]): number[] {
  const n = points.length, d = points[0]?.length ?? 0, ks = labelings.map(labels => n ? Math.max(...labels) + 1 : 0);
  const sizes = labelings.map((labels, c) => { const size = new Int32Array(ks[c]); for (const label of labels) size[label]++; return size; });
  const flat = new Float64Array(n * d), sums = ks.map(k => new Float64Array(n * k)), all = labelings.map(labels => Int32Array.from(labels));
  points.forEach((point, i) => point.forEach((v, j) => { flat[i * d + j] = v; }));
  for (let i = 0; i < n; i++) for (let m = i + 1; m < n; m++) {
    let sum = 0; for (let j = 0; j < d; j++) { const diff = flat[i * d + j] - flat[m * d + j]; sum += diff * diff; }
    const distance = Math.sqrt(sum);
    for (let c = 0; c < all.length; c++) { const k = ks[c], labels = all[c], total = sums[c]; total[i * k + labels[m]] += distance; total[m * k + labels[i]] += distance; }
  }
  return all.map((labels, c) => {
    const k = ks[c], size = sizes[c], total = sums[c]; if (n < 2 || size.filter(s => s > 0).length < 2) return 0;
    let score = 0;
    for (let i = 0; i < n; i++) {
      const own = labels[i]; if (size[own] < 2) continue;
      const a = total[i * k + own] / (size[own] - 1); let b = Infinity;
      for (let other = 0; other < k; other++) if (other !== own && size[other]) b = Math.min(b, total[i * k + other] / size[other]);
      const scale = Math.max(a, b); if (scale > 0) score += (b - a) / scale;
    }
    return score / n;
  });
}
export function silhouette(points: number[][], labels: number[]): number { return silhouettes(points, [labels])[0]; }
