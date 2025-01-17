/**
 * @module TouchEventHandlers
 * @author Radim Brnka
 */
import { updateURLParams, clearURLParams } from './utils.js';
import { updateInfo } from './ui.js';

export function registerTouchEventHandlers(fractalApp) {
    const canvas = fractalApp.canvas;

    const dragThreshold = 5;
    const doubleTapThreshold = 300;

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

    canvas.addEventListener('touchstart', (event) => {
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
    }, { passive: false });

    canvas.addEventListener('touchmove', (event) => {
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
            }
            return;
        }

        if (event.touches.length === 2) {
            // Handle pinch-to-zoom and rotate
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

            if (!pinchStartDistance || !pinchStartAngle) {
                // Initialize pinch state
                pinchStartDistance = currentDistance;
                pinchStartZoom = fractalApp.zoom;
                pinchStartAngle = currentAngle;
                return;
            }

            // Update zoom
            const zoomFactor = pinchStartDistance / currentDistance;
            fractalApp.zoom = pinchStartZoom * zoomFactor;

            // Update rotation only if there is a significant angle change
            const angleDifference = currentAngle - pinchStartAngle;
            if (Math.abs(angleDifference) > 0.01) { // Apply a threshold to ignore minor angle changes
                const rotationSpeed = 0.5; // Adjust sensitivity for rotation
                fractalApp.rotation += angleDifference * rotationSpeed;
                pinchStartAngle = currentAngle; // Reset the start angle to avoid compounding rotation
            }

            fractalApp.draw();
            updateInfo(event);
        }
    }, { passive: false });


    canvas.addEventListener('touchend', (event) => {
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

                    const targetZoom = fractalApp.zoom * 0.05;
                    if (targetZoom > 0.000017) {
                        fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000);
                    }
                } else {
                    touchClickTimeout = setTimeout(() => {
                        updateURLParams(fx, fy, fractalApp.zoom);
                        fractalApp.animatePanAndZoomTo([fx, fy], fractalApp.zoom, 500);
                        touchClickTimeout = null;
                    }, doubleTapThreshold);
                }
            }
            isTouchDragging = false;
        }
    }, { passive: false });
}
