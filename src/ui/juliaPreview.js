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

/** @type {FractalRenderer} */
let previewRenderer = null;

/** @type {boolean} */
let previewActive = false;

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
