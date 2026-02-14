/**
 * @module AxesOverlay
 * @description Renders coordinate axes grid overlay for Riemann mode
 * @author Radim Brnka
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {log} from '../global/constants';

let canvas = null;
let ctx = null;
let visible = false;
let renderer = null;

/**
 * Initializes the axes overlay
 * @param {HTMLCanvasElement} canvasElement
 * @param {Object} fractalRenderer
 */
export function init(canvasElement, fractalRenderer) {
    canvas = canvasElement;
    renderer = fractalRenderer;
    if (canvas) {
        ctx = canvas.getContext('2d');
    }
}

/**
 * Sets the renderer reference
 * @param {Object} fractalRenderer
 */
export function setRenderer(fractalRenderer) {
    renderer = fractalRenderer;
}

/**
 * Shows the axes overlay
 */
export function show() {
    if (!canvas || !ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.classList.remove('axes-hidden');
    visible = true;

    draw();
}

/**
 * Hides the axes overlay
 */
export function hide() {
    if (canvas) {
        canvas.classList.add('axes-hidden');
    }
    visible = false;
}

/**
 * Toggles the axes overlay
 * @returns {boolean} New visibility state
 */
export function toggle() {
    if (visible) {
        hide();
    } else {
        show();
    }
    log(`Axes: ${visible ? 'ON' : 'OFF'}`);
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
 * Returns current visibility state
 * @returns {boolean}
 */
export function isVisible() {
    return visible;
}

/**
 * Calculates appropriate tick spacing based on zoom level
 * @param {number} zoom
 * @returns {number}
 */
function getTickSpacing(zoom) {
    const idealTicks = 8;
    const rawSpacing = zoom / idealTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawSpacing)));
    const normalized = rawSpacing / magnitude;

    if (normalized < 1.5) return magnitude;
    if (normalized < 3.5) return 2 * magnitude;
    if (normalized < 7.5) return 5 * magnitude;
    return 10 * magnitude;
}

/**
 * Formats axis number for display
 * @param {number} n
 * @returns {string}
 */
function formatAxisNumber(n) {
    if (Number.isInteger(n)) return n.toString();
    if (Math.abs(n) < 0.01 || Math.abs(n) >= 1000) {
        return n.toExponential(1);
    }
    return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Draws the coordinate axes with numbers
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

    // Calculate visible range
    const aspect = width / height;
    const halfWidth = zoom * aspect / 2;
    const halfHeight = zoom / 2;
    const left = pan[0] - halfWidth;
    const right = pan[0] + halfWidth;
    const top = pan[1] + halfHeight;
    const bottom = pan[1] - halfHeight;

    const tickSpacing = getTickSpacing(zoom);
    const scale = height / zoom;

    // Calculate main axis positions
    const realAxisY = centerY - (0 - pan[1]) * scale;
    const imagAxisX = centerX + (0 - pan[0]) * scale;

    // Clamp label positions
    const labelPadding = 20;
    const realAxisLabelY = Math.max(labelPadding, Math.min(height - labelPadding, realAxisY));
    const imagAxisLabelX = Math.max(labelPadding + 30, Math.min(width - labelPadding - 30, imagAxisX));

    // Grid lines style
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '14px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';

    // Vertical grid lines
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const startX = Math.ceil(left / tickSpacing) * tickSpacing;
    for (let x = startX; x <= right; x += tickSpacing) {
        const screenX = centerX + (x - pan[0]) * scale;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
        ctx.stroke();

        if (Math.abs(x) > tickSpacing * 0.1) {
            const label = formatAxisNumber(x);
            ctx.fillText(label, screenX, realAxisLabelY + 5);
        }
    }

    // Horizontal grid lines
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const startY = Math.ceil(bottom / tickSpacing) * tickSpacing;
    for (let y = startY; y <= top; y += tickSpacing) {
        const screenY = centerY - (y - pan[1]) * scale;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
        ctx.stroke();

        if (Math.abs(y) > tickSpacing * 0.1) {
            const label = formatAxisNumber(y) + 'i';
            ctx.fillText(label, imagAxisLabelX + 5, screenY);
        }
    }

    // Main axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;

    // Real axis
    ctx.beginPath();
    ctx.moveTo(0, realAxisY);
    ctx.lineTo(width, realAxisY);
    ctx.stroke();

    // Imaginary axis
    ctx.beginPath();
    ctx.moveTo(imagAxisX, 0);
    ctx.lineTo(imagAxisX, height);
    ctx.stroke();

    // Origin label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('0', imagAxisX + 5, realAxisY + 5);
}
