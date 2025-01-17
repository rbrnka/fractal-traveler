/**
 * @module MouseEventhandlers
 * @author Radim Brnka
 */
import {updateURLParams, clearURLParams} from './utils.js';
import {updateInfo} from './ui.js';

const doubleClickThreshold = 300;
const dragThreshold = 5;

let mouseHandlersRegistered = false; // Global variable to track registration

let canvas;
let fractalApp;

let mouseDownX = 0, mouseDownY = 0;
let lastX = 0, lastY = 0;
let clickTimeout = null;
let isDragging = false;

// Rotation
let isRightDragging = false;
let startX = 0;

export function registerMouseEventHandlers(app) {
    if (mouseHandlersRegistered) {
        console.warn('Mouse event handlers already registered.');
        return; // Prevent duplicate registration
    }
    mouseHandlersRegistered = true;

    fractalApp = app;
    canvas = fractalApp.canvas;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (event) => handleWheel(event, fractalApp), {passive: false});
    canvas.addEventListener('mousedown', (event) => handleMouseDown(event, fractalApp));
    canvas.addEventListener('mousemove', (event) => handleMouseMove(event, fractalApp));
    canvas.addEventListener('mouseup', (event) => handleMouseUp(event, fractalApp));
}

function handleWheel(event, fractalApp) {
    event.preventDefault();
    clearURLParams();

    // 1) Get the mouse position in "canvas coordinates" (0..width, 0..height)
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 2) Convert that point to fractal coordinates BEFORE zooming
    const [fxOld, fyOld] = fractalApp.screenToFractal(mouseX, mouseY);

    // 3) Update the zoom
    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;

    if (fractalApp.zoom * zoomFactor > 0.000017 && fractalApp.zoom * zoomFactor < 50) {
        fractalApp.zoom *= zoomFactor;

        // 4) Convert that same screen point to fractal coords AFTER zooming
        const [fxNew, fyNew] = fractalApp.screenToFractal(mouseX, mouseY);

        // 5) Adjust pan so that fxOld/fyOld remains the same fractal point under the mouse
        fractalApp.pan[0] += (fxOld - fxNew);
        fractalApp.pan[1] += (fyOld - fyNew);

        updateInfo(event);
        fractalApp.draw();
    }
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

        if (!isDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
            isDragging = true;
        }

        if (isDragging) {

            canvas.style.cursor = 'move';
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
            }

            clearURLParams();

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
        }
    }

    if (isRightDragging) {
        event.preventDefault(); // Prevent default actions during dragging
        const deltaX = event.clientX - startX;
        const rotationSpeed = 0.01; // Adjust rotation speed as needed
        fractalApp.rotation += deltaX * rotationSpeed;
        startX = event.clientX; // Update starting point for smooth rotation
        canvas.style.cursor = 'grabbing'; // Use a grabbing cursor for rotation
        fractalApp.draw(); // Redraw with the updated rotation
    }

    updateInfo(event);
}

function handleMouseUp(event) {
    // Process only for left (0), middle (1), or right (2) mouse buttons.
    if (![0, 1, 2].includes(event.button)) return;

    event.preventDefault(); // Stop browser-specific behaviors
    event.stopPropagation(); // Prevent bubbling to parent elements


    if (event.button === 2) { // Right mouse button released
        isRightDragging = false;

        // Reset cursor to default after rotation ends
    }

    if (event.button === 1) { // Middle-click toggles the lines
        console.log("Middle Click: Toggling lines");

        const verticalLine = document.getElementById('verticalLine');
        const horizontalLine = document.getElementById('horizontalLine');

        if (verticalLine.style.display === 'block' && horizontalLine.style.display === 'block') {
            verticalLine.style.display = 'none';
            horizontalLine.style.display = 'none';
        } else {
            verticalLine.style.display = 'block';
            horizontalLine.style.display = 'block';
        }
        return; // Exit early since middle-click doesn't involve dragging or centering.
    }

    // We check if the click was not a drag.
    if (!isDragging && event.button === 0) { // Left-click
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

        // If there is already a pending click, then we have a double-click.
        if (clickTimeout !== null) {
            clearTimeout(clickTimeout);
            clickTimeout = null;

            // --- Double-click action ---
            console.log("Double Click: Centering on", fx, fy);

            const targetZoom = fractalApp.zoom * 0.05;
            if (targetZoom > 0.000017) {
                fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000);
            }
        } else {
            // Set a timeout for the single-click action.
            clickTimeout = setTimeout(() => {
                console.log("Single Click: Centering on", fx, fy);

                // Centering action:
                updateURLParams(fx, fy, fractalApp.zoom);
                fractalApp.animatePanAndZoomTo([fx, fy], fractalApp.zoom, 500);

                // Copy URL to clipboard:
                navigator.clipboard.writeText(window.location.href).then(function () {
                    console.log('Copied URL to clipboard!');
                }, function (err) {
                    console.error('Not copied to clipboard!', err);
                });

                updateInfo(event);
                clickTimeout = null; // Clear the timeout.
            }, doubleClickThreshold);
        }
        isDragging = false;
    }

    if (event.button === 2) { // Right mouse button released
        if (isRightDragging) {
            isRightDragging = false;

            // Reset cursor to default after rotation ends
            canvas.style.cursor = 'default';
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
            const targetZoom = fractalApp.zoom / 0.05;
            if (targetZoom < 50) {
                fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000);
            }
        } else {
            // Set timeout for single click
            clickTimeout = setTimeout(() => {
                clickTimeout = null;
            }, doubleClickThreshold);
        }
        isRightDragging = false;
    }
    canvas.style.cursor = 'crosshair';
}

