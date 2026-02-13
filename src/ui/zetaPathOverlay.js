/**
 * @module ZetaPathOverlay
 * @description Renders the ζ(½+it) spiral curve on a canvas overlay
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
// Complex number operations
// ─────────────────────────────────────────────────────────────────────────────

function cMul(a, b) {
    return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

function cDiv(a, b) {
    const denom = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / denom, (a[1] * b[0] - a[0] * b[1]) / denom];
}

function cExp(z) {
    const ea = Math.exp(z[0]);
    return [ea * Math.cos(z[1]), ea * Math.sin(z[1])];
}

// ─────────────────────────────────────────────────────────────────────────────
// Zeta function computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Dirichlet eta function (alternating zeta series)
 * @param {number[]} s - Complex number [re, im]
 * @param {number} terms - Number of terms to use
 * @returns {number[]} - Complex result [re, im]
 */
function eta(s, terms = 100) {
    let sum = [0, 0];
    for (let n = 1; n <= terms; n++) {
        const sign = (n % 2 === 0) ? -1 : 1;
        const scale = 1 / Math.pow(n, s[0]);
        const angle = -s[1] * Math.log(n);
        sum[0] += sign * scale * Math.cos(angle);
        sum[1] += sign * scale * Math.sin(angle);
    }
    return sum;
}

/**
 * Computes zeta via eta: ζ(s) = η(s) / (1 - 2^(1-s))
 * @param {number[]} s - Complex number [re, im]
 * @param {number} terms - Number of terms
 * @returns {number[]} - Complex result [re, im]
 */
function zeta(s, terms = 100) {
    const etaVal = eta(s, terms);
    const log2 = 0.69314718;
    const expReal = Math.exp((1 - s[0]) * log2);
    const expImag = -s[1] * log2;
    const twoPow = [expReal * Math.cos(expImag), expReal * Math.sin(expImag)];
    const denom = [1 - twoPow[0], -twoPow[1]];
    return cDiv(etaVal, denom);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing
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

    // Draw origin marker (zeros cross here)
    // const originX = centerX + (0 - pan[0]) * scale;
    // const originY = centerY - (0 - pan[1]) * scale;

    // if (originX > -20 && originX < width + 20 && originY > -20 && originY < height + 20) {
    // ctx.beginPath();
    // ctx.arc(originX, originY, 6, 0, 2 * Math.PI);
    // ctx.strokeStyle = 'rgba(255, 100, 100, 0.9)';
    // ctx.lineWidth = 2;
    // ctx.stroke();
    //
    // ctx.beginPath();
    // ctx.moveTo(originX - 8, originY);
    // ctx.lineTo(originX + 8, originY);
    // ctx.moveTo(originX, originY - 8);
    // ctx.lineTo(originX, originY + 8);
    // ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
    // ctx.lineWidth = 1;
    // ctx.stroke();
    // }

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
    ctx.fillText('ζ(½ + it) spiral', 10, height - 30);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('Zeros = origin crossings', 10, height - 15);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
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
    log(`Zeta Path: ${visible ? 'ON' : 'OFF'}`);
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
 * @returns {boolean}  current visibility state
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
