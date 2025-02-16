/**
 * @module MouseEventHandlers
 * @author Radim Brnka
 * @description This module exports a function registerTouchEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.
 */

import {expandComplexToString, normalizeRotation, updateURLParams} from '../global/utils.js';
import {isJuliaMode, resetAppState, toggleDebugLines, updateInfo} from './ui.js';
import {DEFAULT_CONSOLE_GROUP_COLOR, FRACTAL_TYPE} from "../global/constants";

const DOUBLE_CLICK_THRESHOLD = 300;
const DRAG_THRESHOLD = 5;
const ZOOM_STEP = 0.05; // Common for both zoom-in and out

/** Global variable to track registration */
let mouseHandlersRegistered = false;

// Stored references to event handler functions
let handleWheelEvent;
let handleMouseDownEvent;
let handleMouseMoveEvent;
let handleMouseUpEvent;

let canvas;
let fractalApp;

let mouseDownX = 0, mouseDownY = 0;
let lastX = 0, lastY = 0;
let clickTimeout = null;
let isDragging = false;

// Rotation
let isRightDragging = false;
let startX = 0;

/**
 * Initialization and registering of the event handlers.
 * @param {FractalRenderer} app
 */
export function initMouseHandlers(app) {
    fractalApp = app;
    canvas = fractalApp.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    registerMouseEventHandlers(app);
}

/** Registers mouse handlers. */
export function registerMouseEventHandlers() {
    if (mouseHandlersRegistered) {
        console.warn(`%c registerMouseEventHandlers: %c Mouse event handlers already registered!`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
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
    console.log(`%c registerMouseEventHandlers: %c Event handlers registered`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
}

/** Unregisters mouse handlers. */
export function unregisterMouseEventHandlers() {
    if (!mouseHandlersRegistered) {
        console.warn(`%c registerMouseEventHandlers: %c Event handlers are not registered so cannot be unregistered!`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        return;
    }

    canvas.removeEventListener('wheel', handleWheelEvent, {passive: false});
    canvas.removeEventListener('mousedown', handleMouseDownEvent);
    canvas.removeEventListener('mousemove', handleMouseMoveEvent);
    canvas.removeEventListener('mouseup', handleMouseUpEvent);

    mouseHandlersRegistered = false;
    console.warn(`%c registerMouseEventHandlers: %c Event handlers unregistered`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
}

// region > EVENT HANDLERS ---------------------------------------------------------------------------------------------

function handleWheel(event) {
    event.preventDefault();

    resetAppState();

    // Get the CSS coordinate of the mouse relative to the canvas
    const rect = fractalApp.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Get fractal coordinates before zooming
    const [fxOld, fyOld] = fractalApp.screenToFractal(mouseX, mouseY);

    // Determine zoom factor based on wheel direction
    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;

    const targetZoom = fractalApp.zoom * zoomFactor;
    if (targetZoom < fractalApp.MAX_ZOOM || targetZoom > fractalApp.MIN_ZOOM) {
        return;
    }

    fractalApp.zoom *= zoomFactor; // No animation, direct change.

    // Get fractal coordinates after zooming (using the same mouse position)
    const [fxNew, fyNew] = fractalApp.screenToFractal(mouseX, mouseY);

    // Adjust pan to keep the fractal point under the mouse cursor fixed
    fractalApp.pan[0] -= fxNew - fxOld;
    fractalApp.pan[1] -= fyNew - fyOld;

    updateInfo();
    fractalApp.draw();
}

function handleMouseDown(event) {
    if (event.button === 0) {
        isDragging = false;
        mouseDownX = event.clientX;
        mouseDownY = event.clientY;
        lastX = event.clientX;
        lastY = event.clientY;
    } else if (event.button === 2) { // Right-click
        isRightDragging = true;
        startX = event.clientX;
    }
}

function handleMouseMove(event) {
    if (event.buttons === 1) {
        const dx = event.clientX - mouseDownX;
        const dy = event.clientY - mouseDownY;

        if (!isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            isDragging = true;
        }

        if (isDragging) {
            canvas.style.cursor = 'move';
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
            }

            const rect = canvas.getBoundingClientRect();
            const moveX = event.clientX - lastX;
            const moveY = event.clientY - lastY;

            // Adjust panning to account for rotation
            const cosR = Math.cos(-fractalApp.rotation); // Negative for counterclockwise rotation
            const sinR = Math.sin(-fractalApp.rotation);
            const rotatedMoveX = cosR * moveX - sinR * moveY; // Apply rotation matrix
            const rotatedMoveY = sinR * moveX + cosR * moveY;

            fractalApp.pan[0] -= (rotatedMoveX / rect.width) * fractalApp.zoom;
            fractalApp.pan[1] += (rotatedMoveY / rect.height) * fractalApp.zoom;

            lastX = event.clientX;
            lastY = event.clientY;

            fractalApp.draw();
            updateInfo();
        }
    }

    if (isRightDragging) {
        event.preventDefault(); // Prevent default actions during dragging
        const deltaX = event.clientX - startX;
        const rotationSpeed = 0.01; // Adjust rotation speed as needed

        fractalApp.rotation += deltaX * rotationSpeed;
        fractalApp.rotation = normalizeRotation(fractalApp.rotation);

        startX = event.clientX; // Update starting point for smooth rotation
        canvas.style.cursor = 'grabbing'; // Use a grabbing cursor for rotation
        fractalApp.draw(); // Redraw with the updated rotation
        updateInfo();
    }
}

function handleMouseUp(event) {
    // Process only for left (0), middle (1), or right (2) mouse buttons.
    if (![0, 1, 2].includes(event.button)) return;

    event.preventDefault(); // Stop browser-specific behaviors
    event.stopPropagation(); // Prevent bubbling to parent elements

    if (event.button === 1) { // Middle-click toggles the lines
        console.log(`%c handleMouseUp: %c Middle Click - Toggling lines`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

        toggleDebugLines();
        return; // Exit early since middle-click doesn't involve dragging or centering.
    }

    // We check if the click was not a drag.
    if (event.button === 0) { // Left-click
        if (!isDragging) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;  // in CSS pixels
            const mouseY = event.clientY - rect.top;     // in CSS pixels
            const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

            // If there is already a pending click, then we have a double-click.
            if (clickTimeout !== null) { // --- Double-click action ---
                clearTimeout(clickTimeout);
                clickTimeout = null;

                console.log(`%c handleMouseUp: %c Double Left Click: Centering on ${mouseX}x${mouseY} which is fractal coords [${expandComplexToString([fx, fy])}]`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

                const targetZoom = fractalApp.zoom * ZOOM_STEP;
                if (targetZoom > fractalApp.MAX_ZOOM) {
                    fractalApp.animatePanAndZoomTo([fx, fy], targetZoom).then(resetAppState);
                }
            } else {
                // Set a timeout for the single-click action.
                clickTimeout = setTimeout(() => {
                    console.log(`%c handleMouseUp: %c Single Left Click: Centering on ${mouseX}x${mouseY} which is fractal coords ${expandComplexToString([fx, fy])}`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

                    // Centering action:
                    fractalApp.animatePanTo([fx, fy], 500).then(() => {
                        resetAppState();
                        if (isJuliaMode()) {
                            updateURLParams(FRACTAL_TYPE.JULIA, fx, fy, fractalApp.zoom, fractalApp.rotation, fractalApp.c[0], fractalApp.c[1]);
                        } else {
                            updateURLParams(FRACTAL_TYPE.MANDELBROT, fx, fy, fractalApp.zoom, fractalApp.rotation);
                        }
                    });

                    // Copy URL to clipboard:
                    navigator.clipboard.writeText(window.location.href).then(function () {
                        console.log(`%c handleMouseUp: %c Copied URL to clipboard!`, 'color: #fff');
                    }, function (err) {
                        console.error(`%c handleMouseUp: %cNot copied to clipboard! ${err}`, 'color: #fff');
                    });

                    clickTimeout = null; // Clear the timeout.
                }, DOUBLE_CLICK_THRESHOLD);
            }
        } else {
            resetAppState();
            isDragging = false;
        }
    }

    if (event.button === 2) { // Right mouse button released
        if (isRightDragging) {
            isRightDragging = false;

            resetAppState();
            // Reset cursor to default after rotation ends
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

            console.log("Double Right Click: Zooming out");
            const targetZoom = fractalApp.zoom / ZOOM_STEP;
            if (targetZoom < fractalApp.MIN_ZOOM) {
                fractalApp.animatePanAndZoomTo([fx, fy], targetZoom).then(resetAppState);
            }
        } else {
            // Set timeout for single click
            clickTimeout = setTimeout(() => {
                clickTimeout = null;
            }, DOUBLE_CLICK_THRESHOLD);
        }
        isRightDragging = false;
    }
    canvas.style.cursor = 'crosshair';
}

// endregion -----------------------------------------------------------------------------------------------------------