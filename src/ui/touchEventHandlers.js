/**
 * @module TouchEventHandlers
 * @author Radim Brnka
 * @description This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.
 */

import {updateURLParams, clearURLParams, normalizeRotation} from '../global/utils.js';
import {
    isJuliaMode,
    resetActivePresetIndex,
    resetPresetAndDiveButtonStates,
    updateInfo
} from './ui.js';
import {DEFAULT_CONSOLE_GROUP_COLOR, FRACTAL_TYPE} from "../global/constants";

let fractalApp;
let canvas;
let touchHandlersRegistered = false;

// Store references to touch event handler functions
let handleTouchStartEvent;
let handleTouchMoveEvent;
let handleTouchEndEvent;

let isTouchDragging = false;
let touchClickTimeout = null;
let touchDownX = 0, touchDownY = 0;
let lastTouchX = 0, lastTouchY = 0;

// Pinch state variables
let isPinching = false;
let pinchStartDistance = null;
let pinchStartZoom = null;
let pinchStartPan = null;
let pinchStartCenterFractal = null;
let pinchStartAngle = null;

const dragThreshold = 5;
const doubleTapThreshold = 300;
const ZOOM_STEP = 0.05;
const ROTATION_SENSITIVITY = 1;

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
        console.warn(`%c registerTouchEventHandlers: %c Event handlers already registered!`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        return;
    }

    handleTouchStartEvent = (event) => handleTouchStart(event);
    handleTouchMoveEvent = (event) => handleTouchMove(event);
    handleTouchEndEvent = (event) => handleTouchEnd(event);

    canvas.addEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.addEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.addEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = true;
    console.log(`%c registerTouchEventHandlers: %c Touch event handlers registered`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
}

/** Unregisters touch handlers. */
export function unregisterTouchEventHandlers() {
    if (!touchHandlersRegistered) {
        console.warn(`%c unregisterTouchEventHandlers: %c Event handlers are not registered so cannot be unregistered!`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        return;
    }

    canvas.removeEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.removeEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.removeEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = false;
    console.warn(`%c unregisterTouchEventHandlers: %c Event handlers unregistered`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
}

// region > EVENT HANDLERS ---------------------------------------------------------------------------------------------

function handleTouchStart(event) {
    if (event.touches.length === 1) {
        event.preventDefault();
        isTouchDragging = false;
        isPinching = false;
        pinchStartDistance = null;
        const touch = event.touches[0];
        touchDownX = touch.clientX;
        touchDownY = touch.clientY;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    } else if (event.touches.length === 2) {
        event.preventDefault();
        isPinching = true;

        const touch0 = event.touches[0];
        const touch1 = event.touches[1];
        pinchStartDistance = Math.hypot(
            touch0.clientX - touch1.clientX,
            touch0.clientY - touch1.clientY
        );
        pinchStartZoom = fractalApp.zoom;
        pinchStartPan = [...fractalApp.pan];
        pinchStartAngle = Math.atan2(
            touch1.clientY - touch0.clientY,
            touch1.clientX - touch0.clientX
        );
        // Use the midpoint in screen coordinates
        const centerScreenX = (touch0.clientX + touch1.clientX) / 2;
        const centerScreenY = (touch0.clientY + touch1.clientY) / 2;
        pinchStartCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);
    }
}

function handleTouchMove(event) {
    if (event.touches.length === 1 && !isPinching) {
        // Handle single touch drag (no changes here)
        event.preventDefault();
        const touch = event.touches[0];
        const dx = touch.clientX - touchDownX;
        const dy = touch.clientY - touchDownY;

        if (!isTouchDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
            isTouchDragging = true;
            if (touchClickTimeout) {
                clearTimeout(touchClickTimeout);
                touchClickTimeout = null;
            }
        }

        if (isTouchDragging) {
            const rect = canvas.getBoundingClientRect();
            const moveX = touch.clientX - lastTouchX;
            const moveY = touch.clientY - lastTouchY;

            const cosR = Math.cos(-fractalApp.rotation);
            const sinR = Math.sin(-fractalApp.rotation);
            const rotatedMoveX = cosR * moveX - sinR * moveY; // Apply rotation matrix
            const rotatedMoveY = sinR * moveX + cosR * moveY;

            fractalApp.pan[0] -= (rotatedMoveX / rect.width) * fractalApp.zoom;
            fractalApp.pan[1] += (rotatedMoveY / rect.height) * fractalApp.zoom;

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;

            fractalApp.draw();
            updateInfo();
        }
        return;
    }

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

        // Calculate the midpoint in screen space.
        const centerScreenX = (touch0.clientX + touch1.clientX) / 2;
        const centerScreenY = (touch0.clientY + touch1.clientY) / 2;

        if (!pinchStartDistance || !pinchStartAngle || !pinchStartCenterFractal) {
            pinchStartDistance = currentDistance;
            pinchStartZoom = fractalApp.zoom;
            pinchStartAngle = currentAngle;
            pinchStartPan = [...fractalApp.pan];
            pinchStartCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);
            return;
        }

        // Update zoom from pinch distance.
        const zoomFactor = pinchStartDistance / currentDistance;
        fractalApp.zoom = pinchStartZoom * zoomFactor;

        // Update rotation.
        const angleDifference = currentAngle - pinchStartAngle;
        if (Math.abs(angleDifference) > 0.05) {
            fractalApp.rotation = normalizeRotation(fractalApp.rotation + angleDifference * ROTATION_SENSITIVITY);
        }

        // Recalculate the fractal center from the midpoint.
        const newCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);
        // Adjust pan so that the fractal center remains the same.
        fractalApp.pan[0] += pinchStartCenterFractal[0] - newCenterFractal[0];
        fractalApp.pan[1] += pinchStartCenterFractal[1] - newCenterFractal[1];

        // Update starting values for the next move.
        pinchStartAngle = currentAngle;
        pinchStartCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);

        fractalApp.draw();
        updateInfo();
    }
}

function handleTouchEnd(event) {
    // Reset pinch state if fewer than two touches remain.
    if (event.touches.length < 2) {
        pinchStartDistance = null;
        pinchStartZoom = null;
        pinchStartAngle = null;
        pinchStartPan = null;
    }

    if (event.touches.length === 0) {
        if (isPinching) {
            isPinching = false;
            return;
        }

        if (!isTouchDragging) {
            const touch = event.changedTouches[0];
            // Use visual viewport or canvas bounding rect for touch position.
            const rect = canvas.getBoundingClientRect();
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;
            const [fx, fy] = fractalApp.screenToFractal(touchX, touchY);

            if (touchClickTimeout !== null) {
                clearTimeout(touchClickTimeout);
                touchClickTimeout = null;

                console.log(`Double-tap: Centering on ${touchX}, ${touchY} -> fractal coords ${fx}, ${fy}`);
                const targetZoom = fractalApp.zoom * ZOOM_STEP;
                if (targetZoom > fractalApp.MAX_ZOOM) {
                    fractalApp.animatePanAndZoomTo([fx, fy], targetZoom).then(() => {
                        resetPresetAndDiveButtonStates();
                        resetActivePresetIndex();
                        clearURLParams();
                    });
                }
            } else {
                touchClickTimeout = setTimeout(() => {
                    console.log(`Single-tap: Centering on ${touchX}, ${touchY} -> fractal coords ${fx}, ${fy}`);
                    if (isJuliaMode()) {
                        updateURLParams(FRACTAL_TYPE.JULIA, fx, fy, fractalApp.zoom, fractalApp.rotation, fractalApp.c[0], fractalApp.c[1]);
                    } else {
                        updateURLParams(FRACTAL_TYPE.MANDELBROT, fx, fy, fractalApp.zoom, fractalApp.rotation);
                    }
                    fractalApp.animatePan([fx, fy], 500).then(() => {
                        resetPresetAndDiveButtonStates();
                        resetActivePresetIndex();
                    });
                    touchClickTimeout = null;
                }, doubleTapThreshold);
            }
        }
        resetPresetAndDiveButtonStates();
        resetActivePresetIndex();
        clearURLParams();
        isTouchDragging = false;
    }
}

// endregion -----------------------------------------------------------------------------------------------------------