/**
 * @module TouchEventHandlers
 * @author Radim Brnka
 * @description This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {expandComplexToString, normalizeRotation, updateURLParams} from '../global/utils.js';
import {isJuliaMode, resetAppState, updateInfo} from './ui.js';
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, FRACTAL_TYPE} from "../global/constants";

/** How long should we wait before distinguish between double tap and two single taps. */
const DOUBLE_TAP_THRESHOLD = 300;
/** Tolerance of finger movements before drag starts with move gesture. */
const DRAG_THRESHOLD = 5;
const ZOOM_STEP = 0.05;
/** Tolerance of finger movements before rotation starts with pinch gesture. */
const ROTATION_THRESHOLD = 0.05;
const ROTATION_SENSITIVITY = 1;

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
    fractalApp = app;
    canvas = app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    registerTouchEventHandlers(app);
}

/** Registers touch handlers. */
export function registerTouchEventHandlers() {
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
    if (!touchHandlersRegistered) {
        console.warn(`%c unregisterTouchEventHandlers: %c Event handlers are not registered so cannot be unregistered!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    canvas.removeEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.removeEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.removeEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = false;
    console.warn(`%c unregisterTouchEventHandlers: %c Event handlers unregistered`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

// region > EVENT HANDLERS ---------------------------------------------------------------------------------------------

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

        return;
    }

    if (event.touches.length === 2) {
        event.preventDefault();

        // Two-finger gesture: pinch zoom + rotation
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
        const dx = touch.clientX - touchDownX;
        const dy = touch.clientY - touchDownY;

        if (!isTouchDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isTouchDragging = true;
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

    // Two-finger pinch: zoom + rotation around midpoint
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
        if (!pinchStartDistance || !pinchStartAngle) {
            pinchStartDistance = currentDistance;
            pinchStartAngle = currentAngle;
            return;
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

        // Apply stable anchor zoom at midpoint (deep-zoom safe)
        fractalApp.setZoomKeepingAnchor(targetZoom, centerX, centerY);

        // Rotation (incremental, like mouse right-drag)
        const angleDifference = currentAngle - pinchStartAngle;
        if (Math.abs(angleDifference) > ROTATION_THRESHOLD) {
            fractalApp.rotation = normalizeRotation(fractalApp.rotation + angleDifference * ROTATION_SENSITIVITY);
        }

        pinchStartDistance = currentDistance;
        pinchStartAngle = currentAngle;

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
    }

    // When all touches end, decide if it was tap/double-tap or drag/pinch end.
    if (event.touches.length === 0) {
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
            const [fx, fy] = fractalApp.screenToFractal(touchX, touchY);

            if (touchClickTimeout !== null) {
                clearTimeout(touchClickTimeout);
                touchClickTimeout = null;

                console.log(`%c handleTouchEnd: %c Double Tap: Centering on ${touchX}x${touchY} which is fractal coords [${expandComplexToString([fx, fy])}]`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

                const targetZoom = fractalApp.zoom * ZOOM_STEP;
                if (targetZoom > fractalApp.MAX_ZOOM) {
                    fractalApp.animatePanAndZoomTo([fx, fy], targetZoom).then(resetAppState);
                }
            } else {
                touchClickTimeout = setTimeout(() => {
                    console.log(`%c handleTouchEnd: %c Single Tap Click: Centering on ${touchX}x${touchY} which is fractal coords ${expandComplexToString([fx, fy])}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

                    // Centering action:
                    fractalApp.animatePanTo([fx, fy], 400).then(() => {
                        resetAppState();
                        if (isJuliaMode()) {
                            updateURLParams(FRACTAL_TYPE.JULIA, fx, fy, fractalApp.zoom, fractalApp.rotation, fractalApp.c[0], fractalApp.c[1]);
                        } else {
                            updateURLParams(FRACTAL_TYPE.MANDELBROT, fx, fy, fractalApp.zoom, fractalApp.rotation);
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