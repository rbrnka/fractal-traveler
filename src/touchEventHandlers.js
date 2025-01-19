/**
 * @module TouchEventHandlers
 * @author Radim Brnka
 */
import {updateURLParams, clearURLParams} from './utils.js';
import {updateInfo} from './ui.js';

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


export function initTouchHandlers(app) {
    fractalApp = app;
    canvas = app.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    registerTouchEventHandlers(app);
}

export function registerTouchEventHandlers() {
    if (touchHandlersRegistered) {
        console.warn('Touch event handlers already registered.');
        return; // Prevent duplicate registration
    }

    // Define event handler functions
    handleTouchStartEvent = (event) => handleTouchStart(event);
    handleTouchMoveEvent = (event) => handleTouchMove(event);
    handleTouchEndEvent = (event) => handleTouchEnd(event);
    // Attach handlers
    canvas.addEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.addEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.addEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = true;
}


export function unregisterTouchEventHandlers() {
    if (!touchHandlersRegistered) {
        console.warn('Mouse event handlers are not registered.');
        return;
    }

    canvas.removeEventListener('touchstart', handleTouchStartEvent, {passive: false});
    canvas.removeEventListener('touchmove', handleTouchMoveEvent, {passive: false});
    canvas.removeEventListener('touchend', handleTouchEndEvent, {passive: false});

    touchHandlersRegistered = false;
}

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
        pinchStartPan = fractalApp.pan.slice();
        pinchStartAngle = Math.atan2(
            touch1.clientY - touch0.clientY,
            touch1.clientX - touch0.clientX
        );
        pinchStartCenterFractal = fractalApp.screenToFractal(
            (touch0.clientX + touch1.clientX) / 2,
            (touch0.clientY + touch1.clientY) / 2
        );
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
            clearURLParams();
            const rect = canvas.getBoundingClientRect();
            const moveX = touch.clientX - lastTouchX;
            const moveY = touch.clientY - lastTouchY;

            fractalApp.pan[0] -= (moveX / rect.width) * fractalApp.zoom;
            fractalApp.pan[1] += (moveY / rect.height) * fractalApp.zoom;

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;

            fractalApp.draw();
            updateInfo(null, false);
        }
        return;
    }

    if (event.touches.length === 2) {
        // Handle pinch-to-zoom, rotate, and pan
        event.preventDefault();
        isPinching = true;

        const touch0 = event.touches[0];
        const touch1 = event.touches[1];

        // Calculate current distance and angle between touch points
        const currentDistance = Math.hypot(
            touch0.clientX - touch1.clientX,
            touch0.clientY - touch1.clientY
        );
        const currentAngle = Math.atan2(
            touch1.clientY - touch0.clientY,
            touch1.clientX - touch0.clientX
        );

        // Calculate the midpoint of the two touch points (screen space)
        const centerScreenX = (touch0.clientX + touch1.clientX) / 2;
        const centerScreenY = (touch0.clientY + touch1.clientY) / 2;

        if (!pinchStartDistance || !pinchStartAngle || !pinchStartCenterFractal) {
            // Initialize pinch state
            pinchStartDistance = currentDistance;
            pinchStartZoom = fractalApp.zoom;
            pinchStartAngle = currentAngle;
            pinchStartPan = fractalApp.pan.slice();
            pinchStartCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);
            return;
        }

        // Update zoom based on pinch distance
        const zoomFactor = pinchStartDistance / currentDistance;
        fractalApp.zoom = pinchStartZoom * zoomFactor;

        // Update rotation based on pinch angle
        const angleDifference = currentAngle - pinchStartAngle;
        const rotationSpeed = 1; // Adjust sensitivity for rotation
        if (Math.abs(angleDifference) > 0.05) { // Larger threshold
            fractalApp.rotation += angleDifference * rotationSpeed;
        }

        // Recalculate the pan to keep the fractal's center consistent
        const newCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);
        fractalApp.pan[0] += pinchStartCenterFractal[0] - newCenterFractal[0];
        fractalApp.pan[1] += pinchStartCenterFractal[1] - newCenterFractal[1];

        // Update the starting angle and center for the next movement
        pinchStartAngle = currentAngle;
        pinchStartCenterFractal = fractalApp.screenToFractal(centerScreenX, centerScreenY);

        // Redraw fractal with the updated transformations
        fractalApp.draw();
        updateInfo(null, false);
    }
}


function handleTouchEnd(event) {
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
            const rect = canvas.getBoundingClientRect();
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;
            const [fx, fy] = fractalApp.screenToFractal(touchX, touchY);

            if (touchClickTimeout !== null) {
                clearTimeout(touchClickTimeout);
                touchClickTimeout = null;

                // --- Double-tap logic with smooth animation ---
                const targetZoom = fractalApp.zoom * 0.05;
                if (targetZoom > 0.000017) {
                    const zoomFactor = targetZoom / fractalApp.zoom;

                    // Smoothly animate to the new position and zoom
                    fractalApp.animatePanAndZoomTo(
                        [
                            fx - (fx - fractalApp.pan[0]) * zoomFactor,
                            fy - (fy - fractalApp.pan[1]) * zoomFactor,
                        ],
                        targetZoom,
                        1000 // Animation duration
                    );
                }
            } else {
                // --- Single-tap logic ---
                touchClickTimeout = setTimeout(() => {
                    updateURLParams(fx, fy, fractalApp.zoom);
                    fractalApp.animatePanAndZoomTo([fx, fy], fractalApp.zoom, 500);
                    touchClickTimeout = null;
                }, doubleTapThreshold);
            }
        }
        isTouchDragging = false;
    }
}

