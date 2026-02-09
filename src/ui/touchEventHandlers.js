/**
 * @module TouchEventHandlers
 * @author Radim Brnka
 * @description This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {normalizeRotation, updateURLParams} from '../global/utils.js';
import {getCurrentPaletteId, isJuliaMode, isRiemannMode, resetAppState, updateInfo} from './ui.js';
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, FRACTAL_TYPE} from "../global/constants";
import {clampPanDelta} from "./mouseEventHandlers";

/** How long should we wait before distinguish between double tap and two single taps. */
const DOUBLE_TAP_THRESHOLD = 300;
/** Tolerance of finger movements before drag starts with move gesture. */
const DRAG_THRESHOLD = 5;
const ZOOM_STEP = 0.05;
/** Tolerance of finger movements before rotation starts with pinch gesture. */
const ROTATION_THRESHOLD = 0.05;
const ROTATION_SENSITIVITY = 1;

/** Long press zoom configuration */
const LONG_PRESS_THRESHOLD = 400; // ms before zoom starts
const LONG_PRESS_ZOOM_IN_FACTOR = 0.965; // zoom multiplier per frame (smaller = faster zoom in)

let canvas;
let fractalApp;

/** Global variable to track registration */
let touchHandlersRegistered = false;

// Stored references to event handler functions
let handleTouchStartEvent;
let handleTouchMoveEvent;
let handleTouchEndEvent;

let touchDownX = 0, touchDownY = 0;
let lastTouchX = 0, lastTouchY = 0;
let touchClickTimeout = null;
let isTouchDragging = false;

// Cached rect (avoid layout thrash / inconsistencies during drag)
let dragRectLeft = 0;
let dragRectTop = 0;
let hasDragRect = false;

// Pinch state variables
let isPinching = false;
let pinchStartDistance = null;
let pinchStartAngle = null;
let lastPinchCenterX = null;
let lastPinchCenterY = null;

// Long press zoom state
let longPressTimeout = null;
let longPressZoomActive = false;
let longPressZoomRAF = null;
let longPressAnchorX = 0;
let longPressAnchorY = 0;

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
export function initTouchHandlers(app) {
    if (!app || !app.canvas) {
        console.warn(`%c initTouchHandlers: %c App or canvas not provided.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    fractalApp = app;
    canvas = app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    registerTouchEventHandlers();
}

/** Registers touch handlers. */
export function registerTouchEventHandlers() {
    if (!canvas) {
        console.warn(`%c registerTouchEventHandlers: %c Canvas not initialized. Call initTouchHandlers first.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    if (touchHandlersRegistered) {
        console.warn(`%c registerTouchEventHandlers: %c Event handlers already registered!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    handleTouchStartEvent = (event) => handleTouchStart(event);
    handleTouchMoveEvent = (event) => handleTouchMove(event);
    handleTouchEndEvent = (event) => handleTouchEnd(event);

    canvas.addEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.addEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.addEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = true;
    console.log(`%c registerTouchEventHandlers: %c Touch event handlers registered`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

/** Unregisters touch handlers. */
export function unregisterTouchEventHandlers() {
    if (!canvas || !touchHandlersRegistered) {
        return;
    }

    canvas.removeEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.removeEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.removeEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = false;
    console.warn(`%c unregisterTouchEventHandlers: %c Event handlers unregistered`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

// region > EVENT HANDLERS ---------------------------------------------------------------------------------------------

/**
 * Start the continuous long press zoom-in loop for touch.
 * Zooms in toward the anchor point while allowing panning.
 */
function startLongPressZoomIn() {
    if (longPressZoomActive) return;
    longPressZoomActive = true;

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
 * Stop the long press zoom-in loop for touch.
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
        resetAppState();
    }
}

function handleTouchStart(event) {
    if (!fractalApp) return;

    if (event.touches.length === 1) {
        event.preventDefault();

        isTouchDragging = false;
        isPinching = false;

        pinchStartDistance = null;
        pinchStartAngle = null;

        const touch = event.touches[0];
        touchDownX = touch.clientX;
        touchDownY = touch.clientY;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        // Cache rect origin for stable relative coordinates during the drag.
        const rect = canvas.getBoundingClientRect();
        dragRectLeft = rect.left;
        dragRectTop = rect.top;
        hasDragRect = true;

        // Set up long press zoom anchor (relative to canvas)
        longPressAnchorX = touch.clientX - rect.left;
        longPressAnchorY = touch.clientY - rect.top;

        // Start long press timer
        if (longPressTimeout) clearTimeout(longPressTimeout);
        longPressTimeout = setTimeout(() => {
            // Only start zoom if we haven't started dragging or pinching
            if (!isTouchDragging && !isPinching) {
                startLongPressZoomIn();
            }
        }, LONG_PRESS_THRESHOLD);

        return;
    }

    if (event.touches.length === 2) {
        event.preventDefault();

        // Stop any long press zoom when switching to pinch
        stopLongPressZoomIn();

        // Two-finger gesture: pinch zoom + rotation + pan
        isPinching = true;
        isTouchDragging = false;

        // Release drag cache (rect on-demand for pinch)
        hasDragRect = false;

        const touch0 = event.touches[0];
        const touch1 = event.touches[1];

        pinchStartDistance = Math.hypot(
            touch0.clientX - touch1.clientX,
            touch0.clientY - touch1.clientY
        );

        pinchStartAngle = Math.atan2(
            touch1.clientY - touch0.clientY,
            touch1.clientX - touch0.clientX
        );

        // Initialize midpoint for panning
        const rect = canvas.getBoundingClientRect();
        const centerClientX = (touch0.clientX + touch1.clientX) / 2;
        const centerClientY = (touch0.clientY + touch1.clientY) / 2;
        lastPinchCenterX = centerClientX - rect.left;
        lastPinchCenterY = centerClientY - rect.top;

        // Stop any pending single-tap click when pinch starts
        if (touchClickTimeout) {
            clearTimeout(touchClickTimeout);
            touchClickTimeout = null;
        }

        fractalApp.noteInteraction(160);
    }
}

function handleTouchMove(event) {
    if (!fractalApp) return;

    // Single touch drag (pan)
    if (event.touches.length === 1 && !isPinching) {
        event.preventDefault();

        const touch = event.touches[0];

        // If long press zoom is active, update anchor for panning while zooming
        if (longPressZoomActive) {
            const rect = canvas.getBoundingClientRect();
            longPressAnchorX = touch.clientX - rect.left;
            longPressAnchorY = touch.clientY - rect.top;
            return; // Don't process as regular drag
        }

        const dx = touch.clientX - touchDownX;
        const dy = touch.clientY - touchDownY;

        if (!isTouchDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isTouchDragging = true;
            // Cancel long press timer when drag starts
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
            if (touchClickTimeout) {
                clearTimeout(touchClickTimeout);
                touchClickTimeout = null;
            }
        }

        if (isTouchDragging) {
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
            const lastRelX = lastTouchX - left;
            const lastRelY = lastTouchY - top;
            const nowRelX = touch.clientX - left;
            const nowRelY = touch.clientY - top;

            const [vLastX, vLastY] = fractalApp.screenToViewVector(lastRelX, lastRelY);
            const [vNowX,  vNowY ] = fractalApp.screenToViewVector(nowRelX, nowRelY);

            if (Number.isFinite(fractalApp.zoom)) {
                const deltaX = (vLastX - vNowX) * fractalApp.zoom;
                const deltaY = (vLastY - vNowY) * fractalApp.zoom;

                fractalApp.addPan(deltaX, deltaY);
                markOrbitDirtySafe();
                fractalApp.noteInteraction(160);
            }

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;

            fractalApp.draw();
            updateInfo(true);
        }

        return;
    }

    // Two-finger pinch: pan + zoom + rotation around midpoint
    if (event.touches.length === 2) {
        event.preventDefault();
        isPinching = true;

        const touch0 = event.touches[0];
        const touch1 = event.touches[1];

        const currentDistance = Math.hypot(
            touch0.clientX - touch1.clientX,
            touch0.clientY - touch1.clientY
        );

        const currentAngle = Math.atan2(
            touch1.clientY - touch0.clientY,
            touch1.clientX - touch0.clientX
        );

        // Midpoint in screen space
        const centerClientX = (touch0.clientX + touch1.clientX) / 2;
        const centerClientY = (touch0.clientY + touch1.clientY) / 2;

        const rect = canvas.getBoundingClientRect();
        const centerX = centerClientX - rect.left; // CSS px relative to canvas
        const centerY = centerClientY - rect.top;

        // Initialize baseline if missing (or if gesture restarted)
        if (!pinchStartDistance || !pinchStartAngle || lastPinchCenterX === null || lastPinchCenterY === null) {
            pinchStartDistance = currentDistance;
            pinchStartAngle = currentAngle;
            lastPinchCenterX = centerX;
            lastPinchCenterY = centerY;
            return;
        }

        // Pan: detect midpoint movement and apply pan delta
        const centerDeltaX = centerX - lastPinchCenterX;
        const centerDeltaY = centerY - lastPinchCenterY;

        if (Math.abs(centerDeltaX) > 0.1 || Math.abs(centerDeltaY) > 0.1) {
            // Convert screen delta to view delta and apply pan
            const [vLastX, vLastY] = fractalApp.screenToViewVector(lastPinchCenterX, lastPinchCenterY);
            const [vNowX, vNowY] = fractalApp.screenToViewVector(centerX, centerY);

            if (Number.isFinite(fractalApp.zoom)) {
                const deltaX = (vLastX - vNowX) * fractalApp.zoom;
                const deltaY = (vLastY - vNowY) * fractalApp.zoom;
                fractalApp.addPan(deltaX, deltaY);
            }
        }

        // Zoom:
        // If distance increases -> zoom in (smaller zoom value).
        // So scale zoom proportionally: zoom *= (startDistance / currentDistance)
        let targetZoom = fractalApp.zoom;
        if (currentDistance > 0) {
            const zoomFactor = pinchStartDistance / currentDistance;
            targetZoom = fractalApp.zoom * zoomFactor;
        }

        // Clamp (same semantics as your mouse/wheel handlers)
        if (targetZoom < fractalApp.MAX_ZOOM) targetZoom = fractalApp.MAX_ZOOM;
        if (targetZoom > fractalApp.MIN_ZOOM) targetZoom = fractalApp.MIN_ZOOM;

        // Apply zoom (without anchor adjustment since we handled pan separately)
        fractalApp.zoom = targetZoom;

        // Rotation (incremental, like mouse right-drag) - disabled in Riemann mode
        if (!isRiemannMode()) {
            const angleDifference = currentAngle - pinchStartAngle;
            if (Math.abs(angleDifference) > ROTATION_THRESHOLD) {
                fractalApp.rotation = normalizeRotation(fractalApp.rotation + angleDifference * ROTATION_SENSITIVITY);
            }
        }

        // Update baselines for next frame
        pinchStartDistance = currentDistance;
        pinchStartAngle = currentAngle;
        lastPinchCenterX = centerX;
        lastPinchCenterY = centerY;

        markOrbitDirtySafe();
        fractalApp.noteInteraction(160);

        fractalApp.draw();
        updateInfo();
    }
}

function handleTouchEnd(event) {
    if (!fractalApp) return;

    // Reset pinch baseline when leaving 2-finger gesture.
    if (event.touches.length < 2) {
        pinchStartDistance = null;
        pinchStartAngle = null;
        lastPinchCenterX = null;
        lastPinchCenterY = null;
    }

    // When all touches end, decide if it was tap/double-tap or drag/pinch end.
    if (event.touches.length === 0) {
        // Stop long press zoom on touch end
        if (longPressZoomActive) {
            stopLongPressZoomIn();
            return; // Don't process as tap
        }
        // Cancel pending long press timer
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
        }

        // End of a pinch gesture: just settle.
        if (isPinching) {
            isPinching = false;
            resetAppState();

            // Final settle rebuild request (renderer decides when to rebuild)
            markOrbitDirtySafe();
            fractalApp.draw();

            return;
        }

        // Release drag cache
        hasDragRect = false;

        if (!isTouchDragging) {
            const touch = event.changedTouches[0];

            const rect = canvas.getBoundingClientRect();
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;

            if (touchClickTimeout !== null) {
                clearTimeout(touchClickTimeout);
                touchClickTimeout = null;

                // Use delta-based pan to preserve DD precision at deep zoom
                let deltaPan = fractalApp.screenToPanDelta(touchX, touchY);

                // Clamp to prevent panning out of view
                deltaPan = clampPanDelta(fractalApp.pan, deltaPan);

                console.log(`%c handleTouchEnd: %c Double Tap: Centering on ${touchX}x${touchY} -> delta [${deltaPan[0]}, ${deltaPan[1]}]`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

                const targetZoom = fractalApp.zoom * ZOOM_STEP;
                if (targetZoom > fractalApp.MAX_ZOOM) {
                    fractalApp.animatePanByAndZoomTo(deltaPan, targetZoom).then(resetAppState);
                }
            } else {
                touchClickTimeout = setTimeout(() => {
                    // Use delta-based pan to preserve DD precision at deep zoom
                    let deltaPan = fractalApp.screenToPanDelta(touchX, touchY);

                    // Clamp to prevent panning out of view
                    deltaPan = clampPanDelta(fractalApp.pan, deltaPan);

                    console.log(`%c handleTouchEnd: %c Single Tap Click: Centering on ${touchX}x${touchY} -> delta [${deltaPan[0]}, ${deltaPan[1]}]`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

                    // Centering action using delta-based pan:
                    fractalApp.animatePanBy(deltaPan, 400).then(() => {
                        resetAppState();
                        // Get the updated fractal coordinates after pan
                        const [newFx, newFy] = fractalApp.screenToFractal(touchX, touchY);
                        if (isJuliaMode()) {
                            updateURLParams(FRACTAL_TYPE.JULIA, newFx, newFy, fractalApp.zoom, fractalApp.rotation, fractalApp.c[0], fractalApp.c[1], getCurrentPaletteId());
                        } else {
                            updateURLParams(FRACTAL_TYPE.MANDELBROT, newFx, newFy, fractalApp.zoom, fractalApp.rotation, null, null, getCurrentPaletteId());
                        }
                    });

                    touchClickTimeout = null;
                }, DOUBLE_TAP_THRESHOLD);
            }
        } else {
            resetAppState();
            isTouchDragging = false;

            // Final settle rebuild request (renderer decides when to rebuild)
            markOrbitDirtySafe();
            fractalApp.draw();
        }

        isTouchDragging = false;
    }
}

// endregion -----------------------------------------------------------------------------------------------------------