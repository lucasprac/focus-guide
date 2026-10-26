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

/* Lasso and elastic net by cyclic coordinate descent on the covariance form, for standardized columns.
   Minimizes 1/(2n) Σ (y - b0 - x·β)² + λ (α Σ|β| + (1 - α)/2 Σ β²): alpha 1 is the lasso, 0 < alpha < 1 the elastic net. */
interface Moments { m: number; p: number; sums: Float64Array; sumY: number; cross: Float64Array; crossY: Float64Array }
function momentsOf(x: number[][], y: number[], rows: ArrayLike<number>): Moments {
  const p = x[0]?.length ?? 0, sums = new Float64Array(p), cross = new Float64Array(p * p), crossY = new Float64Array(p); let sumY = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = x[rows[r]], target = y[rows[r]]; sumY += target;
    for (let j = 0; j < p; j++) { const v = row[j]; sums[j] += v; crossY[j] += v * target; if (v) for (let k = 0; k <= j; k++) cross[j * p + k] += v * row[k]; }
  }
  return { m: rows.length, p, sums, sumY, cross, crossY };
}
const withoutMoments = (all: Moments, part: Moments): Moments => ({ m: all.m - part.m, p: all.p, sums: all.sums.map((v, i) => v - part.sums[i]), sumY: all.sumY - part.sumY, cross: all.cross.map((v, i) => v - part.cross[i]), crossY: all.crossY.map((v, i) => v - part.crossY[i]) });
interface Centred { gram: Float64Array; c: Float64Array; meanX: Float64Array; meanY: number }
function centredOf(s: Moments): Centred {
  const { p, m } = s, gram = new Float64Array(p * p), c = new Float64Array(p), meanX = s.sums.map(v => v / m), meanY = s.sumY / m;
  for (let j = 0; j < p; j++) {
    c[j] = s.crossY[j] / m - meanX[j] * meanY;
    for (let k = 0; k <= j; k++) gram[j * p + k] = gram[k * p + j] = s.cross[j * p + k] / m - meanX[j] * meanX[k];
  }
  return { gram, c, meanX, meanY };
}
/* Coordinate descent from `beta` (updated in place) at one penalty. */
function descend(s: Centred, p: number, lambda: number, alpha: number, beta: Float64Array): void {
  const l1 = lambda * alpha, l2 = lambda * (1 - alpha);
  for (let sweep = 0; sweep < 300; sweep++) {
    let change = 0;
    for (let j = 0; j < p; j++) {
      const diagonal = s.gram[j * p + j]; if (diagonal < 1e-12) { beta[j] = 0; continue; }
      let r = s.c[j]; for (let k = 0; k < p; k++) if (k !== j && beta[k]) r -= s.gram[j * p + k] * beta[k];
      const next = (r > l1 ? r - l1 : r < -l1 ? r + l1 : 0) / (diagonal + l2);
      change = Math.max(change, Math.abs(next - beta[j])); beta[j] = next;
    }
    if (change < 1e-8) break;
  }
}
const interceptOf = (s: Centred, beta: Float64Array) => s.meanY - beta.reduce((sum, b, j) => sum + b * s.meanX[j], 0);
export interface PenalizedFit { intercept: number; coefficients: number[]; lambda: number }
export function penalizedFit(x: number[][], y: number[], lambda: number, alpha: number): PenalizedFit {
  const n = y.length, p = x[0]?.length ?? 0, beta = new Float64Array(p);
  if (!n || !p) return { intercept: n ? y.reduce((a, b) => a + b, 0) / n : 0, coefficients: [...beta], lambda };
  const s = centredOf(momentsOf(x, y, Array.from({ length: n }, (_, i) => i))); descend(s, p, lambda, alpha, beta);
  return { intercept: interceptOf(s, beta), coefficients: [...beta], lambda };
}
/* The penalty with the lowest squared error over `folds` interleaved folds, from a descending grid of `steps` values that starts where every
   coefficient is zero; ties keep the stronger penalty. Fold moments come from the totals, so each fold costs O(p²) before its descent. */
export function penalizedSelect(x: number[][], y: number[], alpha: number, folds = 5, steps = 12, floor = 1e-3): PenalizedFit {
  const n = y.length, p = x[0]?.length ?? 0, all = momentsOf(x, y, Array.from({ length: n }, (_, i) => i));
  if (!n || !p) return { intercept: n ? all.sumY / n : 0, coefficients: new Array(p).fill(0), lambda: 0 };
  const full = centredOf(all), top = Math.max(...Array.from(full.c, Math.abs)) / alpha;
  if (!(top > 1e-12)) return { intercept: full.meanY, coefficients: new Array(p).fill(0), lambda: 0 };
  const grid = Array.from({ length: steps }, (_, i) => top * floor ** (i / (steps - 1))), k = Math.min(folds, n), errors = new Float64Array(steps);
  for (let f = 0; f < k; f++) {
    const held = Array.from({ length: Math.ceil((n - f) / k) }, (_, i) => f + i * k), train = centredOf(withoutMoments(all, momentsOf(x, y, held))), beta = new Float64Array(p);
    grid.forEach((lambda, g) => {
      descend(train, p, lambda, alpha, beta); const intercept = interceptOf(train, beta);
      for (const i of held) { let fitted = intercept; for (let j = 0; j < p; j++) fitted += beta[j] * x[i][j]; errors[g] += (y[i] - fitted) ** 2; }
    });
  }
  let best = 0; for (let g = 1; g < steps; g++) if (errors[g] < errors[best] - 1e-12) best = g;
  const beta = new Float64Array(p); for (let g = 0; g <= best; g++) descend(full, p, grid[g], alpha, beta);
  return { intercept: interceptOf(full, beta), coefficients: [...beta], lambda: grid[best] };
}

/* Pearson correlations between columns, and the variance inflation factor of each (the diagonal of the inverse correlation matrix).
   A column without variation has no correlation (null) and no factor. */
export function collinearity(x: number[][]): { correlation: Array<Array<number | null>>; vif: Array<number | null> } {
  const n = x.length, p = x[0]?.length ?? 0, means = Array.from({ length: p }, (_, j) => x.reduce((sum, row) => sum + row[j], 0) / n);
  const sds = means.map((m, j) => Math.sqrt(x.reduce((sum, row) => sum + (row[j] - m) ** 2, 0) / n)), live = sds.map((sd, j) => sd > 1e-9 ? j : -1).filter(j => j >= 0);
  const correlation: Array<Array<number | null>> = Array.from({ length: p }, () => new Array<number | null>(p).fill(null)), R = live.map(() => new Float64Array(live.length));
  live.forEach((a, i) => live.forEach((b, j) => { if (j < i) return; let sum = 0; for (let r = 0; r < n; r++) sum += (x[r][a] - means[a]) * (x[r][b] - means[b]); const value = Math.max(-1, Math.min(1, sum / n / (sds[a] * sds[b]))); R[i][j] = R[j][i] = value; correlation[a][b] = correlation[b][a] = value; }));
  // Gauss–Jordan inverse with partial pivoting; a tiny ridge keeps an exactly collinear set invertible.
  const m = live.length, inverse = R.map((row, i) => { const out = new Float64Array(2 * m); out.set(row); out[i] += 1e-9; out[m + i] = 1; return out; });
  for (let c = 0; c < m; c++) {
    let pivot = c; for (let r = c + 1; r < m; r++) if (Math.abs(inverse[r][c]) > Math.abs(inverse[pivot][c])) pivot = r;
    [inverse[c], inverse[pivot]] = [inverse[pivot], inverse[c]]; const lead = inverse[c][c]; for (let j = 0; j < 2 * m; j++) inverse[c][j] /= lead;
    for (let r = 0; r < m; r++) if (r !== c) { const factor = inverse[r][c]; if (factor) for (let j = 0; j < 2 * m; j++) inverse[r][j] -= factor * inverse[c][j]; }
  }
  const vif = new Array<number | null>(p).fill(null); live.forEach((j, i) => { vif[j] = Math.min(1e6, Math.max(1, inverse[i][m + i])); });
  return { correlation, vif };
}
