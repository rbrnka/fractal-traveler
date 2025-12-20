/**
 * @module MouseEventHandlers
 * @author Radim Brnka
 * @description This module exports a function registerMouseEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.
 */

import {expandComplexToString, normalizeRotation, updateURLParams} from '../global/utils.js';
import {isJuliaMode, resetAppState, toggleDebugLines, updateInfo} from './ui.js';
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEBUG_MODE, EASE_TYPE, FRACTAL_TYPE} from "../global/constants";

/** How long should we wait before distinguish between double click and two single clicks. */
const DOUBLE_CLICK_THRESHOLD = 300;
/** Tolerance of mouse movement before drag starts. */
const DRAG_THRESHOLD = 5;
const ZOOM_STEP = 0.05; // double-click zoom in/out
const ROTATION_SENSITIVITY = 0.01;

// Wheel smoothing (reduces micro-jitter due to bursty wheel events)
const WHEEL_ZOOM_BASE = 1.1;
const WHEEL_DELTA_UNIT = 120;

let canvas;
let fractalApp;

/** Global variable to track registration */
let mouseHandlersRegistered = false;

// Stored references to event handler functions
let handleWheelEvent;
let handleMouseDownEvent;
let handleMouseMoveEvent;
let handleMouseUpEvent;

let mouseDownX = 0, mouseDownY = 0;
let lastX = 0, lastY = 0;
let clickTimeout = null;
let wheelResetTimeout = null;
let isDragging = false;
let wasRotated = false;

// Rotation
let isRightDragging = false;
let startX = 0;

// Cached rect (avoid layout thrash / inconsistencies during drag)
let dragRectLeft = 0;
let dragRectTop = 0;
let hasDragRect = false;

// Wheel RAF aggregation
let wheelAccum = 0;
let wheelAnchorX = 0;
let wheelAnchorY = 0;
let wheelRAF = null;

/**
 * Mark orbit dirty if the current renderer supports perturbation caching.
 * IMPORTANT: must NOT trigger orbit rebuild immediately (renderers should defer).
 */
function markOrbitDirtySafe() {
    if (fractalApp && typeof fractalApp.markOrbitDirty === "function") {
        fractalApp.markOrbitDirty();
    } else if (fractalApp) {
        // Fallback: do nothing; non-perturbation renderers won't need it.
    }
}

/**
 * Initialization and registering of the event handlers.
 * @param {FractalRenderer} app
 */
export function initMouseHandlers(app) {
    fractalApp = app;
    canvas = app.canvas;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    registerMouseEventHandlers();
}

/** Registers mouse handlers. */
export function registerMouseEventHandlers() {
    if (mouseHandlersRegistered) {
        console.warn(`%c registerMouseEventHandlers: %c Mouse event handlers already registered!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    handleWheelEvent = (event) => handleWheel(event);
    handleMouseDownEvent = (event) => handleMouseDown(event);
    handleMouseMoveEvent = (event) => handleMouseMove(event);
    handleMouseUpEvent = (event) => handleMouseUp(event);

    canvas.addEventListener('wheel', handleWheelEvent, {passive: false});
    canvas.addEventListener('mousedown', handleMouseDownEvent);
    canvas.addEventListener('mousemove', handleMouseMoveEvent);
    canvas.addEventListener('mouseup', handleMouseUpEvent);

    mouseHandlersRegistered = true;
    console.log(`%c registerMouseEventHandlers: %c Event handlers registered`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

/** Unregisters mouse handlers. */
export function unregisterMouseEventHandlers() {
    if (!mouseHandlersRegistered) {
        console.warn(`%c unregisterMouseEventHandlers: %c Event handlers are not registered so cannot be unregistered!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    canvas.removeEventListener('wheel', handleWheelEvent, {passive: false});
    canvas.removeEventListener('mousedown', handleMouseDownEvent);
    canvas.removeEventListener('mousemove', handleMouseMoveEvent);
    canvas.removeEventListener('mouseup', handleMouseUpEvent);

    mouseHandlersRegistered = false;
    console.warn(`%c unregisterMouseEventHandlers: %c Event handlers unregistered`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

// region > EVENT HANDLERS ---------------------------------------------------------------------------------------------

/**
 * Apply accumulated wheel delta once per RAF.
 * This reduces “bursty wheel” micro-jitter and keeps anchor math consistent.
 */
function flushWheelZoom() {
    wheelRAF = null;

    if (!fractalApp) return;
    if (!Number.isFinite(fractalApp.zoom)) return;

    const rect = fractalApp.canvas.getBoundingClientRect();
    const mouseX = wheelAnchorX - rect.left; // CSS px
    const mouseY = wheelAnchorY - rect.top;  // CSS px

    // Apply accumulated delta
    const zoomFactor = Math.pow(WHEEL_ZOOM_BASE, wheelAccum / WHEEL_DELTA_UNIT);
    const targetZoom = fractalApp.zoom * zoomFactor;

    // reset accumulator early (avoid re-entrance issues)
    wheelAccum = 0;

    if (targetZoom < fractalApp.MAX_ZOOM || targetZoom > fractalApp.MIN_ZOOM) return;

    // Stable deep-zoom anchor math (no before/after subtraction)
    // Keeps the fractal point under cursor fixed while changing zoom.
    fractalApp.setZoomKeepingAnchor(targetZoom, mouseX, mouseY);

    // orbit rebuild request for perturbation renderers (deferred by renderer logic)
    markOrbitDirtySafe();

    updateInfo(true);
    fractalApp.draw();
}

function handleWheel(event) {
    event.preventDefault();

    // Aggregate wheel delta and apply once per frame.
    wheelAccum += event.deltaY;
    wheelAnchorX = event.clientX;
    wheelAnchorY = event.clientY;

    if (!wheelRAF) {
        wheelRAF = requestAnimationFrame(flushWheelZoom);
    }

    if (wheelResetTimeout) clearTimeout(wheelResetTimeout);
    wheelResetTimeout = setTimeout(() => {
        resetAppState();
    }, 150);
}

function handleMouseDown(event) {
    if (event.button === 0) {
        isDragging = false;
        mouseDownX = event.clientX;
        mouseDownY = event.clientY;
        lastX = event.clientX;
        lastY = event.clientY;

        // Cache rect origin for stable relative coordinates during the drag.
        // (Avoids layout thrash and tiny inconsistencies.)
        const rect = canvas.getBoundingClientRect();
        dragRectLeft = rect.left;
        dragRectTop = rect.top;
        hasDragRect = true;
    } else if (event.button === 2) { // Right-click
        startX = event.clientX;
    }
}

function handleMouseMove(event) {
    const dx = event.clientX - mouseDownX;
    const dy = event.clientY - mouseDownY;

    if (event.buttons === 1) {
        if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isDragging = true;
        }

        if (isDragging) {
            canvas.style.cursor = 'move';
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
            }

            // Use cached rect origin (fallback if not available).
            let left = dragRectLeft;
            let top = dragRectTop;
            if (!hasDragRect) {
                const rect = canvas.getBoundingClientRect();
                left = rect.left;
                top = rect.top;
            }

            // Stable deep-zoom pan delta:
            // pan += zoom * (vLast - vNow)
            const lastRelX = lastX - left;
            const lastRelY = lastY - top;
            const nowRelX = event.clientX - left;
            const nowRelY = event.clientY - top;

            const [vLastX, vLastY] = fractalApp.screenToViewVector(lastRelX, lastRelY);
            const [vNowX,  vNowY ] = fractalApp.screenToViewVector(nowRelX, nowRelY);

            if (Number.isFinite(fractalApp.zoom)) {
                const deltaX = (vLastX - vNowX) * fractalApp.zoom;
                const deltaY = (vLastY - vNowY) * fractalApp.zoom;

                fractalApp.addPan(deltaX, deltaY);
                // Mark orbit dirty (deferred rebuild)
                markOrbitDirtySafe();
            }

            // Update last mouse coordinates.
            lastX = event.clientX;
            lastY = event.clientY;

            fractalApp.draw();
            updateInfo(true);
        }
    }

    if (event.buttons === 2) {
        if (!isRightDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isRightDragging = true;
        }

        if (isRightDragging) {
            event.preventDefault();
            const deltaX = event.clientX - startX;

            fractalApp.rotation = normalizeRotation(fractalApp.rotation + deltaX * ROTATION_SENSITIVITY);
            fractalApp.draw();

            startX = event.clientX; // Update starting point for smooth rotation
            wasRotated = true;
            canvas.style.cursor = 'grabbing'; // Use a grabbing cursor for rotation
            updateInfo();
        }
    }
}

function handleMouseUp(event) {
    // Process only for left (0), middle (1), or right (2) mouse buttons.
    if (![0, 1, 2].includes(event.button)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.button === 1) { // Middle-click toggles the lines
        console.log(`%c handleMouseUp: %c Middle Click - Toggling lines`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        toggleDebugLines();
        return;
    }

    if (event.button === 0) { // Left click
        // Release drag cache
        hasDragRect = false;

        if (!isDragging) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

            // If there is already a pending click, then we have a double-click.
            if (clickTimeout !== null) { // --- Double-click action ---
                clearTimeout(clickTimeout);
                clickTimeout = null;

                const targetZoom = fractalApp.zoom * ZOOM_STEP;
                if (targetZoom > fractalApp.MAX_ZOOM) {
                    console.log(`%c handleMouseUp: %c Double Left Click: Centering on ${mouseX}x${mouseY} -> [${expandComplexToString([fx, fy])}] zoom ${fractalApp.zoom.toFixed(6)} -> ${targetZoom}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
                    fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000, EASE_TYPE.QUINT).then(resetAppState);
                } else {
                    console.log(`%c handleMouseUp: %c Double Left Click: Over max zoom. Skipping`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
                }
            } else {
                // Set a timeout for the single-click action.
                clickTimeout = setTimeout(() => {
                    console.log(`%c handleMouseUp: %c Single Left Click: Centering on ${mouseX}x${mouseY} -> ${expandComplexToString([fx, fy])}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

                    // Centering action:
                    fractalApp.animatePanTo([fx, fy], 500).then(() => {
                        resetAppState();
                        if (isJuliaMode()) {
                            updateURLParams(FRACTAL_TYPE.JULIA, fx, fy, fractalApp.zoom, fractalApp.rotation, fractalApp.c[0], fractalApp.c[1]);
                        } else {
                            updateURLParams(FRACTAL_TYPE.MANDELBROT, fx, fy, fractalApp.zoom, fractalApp.rotation);
                        }
                    });

                    navigator.clipboard.writeText(window.location.href).then(
                        () => console.log(`%c handleMouseUp: %c Copied URL to clipboard!`, CONSOLE_MESSAGE_STYLE),
                        (err) => console.error(`%c handleMouseUp: %c Not copied to clipboard! ${err}`, CONSOLE_MESSAGE_STYLE)
                    );

                    clickTimeout = null;
                }, DOUBLE_CLICK_THRESHOLD);
            }
        } else {
            resetAppState();
            isDragging = false;

            // Final settle rebuild request (renderer decides when to rebuild)
            markOrbitDirtySafe();
            fractalApp.draw();
        }
    }

    if (event.button === 2) { // Right mouse button released
        if (isRightDragging) {
            isRightDragging = false;

            if (DEBUG_MODE) console.log(`%c handleMouseUp: %c Single Right Click: Doing nothing.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

            if (wasRotated) resetAppState();
            wasRotated = false;
            canvas.style.cursor = 'crosshair';
            return; // Prevent further processing if it was a drag
        }

        // Handle right-click double-click detection
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

        if (clickTimeout !== null) {
            // Double-click detected
            clearTimeout(clickTimeout);
            clickTimeout = null;

            const targetZoom = fractalApp.zoom / ZOOM_STEP;
            if (targetZoom < fractalApp.MIN_ZOOM) {
                console.log(`%c handleMouseUp: %c Double Right Click: Centering on ${mouseX}x${mouseY} -> [${expandComplexToString([fx, fy])}] zoom ${fractalApp.zoom.toFixed(6)} -> ${targetZoom}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
                fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000, EASE_TYPE.QUINT).then(resetAppState);
            } else {
                console.log(`%c handleMouseUp: %c Double Right Click: Over min zoom. Skipping`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
            }
        } else {
            clickTimeout = setTimeout(() => { clickTimeout = null; }, DOUBLE_CLICK_THRESHOLD);
        }

        isRightDragging = false;
    }

    canvas.style.cursor = 'crosshair';
}

// endregion -----------------------------------------------------------------------------------------------------------