// touchEventHandlers.js
import {updateURLParams, clearURLParams} from './utils.js';
import {updateInfo} from './ui.js';

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
    let pinchStartCenterScreen = null;
    let pinchStartCenterFractal = null;

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
            pinchStartDistance = Math.hypot(touch0.clientX - touch1.clientX,
                touch0.clientY - touch1.clientY);
            pinchStartZoom = fractalApp.zoom;
            pinchStartPan = fractalApp.pan.slice();
            pinchStartCenterScreen = {
                x: (touch0.clientX + touch1.clientX) / 2,
                y: (touch0.clientY + touch1.clientY) / 2
            };
            pinchStartCenterFractal = fractalApp.screenToFractal(pinchStartCenterScreen.x,
                pinchStartCenterScreen.y);
        }
    }, {passive: false});

    canvas.addEventListener('touchmove', (event) => {
        if (event.touches.length === 1 && !isPinching) {
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
            //fractalApp.updateInfo(event);
        } else if (event.touches.length === 2) {
            event.preventDefault();
            isPinching = true;
            const touch0 = event.touches[0];
            const touch1 = event.touches[1];
            const currentDistance = Math.hypot(touch0.clientX - touch1.clientX,
                touch0.clientY - touch1.clientY);
            if (!pinchStartDistance) {
                pinchStartDistance = currentDistance;
                pinchStartZoom = fractalApp.zoom;
                return;
            }
            const newZoom = pinchStartZoom * (pinchStartDistance / currentDistance);
            const rect = canvas.getBoundingClientRect();
            const currentCenterScreen = {
                x: (touch0.clientX + touch1.clientX) / 2,
                y: (touch0.clientY + touch1.clientY) / 2
            };
            const aspect = rect.width / rect.height;
            let normX = currentCenterScreen.x / rect.width - 0.5;
            let normY = (rect.height - currentCenterScreen.y) / rect.height - 0.5;
            normX *= aspect;
            const newPan = [
                pinchStartCenterFractal[0] - (normX * newZoom),
                pinchStartCenterFractal[1] - (normY * newZoom)
            ];
            fractalApp.zoom = newZoom;
            fractalApp.pan = newPan;
            fractalApp.draw();
            updateInfo(event);
        }
    }, {passive: false});

    canvas.addEventListener('touchend', (event) => {
        if (event.touches.length < 2) {
            pinchStartDistance = null;
            pinchStartZoom = null;
            pinchStartCenterScreen = null;
            pinchStartCenterFractal = null;
        }
        if (event.touches.length === 0) {
            if (isPinching) {
                isPinching = false;
                return;
            }
            if (!isTouchDragging) {
                const touch = event.changedTouches[0];
                const rect = canvas.getBoundingClientRect();
                const mouseX = touch.clientX - rect.left;
                const mouseY = touch.clientY - rect.top;
                const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);
                if (touchClickTimeout !== null) {
                    clearTimeout(touchClickTimeout);
                    touchClickTimeout = null;
                    console.log("Double Tap at", fx, fy);
                    const targetZoom = fractalApp.zoom * 0.05;
                    if (targetZoom > 0.000018) {
                        fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000);
                    }
                } else {
                    touchClickTimeout = setTimeout(() => {
                        fractalApp.pan[0] = fx;
                        fractalApp.pan[1] = fy;
                        console.log("Single Tap: Centering on", fx, fy);
                        updateURLParams(fx, fy, fractalApp.zoom);
                        navigator.clipboard.writeText(document.getElementById("infoText").textContent).then(() => {
                            console.log('Copied info to clipboard!');
                        }, (err) => {
                            console.error('Failed to copy info to clipboard:', err);
                        });
                        //fractalApp.updateInfo(event);
                        fractalApp.draw();
                        touchClickTimeout = null;
                    }, doubleTapThreshold);
                }
            }
            isTouchDragging = false;
        }
    }, {passive: false});
}
