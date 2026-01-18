/**
 * @module JuliaPreview
 * @author Radim Brnka
 * @description Manages the floating Julia set preview shown on middle-click in Mandelbrot mode.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE} from "../global/constants";
import {JuliaPreviewRenderer} from "../renderers/juliaPreviewRenderer";

/** @type {HTMLCanvasElement} */
let floatingCanvas = null;

/** @type {JuliaPreviewRenderer} */
let previewRenderer = null;

/** @type {boolean} */
let previewActive = false;

/** @type {Float32Array|null} */
let pendingInnerStops = null;

/** Preview canvas size in pixels */
const PREVIEW_WIDTH = 250;
const PREVIEW_HEIGHT = 250;

/** Offset from cursor position */
const CURSOR_OFFSET_X = 20;
const CURSOR_OFFSET_Y = 20;

/**
 * Initializes the Julia preview system.
 * Should be called once during app initialization.
 */
export function initJuliaPreview() {
    floatingCanvas = document.getElementById('floatingCanvas');
    if (!floatingCanvas) {
        console.error('floatingCanvas element not found!');
        return;
    }

    // Set canvas dimensions (physical pixels for rendering)
    floatingCanvas.width = PREVIEW_WIDTH * window.devicePixelRatio;
    floatingCanvas.height = PREVIEW_HEIGHT * window.devicePixelRatio;

    // Set CSS dimensions (display size)
    floatingCanvas.style.width = `${PREVIEW_WIDTH}px`;
    floatingCanvas.style.height = `${PREVIEW_HEIGHT}px`;
}

/**
 * Shows the Julia preview at the given screen position with the specified c parameter.
 * @param {number} screenX - Screen X coordinate (clientX)
 * @param {number} screenY - Screen Y coordinate (clientY)
 * @param {number} cx - Real part of Julia c parameter
 * @param {number} cy - Imaginary part of Julia c parameter
 */
export function showJuliaPreview(screenX, screenY, cx, cy) {
    if (!floatingCanvas) {
        initJuliaPreview();
    }

    // Create renderer on first show
    if (!previewRenderer) {
        previewRenderer = new JuliaPreviewRenderer(floatingCanvas);
        // Use lower iteration count for responsiveness
        previewRenderer.MAX_ITER = 500;
        previewRenderer.extraIterations = 0;
        console.log(`%c JuliaPreview: %c Created preview renderer`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        // Apply any pending palette that was set before renderer was created
        if (pendingInnerStops) {
            previewRenderer.innerStops = pendingInnerStops;
            pendingInnerStops = null;
        }
    }

    // Update c parameter
    previewRenderer.c = [cx, cy];
    previewRenderer.markOrbitDirty();

    // Position the canvas near cursor
    updatePreviewPosition(screenX, screenY);

    // Show the canvas
    floatingCanvas.style.display = 'block';
    previewActive = true;

    // Render the Julia set
    previewRenderer.draw();
}

/**
 * Updates the Julia preview position and c parameter as the mouse moves.
 * @param {number} screenX - Screen X coordinate (clientX)
 * @param {number} screenY - Screen Y coordinate (clientY)
 * @param {number} cx - Real part of Julia c parameter
 * @param {number} cy - Imaginary part of Julia c parameter
 */
export function updateJuliaPreview(screenX, screenY, cx, cy) {
    if (!previewActive || !previewRenderer) return;

    // Update c parameter
    previewRenderer.c = [cx, cy];
    previewRenderer.markOrbitDirty();

    // Update position
    updatePreviewPosition(screenX, screenY);

    // Re-render
    previewRenderer.draw();
}

/**
 * Updates the floating canvas position relative to cursor.
 * Ensures the preview stays within viewport bounds.
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 */
function updatePreviewPosition(screenX, screenY) {
    if (!floatingCanvas) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Default position: below and to the right of cursor
    let left = screenX + CURSOR_OFFSET_X;
    let top = screenY + CURSOR_OFFSET_Y;

    // Flip to left side if would overflow right edge
    if (left + PREVIEW_WIDTH > viewportWidth) {
        left = screenX - PREVIEW_WIDTH - CURSOR_OFFSET_X;
    }

    // Flip to above cursor if would overflow bottom edge
    if (top + PREVIEW_HEIGHT > viewportHeight) {
        top = screenY - PREVIEW_HEIGHT - CURSOR_OFFSET_Y;
    }

    // Clamp to viewport bounds
    left = Math.max(0, Math.min(left, viewportWidth - PREVIEW_WIDTH));
    top = Math.max(0, Math.min(top, viewportHeight - PREVIEW_HEIGHT));

    floatingCanvas.style.left = `${left}px`;
    floatingCanvas.style.top = `${top}px`;
}

/**
 * Hides the Julia preview.
 */
export function hideJuliaPreview() {
    if (!previewActive) return;

    previewActive = false;

    if (floatingCanvas) {
        floatingCanvas.style.display = 'none';
    }

    console.log(`%c JuliaPreview: %c Preview hidden`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

/**
 * Recolors the Julia preview with a new palette.
 * @param {number[]} palette - RGB palette [r, g, b] in range [0,1]
 */
export function recolorJuliaPreview(palette) {
    if (!palette || palette.length < 3) return;

    // Convert 3-float RGB palette to 15-float inner stops for Julia shader
    // Creates a gradient: black -> color -> white -> color -> dark
    const innerStops = new Float32Array([
        0, 0, 0,                                              // stop 0: black
        palette[0], palette[1], palette[2],                   // stop 1: the color
        1, 1, 1,                                              // stop 2: white
        palette[0] * 0.8, palette[1] * 0.8, palette[2] * 0.8, // stop 3: slightly darker
        palette[0] * 0.3, palette[1] * 0.3, palette[2] * 0.3  // stop 4: dark version
    ]);

    if (previewRenderer) {
        // Renderer exists - update immediately
        previewRenderer.animateColorPaletteTransition(innerStops).then();
    } else {
        // Store for later when renderer is created
        pendingInnerStops = innerStops;
    }
}

/**
 * Resets the Julia preview renderer to default state.
 */
export function resetJuliaPreview() {
    if (!previewRenderer) {
        console.warn(`%c JuliaPreview: %c Cannot reset - renderer not initialized`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    previewRenderer.reset();
}

/**
 * Destroys the Julia preview renderer and cleans up resources.
 * Call this when switching away from Mandelbrot mode.
 */
export function destroyJuliaPreview() {
    hideJuliaPreview();

    if (previewRenderer) {
        previewRenderer.destroy();
        previewRenderer = null;
        console.log(`%c JuliaPreview: %c Preview renderer destroyed`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
    }
}

/**
 * Returns whether the preview is currently active.
 * @returns {boolean}
 */
export function isJuliaPreviewActive() {
    return previewActive;
}
