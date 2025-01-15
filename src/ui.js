import {isMobile, clearURLParams, loadFractalParamsFromURL} from './utils.js';

let canvas;
let fractalApp;

let headerMinimizeTimeout = null;
let resizeTimeout;
let initTimeout;

const header = document.getElementById('headerContainer');
const infoText = document.getElementById('infoText');
const resetButton = document.getElementById('reset');
const randomizeColorsButton = document.getElementById('randomize');


function initHeaderEvents() {
    // Use pointer events to handle hover/focus on the header.
    header.addEventListener('pointerenter', () => {
        if (fractalApp.headerMinimizeTimeout) {
            clearTimeout(fractalApp.headerMinimizeTimeout);
            fractalApp.headerMinimizeTimeout = null;
        }
        header.classList.remove('minimized');
    });

    header.addEventListener('pointerleave', () => {
        // Use a delay to avoid accidental minimization.
        fractalApp.headerMinimizeTimeout = setTimeout(() => {
            header.classList.add('minimized');
            fractalApp.headerMinimizeTimeout = null;
        }, 1000);
    });

    // Toggle header state when header is clicked/tapped if target is not a button.
    header.addEventListener('pointerdown', (event) => {
        let el = event.target;
        while (el && el !== header) {
            if (el.tagName && el.tagName.toLowerCase() === 'button') {
                return;
            }
            el = el.parentNode;
        }
        event.stopPropagation();
        header.classList.toggle('minimized');
    });

    header.addEventListener('mouseenter', () => {
        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
        header.classList.remove('minimized');
    });

// When the pointer leaves the header, set a long delay (e.g., 2000ms) before minimizing.
    header.addEventListener('mouseleave', () => {
        headerMinimizeTimeout = setTimeout(() => {
            header.classList.add('minimized');
            headerMinimizeTimeout = null;
        }, 1000);
    });

    // When user clicks/taps the fractal, minimize the header
    canvas.addEventListener('click', () => {
        header.classList.add('minimized');
    });
    canvas.addEventListener('touchstart', () => {
        header.classList.add('minimized');
    });
}

function initControlButtonEvents() {
    resetButton.addEventListener('click', () => {
        // Clear the URL parameters.
        clearURLParams();
        fractalApp.reset();
    });

    randomizeColorsButton.addEventListener('click', () => {
        fractalApp.colorPalette = [Math.random(), Math.random(), Math.random()];
        fractalApp.draw();
    });
}

function initPresetButtonEvents() {
    let presets = fractalApp.PRESETS.slice();

    presets.forEach((preset, index) => {
        const btn = document.getElementById('preset' + (index + 1));
        if (btn != null) {
            btn.addEventListener('click', () => {
                fractalApp.animateTravelToPreset(preset, 500, 500, 3500);
            });
        }
    });
}

function initWindowEvents() {
    // Initial render
    window.addEventListener('load', () => {
        // Get the URL params.
        const params = new URLSearchParams(window.location.search);

        // If the URL contains the required parameters, load them.
        if (params.has('cx') && params.has('cy') && params.has('zoom')) {
            fractalApp.reset();
            clearTimeout(initTimeout);
            initTimeout = setTimeout(() => {
                loadFractalParamsFromURL(fractalApp);
                fractalApp.animatePanAndZoomTo(fractalApp.pan, fractalApp.zoom, 500);
            }, 1000); // Adjust delay as needed

        } else {
            // Otherwise, clear any invalid URL parameters and reset to default.
            clearURLParams();
            fractalApp.reset();
        }
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            fractalApp.resizeCanvas(); // Adjust canvas dimensions
            fractalApp.draw();  // Redraw after resize
        }, 200); // Adjust delay as needed
    });
}

function initInfoText() {

    infoText.addEventListener('click', () => {
        let textarea = document.getElementById("infoText");
        navigator.clipboard.writeText(textarea.value).then(function () {
            textarea.innerText = 'Copied to clipboard!';
        }, function (err) {
            console.error('Not copied to clipboard! ' + err.toString());
        });
    });

}

export function initUI(fractalRenderer) {
    fractalApp = fractalRenderer;
    canvas = fractalApp.canvas;

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initPresetButtonEvents();
    initInfoText();
}


export function updateInfo(event, traveling = false) {
    // Ensure that the canvas and fractalApp state are defined.
    if (!canvas || !fractalApp || !fractalApp.pan || !fractalApp.zoom) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    let text = traveling ? 'Traveling: ' : '';

    // Only try to compute mouse coordinates if event exists and has clientX
    if (event && typeof event.clientX === 'number' && !traveling) {
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const [fx, fy] = fractalApp.screenToFractal(mouseX, mouseY);
        // Assuming isMobile() has been imported from utils.js
        text = isMobile() ? '' : `x=${fx.toFixed(6)}, y=${fy.toFixed(6)} | `;
    }

    // Use safe default values when calling toFixed.
    const panX = (fractalApp.pan[0] !== undefined) ? fractalApp.pan[0] : 0;
    const panY = (fractalApp.pan[1] !== undefined) ? fractalApp.pan[1] : 0;
    const currentZoom = (fractalApp.zoom !== undefined) ? fractalApp.zoom : 0;

    text += `cx=${panX.toFixed(6)}, cy=${panY.toFixed(6)}, zoom=${currentZoom.toFixed(6)}`;

    infoText.textContent = text;
}
