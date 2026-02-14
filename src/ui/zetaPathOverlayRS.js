/**
 * @module ZetaPathOverlayRS
 * @description Renders the ζ(½+it) spiral curve using the Riemann-Siegel formula
 *              This is much more accurate than the naive eta series approach
 * @author Radim Brnka
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {log} from '../global/constants';

// Canvas and state
let canvas = null;
let ctx = null;
let visible = false;
let renderer = null;

// ─────────────────────────────────────────────────────────────────────────────
// Riemann-Siegel Formula Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Riemann-Siegel theta function using Stirling approximation
 * θ(t) = arg(Γ(1/4 + it/2)) - (t/2)·log(π)
 * @param {number} t - The imaginary part of s = ½ + it
 * @returns {number} theta(t)
 */
function theta(t) {
    // Stirling approximation for large t:
    // θ(t) ≈ (t/2)·ln(t/(2π)) - t/2 - π/8 + 1/(48t) + 7/(5760t³) + ...
    if (t < 1) {
        // For very small t, use more terms or fallback
        return (t / 2) * Math.log(Math.max(t, 0.1) / (2 * Math.PI)) - t / 2 - Math.PI / 8;
    }

    const t2 = t * t;
    const t3 = t2 * t;

    return (t / 2) * Math.log(t / (2 * Math.PI))
        - t / 2
        - Math.PI / 8
        + 1 / (48 * t)
        + 7 / (5760 * t3);
}

/**
 * Riemann-Siegel Z function
 * Z(t) = e^(iθ(t)) · ζ(½ + it) is real-valued
 * Z(t) = 2·Σ_{n=1}^{N} n^(-1/2)·cos(θ(t) - t·ln(n)) + R(t)
 * @param {number} t - The imaginary part
 * @returns {number} Z(t)
 */
function Z(t) {
    if (t < 0.5) {
        // For very small t, Z(t) ≈ 2·ζ(½) ≈ -2.93...
        // Use direct computation for stability
        return zetaDirectSmallT(t);
    }

    const N = Math.floor(Math.sqrt(t / (2 * Math.PI)));
    const th = theta(t);

    let sum = 0;
    for (let n = 1; n <= N; n++) {
        sum += Math.cos(th - t * Math.log(n)) / Math.sqrt(n);
    }
    sum *= 2;

    // Remainder term R(t) using Riemann-Siegel coefficients
    const p = Math.sqrt(t / (2 * Math.PI)) - N;
    const R = remainder(p, t, N);

    return sum + R;
}

/**
 * Riemann-Siegel remainder term
 * Uses the first few correction terms for improved accuracy
 * @param {number} p - Fractional part: sqrt(t/(2π)) - N
 * @param {number} t - The t value
 * @param {number} N - The main sum limit
 * @returns {number} Remainder correction
 */
function remainder(p, t, N) {
    // C0(p) approximation using cosine series
    const C0 = C0func(p);

    // (-1)^(N-1) · (t/(2π))^(-1/4) · C0(p)
    const sign = ((N - 1) % 2 === 0) ? 1 : -1;
    const factor = Math.pow(t / (2 * Math.PI), -0.25);

    let R = sign * factor * C0;

    // Higher order corrections for better accuracy
    if (t > 10) {
        const C1 = C1func(p);
        const factor1 = Math.pow(t / (2 * Math.PI), -0.75);
        R += sign * factor1 * C1;
    }

    return R;
}

/**
 * C0 Riemann-Siegel coefficient function
 * C0(p) = cos(2π(p² - p - 1/16)) / cos(2πp)
 * @param {number} p - Fractional parameter
 * @returns {number}
 */
function C0func(p) {
    const cos2pip = Math.cos(2 * Math.PI * p);
    if (Math.abs(cos2pip) < 1e-10) {
        // Near singularity, use Taylor expansion
        return 0;
    }
    return Math.cos(2 * Math.PI * (p * p - p - 1 / 16)) / cos2pip;
}

/**
 * C1 Riemann-Siegel coefficient (first correction)
 * @param {number} p
 * @returns {number}
 */
function C1func(p) {
    // Simplified C1 approximation
    const cos2pip = Math.cos(2 * Math.PI * p);
    if (Math.abs(cos2pip) < 1e-10) return 0;

    const sin2pip = Math.sin(2 * Math.PI * p);
    const d3cos = -8 * Math.PI * Math.PI * Math.PI * sin2pip; // d³/dp³ cos(2πp)

    return -d3cos / (96 * Math.PI * Math.PI * cos2pip * cos2pip * cos2pip);
}

/**
 * Direct zeta computation for small t (where Riemann-Siegel is inaccurate)
 * Uses accelerated eta series
 * @param {number} t
 * @returns {number} Approximate Z(t)
 */
function zetaDirectSmallT(t) {
    // For small t, compute ζ(½+it) directly and extract Z
    const s = [0.5, t];
    const z = zetaAccelerated(s, 200);
    const th = theta(t);

    // Z(t) = Re(e^(iθ) · ζ) = Re(ζ)·cos(θ) + Im(ζ)·sin(θ)
    return z[0] * Math.cos(th) + z[1] * Math.sin(th);
}

/**
 * Accelerated eta/zeta for small t using Euler acceleration
 * @param {number[]} s - Complex [re, im]
 * @param {number} terms
 * @returns {number[]} Complex zeta value
 */
function zetaAccelerated(s, terms) {
    // Borwein-style acceleration
    const n = terms;
    const d = new Array(n + 1);

    // Compute binomial-based weights
    d[0] = 1;
    for (let k = 1; k <= n; k++) {
        d[k] = d[k - 1] * (n - k + 1) / k;
    }

    // Normalize
    const dSum = d.reduce((a, b) => a + b, 0);
    for (let k = 0; k <= n; k++) {
        d[k] /= dSum;
    }

    let sumRe = 0, sumIm = 0;
    for (let k = 0; k <= n; k++) {
        // Partial sum of eta up to k
        let etaRe = 0, etaIm = 0;
        for (let j = 1; j <= k + 1; j++) {
            const sign = (j % 2 === 0) ? -1 : 1;
            const scale = 1 / Math.pow(j, s[0]);
            const angle = -s[1] * Math.log(j);
            etaRe += sign * scale * Math.cos(angle);
            etaIm += sign * scale * Math.sin(angle);
        }
        sumRe += d[k] * etaRe;
        sumIm += d[k] * etaIm;
    }

    // Convert eta to zeta: ζ(s) = η(s) / (1 - 2^(1-s))
    const log2 = Math.LN2;
    const expReal = Math.exp((1 - s[0]) * log2);
    const expImag = -s[1] * log2;
    const twoPowRe = expReal * Math.cos(expImag);
    const twoPowIm = expReal * Math.sin(expImag);
    const denomRe = 1 - twoPowRe;
    const denomIm = -twoPowIm;
    const denomMag = denomRe * denomRe + denomIm * denomIm;

    return [
        (sumRe * denomRe + sumIm * denomIm) / denomMag,
        (sumIm * denomRe - sumRe * denomIm) / denomMag
    ];
}

/**
 * Compute ζ(½ + it) from Z(t) and θ(t)
 * ζ(½ + it) = e^(-iθ(t)) · Z(t)
 * @param {number} t
 * @returns {number[]} Complex [re, im]
 */
function zetaFromZ(t) {
    const Zt = Z(t);
    const th = theta(t);

    // ζ = Z · e^(-iθ) = Z·cos(θ) - i·Z·sin(θ)
    return [Zt * Math.cos(th), -Zt * Math.sin(th)];
}

/**
 * Main zeta function for the path overlay
 * @param {number[]} s - Complex number [re, im] (expects re ≈ 0.5)
 * @param {number} terms - Unused, kept for API compatibility
 * @returns {number[]} Complex result [re, im]
 */
function zeta(s, terms = 100) {
    const t = s[1];

    // For the critical line, use Riemann-Siegel
    if (Math.abs(s[0] - 0.5) < 0.01) {
        if (t < 0) {
            // Use reflection: ζ(½ - it) = conj(ζ(½ + it))
            const z = zetaFromZ(-t);
            return [z[0], -z[1]];
        }
        return zetaFromZ(t);
    }

    // For off-critical-line, fall back to accelerated method
    return zetaAccelerated(s, Math.max(terms, 200));
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing (same as original)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draws the zeta path curve w = ζ(½ + it) in the w-plane
 */
function draw() {
    if (!ctx || !canvas || !renderer) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    const pan = renderer.pan;
    const zoom = renderer.zoom;
    const scale = height / zoom;

    // Determine t range based on current view
    const tCenter = Math.max(0, pan[1]);
    const tRange = Math.max(50, zoom * 2);
    const tMin = Math.max(0, tCenter - tRange);
    const tMax = tCenter + tRange;

    // Adaptive step size based on zoom
    const numPoints = Math.min(5000, Math.max(500, Math.floor(tRange * 20)));
    const dt = (tMax - tMin) / numPoints;

    const terms = renderer.seriesTerms || 100;

    // Draw the spiral path
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    let firstPoint = true;
    let prevW = null;

    for (let t = tMin; t <= tMax; t += dt) {
        const w = zeta([0.5, t], terms);

        const screenX = centerX + (w[0] - pan[0]) * scale;
        const screenY = centerY - (w[1] - pan[1]) * scale;

        if (isNaN(screenX) || isNaN(screenY)) continue;
        if (screenX < -width || screenX > 2 * width || screenY < -height || screenY > 2 * height) {
            firstPoint = true;
            continue;
        }

        // Detect discontinuities
        if (prevW) {
            const jump = Math.hypot(w[0] - prevW[0], w[1] - prevW[1]);
            if (jump > zoom * 0.5) {
                firstPoint = true;
            }
        }

        if (firstPoint) {
            ctx.moveTo(screenX, screenY);
            firstPoint = false;
        } else {
            ctx.lineTo(screenX, screenY);
        }
        prevW = w;
    }
    ctx.stroke();

    // Draw t-value labels
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0, 255, 200, 0.7)';
    const labelInterval = Math.max(1, Math.ceil(tRange / 20));
    for (let t = Math.ceil(tMin / labelInterval) * labelInterval; t <= tMax; t += labelInterval) {
        if (t < 0.1) continue;
        const w = zeta([0.5, t], terms);
        const screenX = centerX + (w[0] - pan[0]) * scale;
        const screenY = centerY - (w[1] - pan[1]) * scale;
        if (screenX > 30 && screenX < width - 30 && screenY > 20 && screenY < height - 20) {
            ctx.fillText(`t=${t}`, screenX + 5, screenY - 5);
        }
    }

    // Legend
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '12px monospace';
    ctx.fillText('ζ(½ + it) spiral [Riemann-Siegel]', 10, height - 30);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('Zeros = origin crossings', 10, height - 15);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API (identical to original)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initializes the zeta path overlay
 * @param {HTMLCanvasElement} canvasElement - The canvas element
 * @param {Object} fractalRenderer - The renderer instance (for pan/zoom/terms)
 */
export function init(canvasElement, fractalRenderer) {
    canvas = canvasElement;
    renderer = fractalRenderer;
    if (canvas) {
        ctx = canvas.getContext('2d');
    }
}

/**
 * Shows the overlay
 */
export function show() {
    if (!canvas || !ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.classList.remove('zeta-path-hidden');
    visible = true;

    draw();
}

/**
 * Hides the overlay
 */
export function hide() {
    if (canvas) {
        canvas.classList.add('zeta-path-hidden');
    }
    visible = false;
}

/**
 * Toggles the overlay visibility
 * @returns {boolean} New visibility state
 */
export function toggle() {
    if (visible) {
        hide();
    } else {
        show();
    }
    log(`Zeta Path (RS): ${visible ? 'ON' : 'OFF'}`);
    return visible;
}

/**
 * Updates the overlay (redraws if visible)
 */
export function update() {
    if (!visible) return;
    draw();
}

/**
 * Resizes the canvas and redraws
 */
export function resize() {
    if (!visible || !canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}

/**
 * @returns {boolean} current visibility state
 */
export function isVisible() {
    return visible;
}

/**
 * Sets the renderer reference (for when renderer changes)
 * @param {Object} fractalRenderer
 */
export function setRenderer(fractalRenderer) {
    renderer = fractalRenderer;
}
