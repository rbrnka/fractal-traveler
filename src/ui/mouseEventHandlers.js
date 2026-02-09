/**
 * @module MouseEventHandlers
 * @author Radim Brnka
 * @description This module exports a function registerMouseEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {normalizeRotation, updateURLParams} from '../global/utils.js';
import {getCurrentPaletteId, hideViewInfo, isJuliaMode, isRiemannMode, resetAppState, updateInfo} from './ui.js';
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEBUG_MODE, EASE_TYPE, FRACTAL_TYPE} from "../global/constants";
import {hideJuliaPreview, initJuliaPreview, showJuliaPreview, updateJuliaPreview} from "./juliaPreview";

/** How long should we wait before distinguish between double click and two single clicks. */
const DOUBLE_CLICK_THRESHOLD = 300;
/** Tolerance of mouse movement before drag starts. */
const DRAG_THRESHOLD = 5;
const ZOOM_STEP = 0.05; // double-click zoom in/out
const ROTATION_SENSITIVITY = 0.01;
/** Maximum distance from origin to prevent panning out of view */
export const MAX_PAN_DISTANCE = 3.5; // Fractals are contained within ~radius 2, allow some margin

/** Long press zoom configuration */
const LONG_PRESS_THRESHOLD = 400; // ms before zoom starts
const LONG_PRESS_ZOOM_IN_FACTOR = 0.985; // zoom multiplier per frame (smaller = faster zoom in)
const LONG_PRESS_ZOOM_OUT_FACTOR = 1.015; // zoom multiplier per frame (larger = faster zoom out)

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
let handleMouseLeaveEvent;

let mouseDownX = 0, mouseDownY = 0;
let lastX = 0, lastY = 0;
let clickTimeout = null;
let wheelResetTimeout = null;
let isDragging = false;
let wasRotated = false;

// Long press zoom state (left button - zoom in)
let longPressTimeout = null;
let longPressZoomActive = false;
let longPressZoomRAF = null;
let longPressAnchorX = 0;
let longPressAnchorY = 0;

// Long press zoom state (right button - zoom out)
let rightLongPressTimeout = null;
let rightLongPressZoomActive = false;
let rightLongPressZoomRAF = null;
let rightLongPressAnchorX = 0;
let rightLongPressAnchorY = 0;

// Rotation
let isRightDragging = false;
let startX = 0;

// Middle-click Julia preview
let isMiddleButtonHeld = false;

// Cached rect (avoid layout thrash / inconsistencies during drag)
let dragRectLeft = 0;

/**
 * Clamps pan delta to ensure resulting pan stays within bounds
 * @param {Array<number>} currentPan - Current pan [x, y]
 * @param {Array<number>} deltaPan - Proposed delta [dx, dy]
 * @returns {Array<number>} - Clamped delta [dx, dy]
 */
export function clampPanDelta(currentPan, deltaPan) {
    const newPanX = currentPan[0] + deltaPan[0];
    const newPanY = currentPan[1] + deltaPan[1];
    const distance = Math.sqrt(newPanX * newPanX + newPanY * newPanY);

    // If within bounds, return unchanged
    if (distance <= MAX_PAN_DISTANCE) {
        return deltaPan;
    }

    // Clamp to max distance by scaling back the new position
    const scale = MAX_PAN_DISTANCE / distance;
    const clampedPanX = newPanX * scale;
    const clampedPanY = newPanY * scale;

    // Return the delta that would achieve the clamped position
    const clampedDeltaX = clampedPanX - currentPan[0];
    const clampedDeltaY = clampedPanY - currentPan[1];

    console.log(`%c clampPanDelta: %c Pan would exceed bounds (distance: ${distance.toFixed(2)} > ${MAX_PAN_DISTANCE}). Clamping to [${clampedDeltaX.toFixed(4)}, ${clampedDeltaY.toFixed(4)}]`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    return [clampedDeltaX, clampedDeltaY];
}
let dragRectTop = 0;
let hasDragRect = false;

// Wheel RAF aggregation
let wheelAccum = 0;
let wheelAnchorX = 0;
let wheelAnchorY = 0;
let wheelRAF = null;
// Cached rect for wheel zoom (avoid sub-pixel jitter from repeated getBoundingClientRect calls)
let wheelRectLeft = 0;
let wheelRectTop = 0;
let hasWheelRect = false;

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
    initJuliaPreview();
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
    handleMouseLeaveEvent = () => handleMouseLeave();

    canvas.addEventListener('wheel', handleWheelEvent, {passive: false});
    canvas.addEventListener('mousedown', handleMouseDownEvent);
    canvas.addEventListener('mousemove', handleMouseMoveEvent);
    canvas.addEventListener('mouseup', handleMouseUpEvent);
    canvas.addEventListener('mouseleave', handleMouseLeaveEvent);

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
    canvas.removeEventListener('mouseleave', handleMouseLeaveEvent);

    mouseHandlersRegistered = false;
    console.warn(`%c unregisterMouseEventHandlers: %c Event handlers unregistered`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

// region > EVENT HANDLERS ---------------------------------------------------------------------------------------------

/**
 * Start the continuous long press zoom-in loop (left button).
 * Zooms in toward the anchor point while allowing panning.
 */
function startLongPressZoomIn() {
    if (longPressZoomActive) return;
    longPressZoomActive = true;
    canvas.style.cursor = 'zoom-in';

    // Hide preset overlay on interaction (no longer accurate)
    hideViewInfo();

    function zoomLoop() {
        if (!longPressZoomActive || !fractalApp) return;

        const targetZoom = fractalApp.zoom * LONG_PRESS_ZOOM_IN_FACTOR;

        if (targetZoom > fractalApp.MAX_ZOOM) {
            // Use anchor-preserving zoom
            fractalApp.setZoomKeepingAnchor(targetZoom, longPressAnchorX, longPressAnchorY);
            markOrbitDirtySafe();
            fractalApp.draw();
            updateInfo(true);

            longPressZoomRAF = requestAnimationFrame(zoomLoop);
        } else {
            // Reached max zoom, stop
            stopLongPressZoomIn();
        }
    }

    longPressZoomRAF = requestAnimationFrame(zoomLoop);
    fractalApp.noteInteraction(160);
}

/**
 * Stop the long press zoom-in loop (left button).
 */
function stopLongPressZoomIn() {
    if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
    }
    if (longPressZoomRAF) {
        cancelAnimationFrame(longPressZoomRAF);
        longPressZoomRAF = null;
    }
    if (longPressZoomActive) {
        longPressZoomActive = false;
        canvas.style.cursor = 'crosshair';
        resetAppState();
    }
}

/**
 * Start the continuous long press zoom-out loop (right button).
 * Zooms out from the anchor point while allowing panning.
 */
function startLongPressZoomOut() {
    if (rightLongPressZoomActive) return;
    rightLongPressZoomActive = true;
    canvas.style.cursor = 'zoom-out';

    // Hide preset overlay on interaction (no longer accurate)
    hideViewInfo();

    function zoomLoop() {
        if (!rightLongPressZoomActive || !fractalApp) return;

        const targetZoom = fractalApp.zoom * LONG_PRESS_ZOOM_OUT_FACTOR;

        if (targetZoom < fractalApp.MIN_ZOOM) {
            // Use anchor-preserving zoom
            fractalApp.setZoomKeepingAnchor(targetZoom, rightLongPressAnchorX, rightLongPressAnchorY);
            markOrbitDirtySafe();
            fractalApp.draw();
            updateInfo(true);

            rightLongPressZoomRAF = requestAnimationFrame(zoomLoop);
        } else {
            // Reached min zoom, stop
            stopLongPressZoomOut();
        }
    }

    rightLongPressZoomRAF = requestAnimationFrame(zoomLoop);
    fractalApp.noteInteraction(160);
}

/**
 * Stop the long press zoom-out loop (right button).
 */
function stopLongPressZoomOut() {
    if (rightLongPressTimeout) {
        clearTimeout(rightLongPressTimeout);
        rightLongPressTimeout = null;
    }
    if (rightLongPressZoomRAF) {
        cancelAnimationFrame(rightLongPressZoomRAF);
        rightLongPressZoomRAF = null;
    }
    if (rightLongPressZoomActive) {
        rightLongPressZoomActive = false;
        canvas.style.cursor = 'crosshair';
        resetAppState();
    }
}

/**
 * Apply accumulated wheel delta once per RAF.
 * This reduces "bursty wheel" micro-jitter and keeps anchor math consistent.
 */
function flushWheelZoom() {
    wheelRAF = null;

    if (!fractalApp) return;
    if (!Number.isFinite(fractalApp.zoom)) return;

    // Use cached rect to avoid sub-pixel jitter from repeated getBoundingClientRect calls
    const mouseX = wheelAnchorX - wheelRectLeft; // CSS px
    const mouseY = wheelAnchorY - wheelRectTop;  // CSS px

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

    // Hide preset overlay on interaction (no longer accurate)
    hideViewInfo();

    // Cache rect on first wheel event of a gesture to avoid sub-pixel jitter
    if (!hasWheelRect) {
        const rect = fractalApp.canvas.getBoundingClientRect();
        wheelRectLeft = rect.left;
        wheelRectTop = rect.top;
        hasWheelRect = true;
    }

    // Aggregate wheel delta and apply once per frame.
    wheelAccum += event.deltaY;
    wheelAnchorX = event.clientX;
    wheelAnchorY = event.clientY;

    if (!wheelRAF) {
        wheelRAF = requestAnimationFrame(flushWheelZoom);
    }

    if (wheelResetTimeout) clearTimeout(wheelResetTimeout);
    wheelResetTimeout = setTimeout(() => {
        hasWheelRect = false; // Reset rect cache when gesture ends
        resetAppState();
    }, 150);

    fractalApp.noteInteraction(160);
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

        // Set up long press zoom anchor (relative to canvas)
        longPressAnchorX = event.clientX - rect.left;
        longPressAnchorY = event.clientY - rect.top;

        // Start long press timer for zoom-in
        if (longPressTimeout) clearTimeout(longPressTimeout);
        longPressTimeout = setTimeout(() => {
            // Only start zoom if we haven't started dragging
            if (!isDragging) {
                startLongPressZoomIn();
            }
        }, LONG_PRESS_THRESHOLD);
    } else if (event.button === 2) { // Right-click
        startX = event.clientX;

        // Cache rect for right button long press zoom
        const rect = canvas.getBoundingClientRect();
        rightLongPressAnchorX = event.clientX - rect.left;
        rightLongPressAnchorY = event.clientY - rect.top;

        // Start long press timer for zoom-out
        if (rightLongPressTimeout) clearTimeout(rightLongPressTimeout);
        rightLongPressTimeout = setTimeout(() => {
            // Only start zoom if we haven't started rotating
            if (!isRightDragging) {
                startLongPressZoomOut();
            }
        }, LONG_PRESS_THRESHOLD);
    } else if (event.button === 1) { // Middle click - Julia preview
        event.preventDefault();

        // Only show Julia preview when in Mandelbrot mode
        if (!isJuliaMode()) {
            isMiddleButtonHeld = true;

            // Get fractal coordinates at cursor position
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

            // Show Julia preview with c = cursor fractal position
            showJuliaPreview(event.clientX, event.clientY, fx, fy);
        }
    }
}

function handleMouseMove(event) {
    const dx = event.clientX - mouseDownX;
    const dy = event.clientY - mouseDownY;

    if (event.buttons === 1) {
        // If long press zoom is active, update anchor for panning while zooming
        if (longPressZoomActive) {
            const rect = canvas.getBoundingClientRect();
            longPressAnchorX = event.clientX - rect.left;
            longPressAnchorY = event.clientY - rect.top;
            return; // Don't process as regular drag
        }

        if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isDragging = true;
            // Cancel long press timer when drag starts
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
            // Hide preset overlay on interaction (no longer accurate)
            hideViewInfo();
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

                fractalApp.noteInteraction(160);
            }

            // Update last mouse coordinates.
            lastX = event.clientX;
            lastY = event.clientY;

            fractalApp.draw();
            updateInfo(true);
        }
    }

    if (event.buttons === 2) {
        // If right long press zoom is active, update anchor for panning while zooming
        if (rightLongPressZoomActive) {
            const rect = canvas.getBoundingClientRect();
            rightLongPressAnchorX = event.clientX - rect.left;
            rightLongPressAnchorY = event.clientY - rect.top;
            return; // Don't process as rotation drag
        }

        if (!isRightDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isRightDragging = true;
            // Cancel right long press timer when rotation drag starts
            if (rightLongPressTimeout) {
                clearTimeout(rightLongPressTimeout);
                rightLongPressTimeout = null;
            }
            // Hide preset overlay on interaction (no longer accurate)
            hideViewInfo();
        }

        // Disable rotation in Riemann mode (breaks axes alignment)
        if (isRightDragging && !isRiemannMode()) {
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

    // Middle button held - update Julia preview
    if (event.buttons === 4 && isMiddleButtonHeld && !isJuliaMode()) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

        updateJuliaPreview(event.clientX, event.clientY, fx, fy);
    }
}

function handleMouseUp(event) {
    // Process only for left (0), middle (1), or right (2) mouse buttons.
    if (![0, 1, 2].includes(event.button)) return;

    event.preventDefault();
    event.stopPropagation();

    // Stop long press zoom-in on left button up
    if (event.button === 0) {
        if (longPressZoomActive) {
            stopLongPressZoomIn();
            return; // Don't process as click
        }
        // Cancel pending long press timer
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
        }
    }

    // Stop long press zoom-out on right button up
    if (event.button === 2) {
        if (rightLongPressZoomActive) {
            stopLongPressZoomOut();
            return; // Don't process as right-click
        }
        // Cancel pending right long press timer
        if (rightLongPressTimeout) {
            clearTimeout(rightLongPressTimeout);
            rightLongPressTimeout = null;
        }
    }

    if (event.button === 1) { // Middle-click - hide Julia preview
        if (isMiddleButtonHeld) {
            isMiddleButtonHeld = false;
            hideJuliaPreview();
        }
        return;
    }

    if (event.button === 0) { // Left click
        // Release drag cache
        hasDragRect = false;

        if (!isDragging) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            // If there is already a pending click, then we have a double-click.
            if (clickTimeout !== null) { // --- Double-click action ---
                clearTimeout(clickTimeout);
                clickTimeout = null;

                const targetZoom = fractalApp.zoom * ZOOM_STEP;
                if (targetZoom > fractalApp.MAX_ZOOM) {
                    // Use delta-based pan to preserve DD precision at deep zoom
                    let deltaPan = fractalApp.screenToPanDelta(mouseX, mouseY);

                    // Clamp to prevent panning out of view
                    deltaPan = clampPanDelta(fractalApp.pan, deltaPan);

                    console.log(`%c handleMouseUp: %c Double Left Click: Centering on ${mouseX}x${mouseY} -> delta [${deltaPan[0]}, ${deltaPan[1]}] zoom ${fractalApp.zoom.toFixed(6)} -> ${targetZoom}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
                    fractalApp.animatePanByAndZoomTo(deltaPan, targetZoom, 1000, EASE_TYPE.QUINT).then(resetAppState);
                } else {
                    console.log(`%c handleMouseUp: %c Double Left Click: Over max zoom. Skipping`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
                }
            } else {
                // Set a timeout for the single-click action.
                clickTimeout = setTimeout(() => {
                    // Use delta-based pan to preserve DD precision at deep zoom
                    let deltaPan = fractalApp.screenToPanDelta(mouseX, mouseY);

                    // Clamp to prevent panning out of view
                    deltaPan = clampPanDelta(fractalApp.pan, deltaPan);

                    console.log(`%c handleMouseUp: %c Single Left Click: Centering on ${mouseX}x${mouseY} -> delta [${deltaPan[0]}, ${deltaPan[1]}]`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

                    // Centering action using delta-based pan:
                    fractalApp.animatePanBy(deltaPan, 500).then(() => {
                        resetAppState();
                        // Get the updated fractal coordinates after pan
                        const [newFx, newFy] = fractalApp.screenToFractal(mouseX, mouseY);
                        if (isJuliaMode()) {
                            updateURLParams(FRACTAL_TYPE.JULIA, newFx, newFy, fractalApp.zoom, fractalApp.rotation, fractalApp.c[0], fractalApp.c[1], getCurrentPaletteId());
                        } else {
                            updateURLParams(FRACTAL_TYPE.MANDELBROT, newFx, newFy, fractalApp.zoom, fractalApp.rotation, null, null, getCurrentPaletteId());
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

        if (clickTimeout !== null) {
            // Double-click detected
            clearTimeout(clickTimeout);
            clickTimeout = null;

            const targetZoom = fractalApp.zoom / ZOOM_STEP;
            if (targetZoom < fractalApp.MIN_ZOOM) {
                // Use delta-based pan to preserve DD precision at deep zoom
                let deltaPan = fractalApp.screenToPanDelta(mouseX, mouseY);

                // Clamp to prevent panning out of view
                deltaPan = clampPanDelta(fractalApp.pan, deltaPan);

                console.log(`%c handleMouseUp: %c Double Right Click: Centering on ${mouseX}x${mouseY} -> delta [${deltaPan[0]}, ${deltaPan[1]}] zoom ${fractalApp.zoom.toFixed(6)} -> ${targetZoom}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
                fractalApp.animatePanByAndZoomTo(deltaPan, targetZoom, 1000, EASE_TYPE.QUINT).then(resetAppState);
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

function handleMouseLeave() {
    // Stop long press zooms if mouse leaves canvas
    stopLongPressZoomIn();
    stopLongPressZoomOut();

    // Hide Julia preview if mouse leaves canvas while middle button is held
    if (isMiddleButtonHeld) {
        isMiddleButtonHeld = false;
        hideJuliaPreview();
    }
}

// endregion -----------------------------------------------------------------------------------------------------------