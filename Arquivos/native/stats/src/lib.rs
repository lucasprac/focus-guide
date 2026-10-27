//! Numerical kernels of the insight engine: ridge regression, the lasso and elastic net, collinearity, k-means++ and silhouettes.
//! `src/shared/insight-stats.ts` calls these through WebAssembly in the main process, its worker, the renderer and the browser preview.
//!
//! Every kernel repeats the TypeScript version it replaced operation for operation (the same loops, the same order of
//! additions, the same guards), so the results are bit for bit the same: WebAssembly has IEEE 754 doubles, Rust never fuses
//! a multiply and an add, and the kernels use only +, −, ×, ÷ and √, which are correctly rounded on both sides.
//! `js_max` and `js_min` copy Math.max and Math.min (NaN wins, +0 beats −0), and `truthy` copies a JavaScript `if (value)`.
//!
//! Matrices are row-major `f64` buffers that the caller allocates with `stats_alloc` and frees with `stats_free`.

use std::slice;

#[link(wasm_import_module = "env")]
extern "C" {
    /// The caller's random number generator (mulberry32 in the engine), so k-means++ draws the same stream as before.
    fn stats_random() -> f64;
}

fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() { f64::NAN } else if a > b { a } else if b > a { b } else if a.is_sign_negative() { b } else { a }
}
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() { f64::NAN } else if a < b { a } else if b < a { b } else if a.is_sign_negative() { a } else { b }
}
fn truthy(v: f64) -> bool { v == v && v != 0.0 }

#[no_mangle]
pub extern "C" fn stats_alloc(len: usize) -> *mut f64 {
    let mut buffer = vec![0.0f64; len.max(1)];
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}
/// # Safety
/// `pointer` and `len` must come from one `stats_alloc` call, and the buffer must not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn stats_free(pointer: *mut f64, len: usize) {
    let len = len.max(1);
    drop(Vec::from_raw_parts(pointer, len, len));
}

unsafe fn input<'a>(pointer: *const f64, len: usize) -> &'a [f64] { if len == 0 { &[] } else { slice::from_raw_parts(pointer, len) } }
unsafe fn output<'a>(pointer: *mut f64, len: usize) -> &'a mut [f64] { if len == 0 { &mut [] } else { slice::from_raw_parts_mut(pointer, len) } }

/* Ridge regression on centred columns: the intercept is not penalized. */
struct RidgeSetup { n: usize, p: usize, means: Vec<f64>, mean_y: f64, centred: Vec<f64>, gram: Vec<f64>, xty: Vec<f64> }
fn ridge_setup(x: &[f64], y: &[f64], n: usize, p: usize) -> RidgeSetup {
    let nf = n as f64;
    let (mut means, mut centred, mut gram, mut xty) = (vec![0.0; p], vec![0.0; n * p], vec![0.0; p * p], vec![0.0; p]);
    let mean_y = if n > 0 { y.iter().fold(0.0, |sum, v| sum + v) / nf } else { 0.0 };
    for i in 0..n { for j in 0..p { means[j] += x[i * p + j] / nf; } }
    for i in 0..n {
        let row = i * p;
        let dy = y[i] - mean_y;
        for j in 0..p { let v = x[row + j] - means[j]; centred[row + j] = v; xty[j] += v * dy; }
        for j in 0..p { let v = centred[row + j]; if truthy(v) { for k in 0..=j { gram[j * p + k] += v * centred[row + k]; } } }
    }
    RidgeSetup { n, p, means, mean_y, centred, gram, xty }
}
/* Lower Cholesky factor of gram + lambda I. A tiny jitter keeps constant or collinear columns solvable. */
fn cholesky(s: &RidgeSetup, lambda: f64) -> Vec<f64> {
    let p = s.p;
    let mut l = vec![0.0; p * p];
    for j in 0..p { for k in 0..=j {
        let mut sum = s.gram[j * p + k] + if j == k { lambda + 1e-10 } else { 0.0 };
        for m in 0..k { sum -= l[j * p + m] * l[k * p + m]; }
        l[j * p + k] = if j == k { js_max(sum, 1e-12).sqrt() } else { sum / l[k * p + k] };
    } }
    l
}
fn coefficients_of(s: &RidgeSetup, l: &[f64]) -> Vec<f64> {
    let p = s.p;
    let mut v = vec![0.0; p];
    for j in 0..p { let mut sum = s.xty[j]; for k in 0..j { sum -= l[j * p + k] * v[k]; } v[j] = sum / l[j * p + j]; }
    let mut beta = vec![0.0; p];
    for j in (0..p).rev() { let mut sum = v[j]; for k in j + 1..p { sum -= l[k * p + j] * beta[k]; } beta[j] = sum / l[j * p + j]; }
    beta
}
fn intercept_of(mean_y: f64, beta: &[f64], means: &[f64]) -> f64 {
    mean_y - beta.iter().zip(means).fold(0.0, |sum, (b, m)| sum + b * m)
}

/// out = [intercept, β₁ … βₚ]
///
/// # Safety
/// `x` holds n·p values, `y` n values and `out` 1 + p slots.
#[no_mangle]
pub unsafe extern "C" fn ridge_fit(x: *const f64, y: *const f64, n: usize, p: usize, lambda: f64, out: *mut f64) {
    let s = ridge_setup(input(x, n * p), input(y, n), n, p);
    let beta = coefficients_of(&s, &cholesky(&s, lambda));
    let out = output(out, 1 + p);
    out[0] = intercept_of(s.mean_y, &beta, &s.means);
    out[1..].copy_from_slice(&beta);
}

/* Cyclic Jacobi eigen-decomposition of a symmetric p×p matrix: eigenvalues and eigenvectors (columns). */
fn eigen(matrix: &[f64], p: usize) -> (Vec<f64>, Vec<f64>) {
    let mut a = matrix.to_vec();
    let mut v = vec![0.0; p * p];
    let scale = a.iter().fold(0.0, |sum, x| sum + x * x);
    for i in 0..p { v[i * p + i] = 1.0; }
    for _sweep in 0..60 {
        let mut off = 0.0;
        for i in 0..p { for j in i + 1..p { off += a[i * p + j] * a[i * p + j]; } }
        if off <= 1e-24 * scale { break; }
        for i in 0..p { for j in i + 1..p {
            let aij = a[i * p + j];
            if !truthy(aij) { continue; }
            let theta = (a[j * p + j] - a[i * p + i]) / (2.0 * aij);
            let t = (if theta >= 0.0 { 1.0 } else { -1.0 }) / (theta.abs() + (theta * theta + 1.0).sqrt());
            let c = 1.0 / (t * t + 1.0).sqrt();
            let s = t * c;
            for k in 0..p { let (x, y) = (a[k * p + i], a[k * p + j]); a[k * p + i] = c * x - s * y; a[k * p + j] = s * x + c * y; }
            for k in 0..p { let (x, y) = (a[i * p + k], a[j * p + k]); a[i * p + k] = c * x - s * y; a[j * p + k] = s * x + c * y; }
            for k in 0..p { let (x, y) = (v[k * p + i], v[k * p + j]); v[k * p + i] = c * x - s * y; v[k * p + j] = s * x + c * y; }
        } }
    }
    ((0..p).map(|i| js_max(0.0, a[i * p + i])).collect(), v)
}

/// The penalty with the lowest mean squared leave-one-out error; `lambdas` arrive sorted from the strongest penalty down.
/// out = [lambda, mean absolute leave-one-out error, intercept, β₁ … βₚ]
///
/// # Safety
/// `x` holds n·p values, `y` n values, `lambdas` count values and `out` 3 + p slots.
#[no_mangle]
pub unsafe extern "C" fn ridge_select(x: *const f64, y: *const f64, n: usize, p: usize, lambdas: *const f64, count: usize, out: *mut f64) {
    let (x, y, lambdas) = (input(x, n * p), input(y, n), input(lambdas, count));
    let s = ridge_setup(x, y, n, p);
    let mut full = vec![0.0; p * p];
    for j in 0..p { for k in 0..=j { let g = s.gram[j * p + k]; full[j * p + k] = g; full[k * p + j] = g; } }
    let (values, vectors) = eigen(&full, p);
    let (mut u, mut z, mut shrink, mut weights) = (vec![0.0; n * p], vec![0.0; p], vec![0.0; p], vec![0.0; p]);
    for i in 0..n { for k in 0..p { let value = s.centred[i * p + k]; if truthy(value) { for j in 0..p { u[i * p + j] += value * vectors[k * p + j]; } } } }
    for j in 0..p { for k in 0..p { z[j] += vectors[k * p + j] * s.xty[k]; } }
    let nf = s.n as f64;
    let (mut best_lambda, mut best_loo, mut best_press) = (0.0, f64::INFINITY, f64::INFINITY);
    for &lambda in lambdas {
        for j in 0..p { shrink[j] = 1.0 / (values[j] + lambda + 1e-10); weights[j] = z[j] * shrink[j]; }
        let (mut total, mut squares) = (0.0, 0.0);
        for i in 0..n {
            let (mut fitted, mut leverage) = (s.mean_y, 1.0 / nf);
            for j in 0..p { let value = u[i * p + j]; fitted += value * weights[j]; leverage += value * value * shrink[j]; }
            let error = ((y[i] - fitted) / js_max(1.0 - leverage, 1e-9)).abs();
            total += error; squares += error * error;
        }
        let (loo, press) = if n > 0 { (total / nf, squares / nf) } else { (0.0, 0.0) };
        if press < best_press - 1e-12 { best_lambda = lambda; best_loo = loo; best_press = press; }
    }
    let mut beta = vec![0.0; p];
    for k in 0..p { for j in 0..p { beta[k] += vectors[k * p + j] * z[j] / (values[j] + best_lambda + 1e-10); } }
    let out = output(out, 3 + p);
    out[0] = best_lambda;
    out[1] = if best_loo.is_finite() { best_loo } else { 0.0 };
    out[2] = intercept_of(s.mean_y, &beta, &s.means);
    out[3..].copy_from_slice(&beta);
}

/* Lasso and elastic net by cyclic coordinate descent on the covariance form, for standardized columns.
   Minimizes 1/(2n) Σ (y - b0 - x·β)² + λ (α Σ|β| + (1 - α)/2 Σ β²): alpha 1 is the lasso, 0 < alpha < 1 the elastic net. */
struct Moments { m: f64, sums: Vec<f64>, sum_y: f64, cross: Vec<f64>, cross_y: Vec<f64> }
fn moments_of(x: &[f64], y: &[f64], p: usize, rows: impl Iterator<Item = usize>) -> Moments {
    let (mut sums, mut cross, mut cross_y, mut sum_y, mut m) = (vec![0.0; p], vec![0.0; p * p], vec![0.0; p], 0.0, 0usize);
    for r in rows {
        let (row, target) = (&x[r * p..r * p + p], y[r]);
        sum_y += target; m += 1;
        for j in 0..p { let v = row[j]; sums[j] += v; cross_y[j] += v * target; if truthy(v) { for k in 0..=j { cross[j * p + k] += v * row[k]; } } }
    }
    Moments { m: m as f64, sums, sum_y, cross, cross_y }
}
fn without_moments(all: &Moments, part: &Moments) -> Moments {
    let minus = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a, b)| a - b).collect();
    Moments { m: all.m - part.m, sums: minus(&all.sums, &part.sums), sum_y: all.sum_y - part.sum_y, cross: minus(&all.cross, &part.cross), cross_y: minus(&all.cross_y, &part.cross_y) }
}
struct Centred { gram: Vec<f64>, c: Vec<f64>, mean_x: Vec<f64>, mean_y: f64 }
fn centred_of(s: &Moments, p: usize) -> Centred {
    let m = s.m;
    let (mut gram, mut c) = (vec![0.0; p * p], vec![0.0; p]);
    let mean_x: Vec<f64> = s.sums.iter().map(|v| v / m).collect();
    let mean_y = s.sum_y / m;
    for j in 0..p {
        c[j] = s.cross_y[j] / m - mean_x[j] * mean_y;
        for k in 0..=j { let g = s.cross[j * p + k] / m - mean_x[j] * mean_x[k]; gram[j * p + k] = g; gram[k * p + j] = g; }
    }
    Centred { gram, c, mean_x, mean_y }
}
/* Coordinate descent from `beta` (updated in place) at one penalty. */
fn descend(s: &Centred, p: usize, lambda: f64, alpha: f64, beta: &mut [f64]) {
    let (l1, l2) = (lambda * alpha, lambda * (1.0 - alpha));
    for _sweep in 0..300 {
        let mut change = 0.0;
        for j in 0..p {
            let diagonal = s.gram[j * p + j];
            if diagonal < 1e-12 { beta[j] = 0.0; continue; }
            let mut r = s.c[j];
            for k in 0..p { if k != j && truthy(beta[k]) { r -= s.gram[j * p + k] * beta[k]; } }
            let next = (if r > l1 { r - l1 } else if r < -l1 { r + l1 } else { 0.0 }) / (diagonal + l2);
            change = js_max(change, (next - beta[j]).abs());
            beta[j] = next;
        }
        if change < 1e-8 { break; }
    }
}

/// out = [intercept, β₁ … βₚ]; the caller handles n = 0 or p = 0.
///
/// # Safety
/// `x` holds n·p values, `y` n values and `out` 1 + p slots.
#[no_mangle]
pub unsafe extern "C" fn penalized_fit(x: *const f64, y: *const f64, n: usize, p: usize, lambda: f64, alpha: f64, out: *mut f64) {
    let (x, y) = (input(x, n * p), input(y, n));
    let s = centred_of(&moments_of(x, y, p, 0..n), p);
    let mut beta = vec![0.0; p];
    descend(&s, p, lambda, alpha, &mut beta);
    let out = output(out, 1 + p);
    out[0] = intercept_of(s.mean_y, &beta, &s.mean_x);
    out[1..].copy_from_slice(&beta);
}

/// The penalty with the lowest squared error over `folds` interleaved folds. The grid is `top × factors[g]`, where top is the
/// penalty that sets every coefficient to zero; the caller computes the factors (floor ** (g / (steps − 1))) so that no
/// power function from another math library enters the result. Ties keep the stronger penalty.
/// out = [intercept, lambda, β₁ … βₚ]; the caller handles n = 0 or p = 0.
///
/// # Safety
/// `x` holds n·p values, `y` n values, `factors` steps values and `out` 2 + p slots.
#[no_mangle]
pub unsafe extern "C" fn penalized_select(x: *const f64, y: *const f64, n: usize, p: usize, alpha: f64, folds: usize, factors: *const f64, steps: usize, out: *mut f64) {
    let (x, y, factors, out) = (input(x, n * p), input(y, n), input(factors, steps), output(out, 2 + p));
    let all = moments_of(x, y, p, 0..n);
    let full = centred_of(&all, p);
    let top = full.c.iter().fold(f64::NEG_INFINITY, |best, c| js_max(best, c.abs())) / alpha;
    if !(top > 1e-12) {
        out[0] = full.mean_y; out[1] = 0.0;
        for v in &mut out[2..] { *v = 0.0; }
        return;
    }
    let grid: Vec<f64> = factors.iter().map(|f| top * f).collect();
    let k = folds.min(n);
    let mut errors = vec![0.0; steps];
    for f in 0..k {
        let held: Vec<usize> = (0..(n - f + k - 1) / k).map(|i| f + i * k).collect();
        let train = centred_of(&without_moments(&all, &moments_of(x, y, p, held.iter().copied())), p);
        let mut beta = vec![0.0; p];
        for (g, &lambda) in grid.iter().enumerate() {
            descend(&train, p, lambda, alpha, &mut beta);
            let intercept = intercept_of(train.mean_y, &beta, &train.mean_x);
            for &i in &held {
                let mut fitted = intercept;
                for j in 0..p { fitted += beta[j] * x[i * p + j]; }
                let residual = y[i] - fitted;
                errors[g] += residual * residual;
            }
        }
    }
    let mut best = 0;
    for g in 1..steps { if errors[g] < errors[best] - 1e-12 { best = g; } }
    let mut beta = vec![0.0; p];
    for &lambda in &grid[..=best] { descend(&full, p, lambda, alpha, &mut beta); }
    out[0] = intercept_of(full.mean_y, &beta, &full.mean_x);
    out[1] = grid[best];
    out[2..].copy_from_slice(&beta);
}

/// Pearson correlations between columns and the variance inflation factor of each (the diagonal of the inverse correlation matrix).
/// out = [live₁ … liveₚ (1 when the column varies), correlation (p × p), vif (p)]; the caller turns entries of columns that do not vary into null.
///
/// # Safety
/// `x` holds n·p values and `out` p + p² + p slots.
#[no_mangle]
pub unsafe extern "C" fn collinearity(x: *const f64, n: usize, p: usize, out: *mut f64) {
    let (x, out) = (input(x, n * p), output(out, p + p * p + p));
    let nf = n as f64;
    let means: Vec<f64> = (0..p).map(|j| (0..n).fold(0.0, |sum, r| sum + x[r * p + j]) / nf).collect();
    let sds: Vec<f64> = (0..p).map(|j| ((0..n).fold(0.0, |sum, r| { let d = x[r * p + j] - means[j]; sum + d * d }) / nf).sqrt()).collect();
    let live: Vec<usize> = (0..p).filter(|&j| sds[j] > 1e-9).collect();
    let m = live.len();
    let (flags, rest) = out.split_at_mut(p);
    let (correlation, vif) = rest.split_at_mut(p * p);
    for j in 0..p { flags[j] = 0.0; vif[j] = 0.0; }
    for &j in &live { flags[j] = 1.0; }
    let mut inverse = vec![vec![0.0; 2 * m]; m];
    for (i, &a) in live.iter().enumerate() { for (j, &b) in live.iter().enumerate() {
        if j < i { continue; }
        let mut sum = 0.0;
        for r in 0..n { sum += (x[r * p + a] - means[a]) * (x[r * p + b] - means[b]); }
        let value = js_max(-1.0, js_min(1.0, sum / nf / (sds[a] * sds[b])));
        inverse[i][j] = value; inverse[j][i] = value;
        correlation[a * p + b] = value; correlation[b * p + a] = value;
    } }
    // Gauss–Jordan inverse with partial pivoting; a tiny ridge keeps an exactly collinear set invertible.
    for i in 0..m { inverse[i][i] += 1e-9; inverse[i][m + i] = 1.0; }
    for c in 0..m {
        let mut pivot = c;
        for r in c + 1..m { if inverse[r][c].abs() > inverse[pivot][c].abs() { pivot = r; } }
        inverse.swap(c, pivot);
        let lead = inverse[c][c];
        for j in 0..2 * m { inverse[c][j] /= lead; }
        for r in 0..m {
            if r == c { continue; }
            let factor = inverse[r][c];
            if truthy(factor) { for j in 0..2 * m { let v = inverse[c][j]; inverse[r][j] -= factor * v; } }
        }
    }
    for (i, &j) in live.iter().enumerate() { vif[j] = js_min(1e6, js_max(1.0, inverse[i][m + i])); }
}

fn nearest(flat: &[f64], i: usize, centroids: &[f64], k: usize, d: usize) -> usize {
    let (mut best, mut best_distance) = (0, f64::INFINITY);
    for c in 0..k {
        let mut sum = 0.0;
        for j in 0..d { let diff = flat[i * d + j] - centroids[c * d + j]; sum += diff * diff; }
        if sum < best_distance { best_distance = sum; best = c; }
    }
    best
}
/// k-means++ seeding with `stats_random`, then Lloyd iterations. Returns the number of centroids, at most n.
/// out_centroids holds n·d slots (the first count·d are used), out_labels n slots. The caller handles n = 0 or k < 1.
///
/// # Safety
/// `points` holds n·d values, `out_centroids` n·d slots and `out_labels` n slots.
#[no_mangle]
pub unsafe extern "C" fn k_means(points: *const f64, n: usize, d: usize, k: f64, max_iterations: f64, out_centroids: *mut f64, out_labels: *mut f64) -> usize {
    let flat = input(points, n * d);
    let nf = n as f64;
    let mut chosen = vec![js_min(nf - 1.0, (stats_random() * nf).floor()) as usize];
    let mut distances = vec![f64::INFINITY; n];
    loop {
        let last = *chosen.last().unwrap();
        let mut total = 0.0;
        for i in 0..n {
            let mut sum = 0.0;
            for j in 0..d { let diff = flat[i * d + j] - flat[last * d + j]; sum += diff * diff; }
            if sum < distances[i] { distances[i] = sum; }
            total += distances[i];
        }
        if chosen.len() as f64 >= k || total <= 0.0 { break; }
        let mut target = stats_random() * total;
        let mut pick = usize::MAX;
        for i in 0..n { if distances[i] > 0.0 { pick = i; target -= distances[i]; if target <= 0.0 { break; } } }
        if pick == usize::MAX { break; }
        chosen.push(pick);
    }
    let count = chosen.len();
    let (mut centroids, mut labels, mut sums, mut sizes) = (vec![0.0; count * d], vec![-1i64; n], vec![0.0; count * d], vec![0usize; count]);
    for (c, &index) in chosen.iter().enumerate() { for j in 0..d { centroids[c * d + j] = flat[index * d + j]; } }
    let mut iteration = 0.0;
    loop {
        let mut changed = false;
        for i in 0..n { let c = nearest(flat, i, &centroids, count, d) as i64; if c != labels[i] { labels[i] = c; changed = true; } }
        if !changed || iteration >= max_iterations { break; }
        sums.iter_mut().for_each(|v| *v = 0.0);
        sizes.iter_mut().for_each(|v| *v = 0);
        for i in 0..n { let c = labels[i] as usize; sizes[c] += 1; for j in 0..d { sums[c * d + j] += flat[i * d + j]; } }
        for c in 0..count { if sizes[c] > 0 { for j in 0..d { centroids[c * d + j] = sums[c * d + j] / sizes[c] as f64; } } }
        iteration += 1.0;
    }
    output(out_centroids, n * d)[..count * d].copy_from_slice(&centroids);
    for (slot, &label) in output(out_labels, n).iter_mut().zip(&labels) { *slot = label as f64; }
    count
}

/// Mean silhouette width (Euclidean) of `count` labelings of the same n points, stored one after another in `labelings`;
/// each pairwise distance is computed once. Labels are whole numbers from 0. out holds count slots.
///
/// # Safety
/// `points` holds n·d values, `labelings` count·n values and `out` count slots.
#[no_mangle]
pub unsafe extern "C" fn silhouettes(points: *const f64, n: usize, d: usize, labelings: *const f64, count: usize, out: *mut f64) {
    let (flat, all, out) = (input(points, n * d), input(labelings, count * n), output(out, count));
    let labels_of = |c: usize| -> Vec<usize> { all[c * n..c * n + n].iter().map(|&v| v as usize).collect() };
    let labels: Vec<Vec<usize>> = (0..count).map(labels_of).collect();
    let ks: Vec<usize> = labels.iter().map(|l| if n > 0 { l.iter().copied().max().unwrap_or(0) + 1 } else { 0 }).collect();
    let sizes: Vec<Vec<usize>> = labels.iter().zip(&ks).map(|(l, &k)| { let mut size = vec![0; k]; for &label in l { size[label] += 1; } size }).collect();
    let mut sums: Vec<Vec<f64>> = ks.iter().map(|&k| vec![0.0; n * k]).collect();
    for i in 0..n { for m in i + 1..n {
        let mut sum = 0.0;
        for j in 0..d { let diff = flat[i * d + j] - flat[m * d + j]; sum += diff * diff; }
        let distance = sum.sqrt();
        for c in 0..count { let k = ks[c]; let total = &mut sums[c]; total[i * k + labels[c][m]] += distance; total[m * k + labels[c][i]] += distance; }
    } }
    for c in 0..count {
        let (k, size, total, labels) = (ks[c], &sizes[c], &sums[c], &labels[c]);
        if n < 2 || size.iter().filter(|&&s| s > 0).count() < 2 { out[c] = 0.0; continue; }
        let mut score = 0.0;
        for i in 0..n {
            let own = labels[i];
            if size[own] < 2 { continue; }
            let a = total[i * k + own] / (size[own] - 1) as f64;
            let mut b = f64::INFINITY;
            for other in 0..k { if other != own && size[other] > 0 { b = js_min(b, total[i * k + other] / size[other] as f64); } }
            let scale = js_max(a, b);
            if scale > 0.0 { score += (b - a) / scale; }
        }
        out[c] = score / n as f64;
    }
}
