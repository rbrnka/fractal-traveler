import {isMobile, clearURLParams, hsbToRgb} from './utils.js';

let canvas;
let fractalApp;

let headerMinimizeTimeout = null;
let headerToggled = false;
let resizeTimeout;

let header;
let handle;
let infoText;
let resetButton;
let randomizeColorsButton;

let lastUpdateTime = 0;

function initHeaderEvents() {

    header.addEventListener('pointerenter', () => {
        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
        header.classList.remove('minimized');
    });

    header.addEventListener('pointerleave', () => {
        // Only minimize if it hasn't been toggled manually
        if (!headerToggled) {
            headerMinimizeTimeout = setTimeout(() => {
                header.classList.add('minimized');
                headerMinimizeTimeout = null;
            }, 1000);
        }
    });

    // Toggle header state when header is clicked/tapped and stop auto-close
    handle.addEventListener('pointerdown', (event) => {

        console.log("pointerdown " + headerToggled);

        if (!headerToggled) {
            header.classList.remove('minimized');
        } else {
            header.classList.add('minimized');
        }

        headerToggled = !headerToggled;

        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
    });

    // When user clicks/taps outside of the header
    canvas.addEventListener('pointerdown', () => {
        header.classList.add('minimized');
        headerToggled = false;
    });
}

function initControlButtonEvents() {

    resetButton.addEventListener('click', () => {
        // Clear the URL parameters.
        clearURLParams();
        fractalApp.reset();
    });

    randomizeColorsButton.addEventListener('click', () => {
        // Generate a bright random color palette
        // Generate colors with better separation and higher brightness
        const hue = Math.random(); // Hue determines the "base color" (red, green, blue, etc.)
        const saturation = Math.random() * 0.5 + 0.5; // Ensure higher saturation (more vivid colors)
        const brightness = Math.random() * 0.5 + 0.5; // Ensure higher brightness

        // Convert HSB/HSV to RGB
        const newPalette = hsbToRgb(hue, saturation, brightness);

        fractalApp.colorPalette = newPalette;
        fractalApp.draw();

        updateColorSchema(); // Update app colors
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

    header = document.getElementById('headerContainer');
    handle = document.getElementById('handle'); // Header click icon
    infoText = document.getElementById('infoText');
    resetButton = document.getElementById('reset');
    randomizeColorsButton = document.getElementById('randomize');

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initPresetButtonEvents();
    initInfoText();
}

function updateColorSchema() {
    const root = document.documentElement;
    const palette = fractalApp.colorPalette;
    // Convert the palette into RGB values for the primary color
    const primaryColor = `rgb(${Math.floor(palette[0] * 255)}, ${Math.floor(palette[1] * 255)}, ${Math.floor(palette[2] * 255)}, 0.1)`;

    // Adjust border colors based on the primary color
    const borderColor = `rgba(${Math.floor(palette[0] * 200)}, ${Math.floor(palette[1] * 200)}, ${Math.floor(palette[2] * 200)}, 0.4)`; // Slightly dimmed for borders

    // Update header border and background color
    const header = document.getElementById('headerContainer');
    if (header) {
        header.style.borderColor = borderColor;
    }

    // Update infoText border and background color
    const infoLabel = document.getElementById('infoLabel');
    if (infoLabel) {
        infoLabel.style.borderColor = borderColor;
    }

    // Optional: Update other UI elements using CSS variables or inline styles
    //root.style.setProperty('--app-primary-color', primaryColor);
    //root.style.setProperty('--app-border-color', borderColor);
}

export function updateInfo(inputEvent, traveling = false) {
    const now = performance.now();
    if (now - lastUpdateTime < 50) {
        return; // Skip updates if called too soon
    }
    lastUpdateTime = now;

    if (!canvas || !fractalApp || !fractalApp.pan || !fractalApp.zoom) {
        return;
    }

    let text = '';

    if (traveling) {
        text = 'Traveling to: ';
    } else if (inputEvent && typeof inputEvent.clientX === 'number') {
        const rect = canvas.getBoundingClientRect();
        const mouseX = inputEvent.clientX - rect.left;
        const mouseY = inputEvent.clientY - rect.top;

        // Apply rotation to screen coordinates before converting to fractal coordinates
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const offsetX = mouseX - centerX;
        const offsetY = mouseY - centerY;

        const cosR = Math.cos(-fractalApp.rotation); // Negative for counterclockwise rotation
        const sinR = Math.sin(-fractalApp.rotation);

        const rotatedX = cosR * offsetX - sinR * offsetY + centerX;
        const rotatedY = sinR * offsetX + cosR * offsetY + centerY;

        const [fx, fy] = fractalApp.screenToFractal(rotatedX, rotatedY);

        text = isMobile() ? '' : `x=${fx.toFixed(6)}, y=${fy.toFixed(6)} | `;
    }

    const panX = fractalApp.pan[0] ?? 0;
    const panY = fractalApp.pan[1] ?? 0;
    const currentZoom = fractalApp.zoom ?? 0;
    //const currentRotation = (fractalApp.rotation ?? 0).toFixed(2);

    text += `cx=${panX.toFixed(6)}, cy=${panY.toFixed(6)}, zoom=${currentZoom.toFixed(6)}`;
    infoText.textContent = text;
}
