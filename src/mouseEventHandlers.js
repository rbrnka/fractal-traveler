import {updateURLParams, clearURLParams} from './utils.js';
import {updateInfo} from './ui.js';

export function registerMouseEventHandlers(fractalApp) {
    const canvas = fractalApp.canvas;

    const doubleClickThreshold = 300;
    const dragThreshold = 5;

    let mouseDownX = 0, mouseDownY = 0;
    let lastX = 0, lastY = 0;
    let clickTimeout = null;
    let isDragging = false;

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        clearURLParams();

        // 1) Get the mouse position in "canvas coordinates" (0..width, 0..height)
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // 2) Convert that point to fractal coordinates BEFORE zooming
        const [fxOld, fyOld] = fractalApp.screenToFractal(mouseX, mouseY);

        // 3) Update the zoom
        //    For "zoom in" if scrolling up, "zoom out" if scrolling down, or vice versa
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
    }, {passive: false});

    canvas.addEventListener('mousedown', (event) => {
        if (event.button === 0) {
            isDragging = false;
            mouseDownX = event.clientX;
            mouseDownY = event.clientY;
            lastX = event.clientX;
            lastY = event.clientY;
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        if (event.buttons === 1) {
            const dx = event.clientX - mouseDownX;
            const dy = event.clientY - mouseDownY;
            if (!isDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
                isDragging = true;
            }
            if (isDragging) {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                clearURLParams();
                const rect = canvas.getBoundingClientRect();
                const moveX = event.clientX - lastX;
                const moveY = event.clientY - lastY;
                fractalApp.pan[0] -= (moveX / rect.width) * fractalApp.zoom;
                fractalApp.pan[1] += (moveY / rect.height) * fractalApp.zoom;
                lastX = event.clientX;
                lastY = event.clientY;
                fractalApp.draw();
            }
        }
        updateInfo(event);
    });

    canvas.addEventListener('mouseup', (event) => {
        // Process only if it's the left or right button.
        if (event.button !== 0 && event.button !== 2) return;

        // We check if the click was not a drag.
        if (!isDragging) {

            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);

            // If there is already a pending click, then we have a double-click.
            if (clickTimeout !== null) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
                // --- Double-click action ---
                //console.log("Double Click: " + (event.button !== 0) ? "Left" : "Right");

                let targetZoom = fractalApp.zoom;
                if (event.button === 0) {
                    targetZoom *= 0.05;
                } else {
                    targetZoom /= 0.05;
                }

                if (targetZoom > 0.000017 && targetZoom < 50) {
                    // Now animate both pan and zoom simultaneously.
                    fractalApp.animatePanAndZoomTo([fx, fy], targetZoom, 1000);
                }
            } else {
                // Set a timeout for the single-click action.
                clickTimeout = setTimeout(() => {
                    // Single-click action: center the fractal.
                    if (event.button === 2) {
                        console.log("Right Click: ");
                        const verticalLine = document.getElementById('verticalLine');
                        const horizontalLine = document.getElementById('horizontalLine');

                        if (verticalLine.style.display === 'block' && horizontalLine.style.display === 'block') {
                            verticalLine.style.display = 'none';
                            horizontalLine.style.display = 'none';
                        } else {
                            verticalLine.style.display = 'block';
                            horizontalLine.style.display = 'block';
                        }
                    } else {
                        console.log("Centering on", fx, fy);

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
                    }

                    clickTimeout = null; // Clear the timeout.
                }, doubleClickThreshold);
            }
        }
        // Reset isDragging flag after mouseup.
        isDragging = false;
    });

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}
