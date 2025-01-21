import {clearURLParams, hsbToRgb, isTouchDevice, getRotatedFractalCoords} from './utils.js';
import {initMouseHandlers, registerMouseEventHandlers, unregisterMouseEventHandlers} from "./mouseEventHandlers";
import {initTouchHandlers, registerTouchEventHandlers, unregisterTouchEventHandlers} from "./touchEventHandlers";
import {JuliaRenderer} from "./juliaRenderer";

let canvas;
let fractalApp;
// 0..Mandelbrot, 1..Julia
export const MODE_MANDELBROT = 0;
export const MODE_JULIA = 1;
export let fractalMode = MODE_MANDELBROT;
let mandelbrotRadio;
let juliaRadio;

let headerMinimizeTimeout = null;
let uiInitialized = false;
let headerToggled = false;
let demoActive = false;
let resizeTimeout;

let header;
let handle;
let infoText;
let resetButton;
let randomizeColorsButton;
let screenshotButton;
let demoButton;
let presetButtons = [];

// Julia sliders
let realSlider;
let imagSlider;
let realSliderValue;
let imagSliderValue;

let isUpdatingSliders = false; // To prevent multiple animation frame requests
let isUpdatingInfo = false; // Prevent overlapping animation frame calls

let currentMandelbrotDemoPresetIndex = 0; // Keep track of the current preset
let currentJuliaAnimationFrame = null;
export let activeTimers = []; // Store all active demo timers

function switchFractalMode(mode) {
    clearURLParams();

    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);

    window.history.replaceState(null, '', url.toString());
    window.location.reload();
}

export function enableJuliaMode() {
    fractalMode = MODE_JULIA;
}

function stopDemo() {
    if (!demoActive) return;

    demoActive = false;
    currentMandelbrotDemoPresetIndex = 0;
    fractalApp.stopCurrentAnimation();
    demoButton.innerText = "Demo";

    if (isTouchDevice()) {
        console.log("Registering touch events after demo");
        registerTouchEventHandlers();
    } else {
        registerMouseEventHandlers();
    }

    if (currentJuliaAnimationFrame !== null) {
        cancelAnimationFrame(currentJuliaAnimationFrame);
        currentJuliaAnimationFrame = null;
    }
    // Clear all active timers
    activeTimers.forEach(timer => clearTimeout(timer));
    activeTimers = []; // Reset the timer list
    // enableControls();
}


function enterDemoMode() {
    demoActive = true;
    demoButton.innerText = "Stop Demo";
    // Register control events
    if (isTouchDevice()) {
        console.log("Unregistering touch events");
        unregisterTouchEventHandlers();
    } else {
        unregisterMouseEventHandlers();
    }

    //disableControls(true, false, false, false);
    clearURLParams();
}

function startMandelbrotDemo() {
    if (demoActive) return;
    enterDemoMode();

    // Start the demo
    const presets = fractalApp.PRESETS.slice();

    function runPresets() {
        if (!demoActive) {
            // If demo is inactive, reset and stop
            fractalApp.reset();
            return;
        }

        const currentPreset = presets[currentMandelbrotDemoPresetIndex];
        console.log("Animating to preset:", currentPreset);

        // Animate to the current preset
        //fractalApp.animateTravelToPreset(currentPreset, 2000, 1000, 5000);
        fractalApp.animateTravelToPresetWithRandomRotation(currentPreset, 2000, 1000, 5000);

        // Schedule the next animation
        // Schedule the next preset animation
        const timer = setTimeout(() => {
            activeTimers = activeTimers.filter(t => t !== timer); // Remove timer from active list
            currentMandelbrotDemoPresetIndex = (currentMandelbrotDemoPresetIndex + 1) % presets.length; // Loop back to the first preset
            runPresets(currentMandelbrotDemoPresetIndex);
        }, 9000); // Adjust timing to match animation duration + pause

        activeTimers.push(timer); // Track this timer
    }

    runPresets();
}

function startJuliaDemo() {
    if (demoActive) return;
    enterDemoMode();

    let time = 0;

    function animate() {
        fractalApp.c = [
            Math.sin(time) * 0.5, // Oscillate real part
            Math.cos(time) * 0.5  // Oscillate imaginary part
        ];
        fractalApp.draw();
        time += 0.005;

        updateJuliaSliders();
        updateInfo(false, false, true);
        currentJuliaAnimationFrame = requestAnimationFrame(animate);
    }

    animate();
}

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
        console.log("Reset button hit");
        // Clear the URL parameters.
        clearURLParams();
        stopDemo();

        const verticalLine = document.getElementById('verticalLine');
        const horizontalLine = document.getElementById('horizontalLine');

        if (verticalLine.style.display === 'block' && horizontalLine.style.display === 'block') {
            verticalLine.style.display = 'none';
            horizontalLine.style.display = 'none';
        }

        fractalApp.colorPalette = fractalApp.DEFAULT_PALETTE;
        updateColorSchema(); // Update app colors
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

    demoButton.addEventListener('click', () => {
        console.log('Starting demo for mode ' + fractalMode);

        if (demoActive) {
            stopDemo();
            return;
        }

        if (fractalMode === MODE_MANDELBROT) {
            const presets = fractalApp.PRESETS;
            if (!presets || presets.length === 0) {
                console.warn('No presets defined for Mandelbrot mode ');
                return;
            }
            startMandelbrotDemo();
        } else if (fractalMode === MODE_JULIA) {
            startJuliaDemo();
        } else {
            console.warn('No demo defined for mode ' + fractalMode);
        }
    });

    screenshotButton.addEventListener('click', () => {
        // Ensure the fractal is fully rendered before taking a screenshot
        fractalApp.draw();

        // Create an offscreen canvas for watermarking
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        const ctx = offscreenCanvas.getContext('2d');

        if (!ctx) {
            console.error('Unable to get 2D context for the canvas.');
            return;
        }

        // Copy the fractal canvas content to the offscreen canvas
        ctx.drawImage(canvas, 0, 0);

        // Define the watermark text and style
        let watermarkText = `Created by Synaptory Fractal Traveler, `;
        watermarkText += (
            fractalMode === MODE_MANDELBROT
                ? `(Mandelbrot: z=[${fractalApp.pan[0].toFixed(6)}, ${fractalApp.pan[1].toFixed(6)}i], Z=${fractalApp.zoom.toFixed(6)})`
                : `(Julia: c=[${fractalApp.c[0]}, =${fractalApp.c[1]}i], x=${fractalApp.pan[0].toFixed(6)}, y=${fractalApp.pan[1].toFixed(6)}, Z=${fractalApp.zoom.toFixed(6)})`
        );
        const fontSize = 12;
        const padding = 6;
        const borderWidth = 1;

        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Measure the text width and calculate the rectangle size
        const textWidth = ctx.measureText(watermarkText).width;
        const rectWidth = textWidth + padding * 2 + borderWidth * 2;
        const rectHeight = fontSize + padding * 2 + borderWidth * 2;

        // Position the rectangle in the bottom-right corner
        const x = offscreenCanvas.width - rectWidth - padding;
        const y = offscreenCanvas.height - rectHeight - padding;

        // Draw the semi-transparent black background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, rectWidth, rectHeight);

        // Draw the border
        const palette = fractalApp.colorPalette;
        ctx.strokeStyle = `rgba(${Math.floor(palette[0] * 200)}, ${Math.floor(palette[1] * 200)}, ${Math.floor(palette[2] * 200)}, 0.3)`;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(x, y, rectWidth, rectHeight);

        // Draw the text centered within the rectangle
        const brightnessFactor = 1.9;
        const adjustChannel = (value) => Math.min(255, Math.floor(value * 255 * brightnessFactor));
        const textX = x + rectWidth / 2;
        const textY = y + rectHeight / 2;
        ctx.fillStyle = `rgb(${adjustChannel(palette[0])}, ${adjustChannel(palette[1])}, ${adjustChannel(palette[2])}, 0.8)`;
        ctx.fillText(watermarkText, textX, textY);

        // Create a temporary link for downloading the image
        const link = document.createElement('a');

        // Generate a filename based on the current timestamp
        const generateFilename = () => {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            return `fractal-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.png`;
        };

        // Set the download attributes
        link.setAttribute('download', generateFilename());
        link.setAttribute(
            'href',
            offscreenCanvas.toDataURL("image/png", 1.0).replace("image/png", "image/octet-stream")
        );
        link.click();
    });

}

function initPresetButtonEvents() {
    let presets = fractalApp.PRESETS.slice();
    presetButtons.length = 0;

    presets.forEach((preset, index) => {
        const btn = document.getElementById('preset' + (index + 1));
        presetButtons.push(btn);
        if (btn != null) {
            btn.addEventListener('click', () => {
                stopDemo();
                fractalApp.animateTravelToPreset(preset, 500, 500, 3500);
            });
        }
    });
}

function initFractalSwitchRadios() {
    mandelbrotRadio.addEventListener('click', (event) => {
        switchFractalMode(MODE_MANDELBROT);
    });

    juliaRadio.addEventListener('click', (event) => {
        switchFractalMode(MODE_JULIA);
    });
}

function initSliders() {
    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
    realSliderValue.innerText = realSlider.value;
    imagSliderValue.innerText = imagSlider.value;

    // TODO make more granular, currently sliders change the set too roughly
    // Update `c` dynamically when sliders are moved
    realSlider.addEventListener('input', () => {
        fractalApp.c[0] = parseFloat(realSlider.value);
        realSliderValue.innerText = fractalApp.c[0].toFixed(2);
        updateInfo(false, false, false);
        fractalApp.draw();
    });

    imagSlider.addEventListener('input', () => {
        fractalApp.c[1] = parseFloat(imagSlider.value);
        imagSliderValue.innerText = fractalApp.c[1].toFixed(2);
        updateInfo(false, false, false);
        fractalApp.draw();
    });

    let sliderContainer = document.getElementById('sliders');
    sliderContainer.style.display = 'flex';
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

/**
 * Initializes the UI and registers UI event handlers
 * @param fractalRenderer
 */
export function initUI(fractalRenderer) {
    if (uiInitialized) {
        console.warn("UI already initialized!");
        return;
    }

    fractalApp = fractalRenderer;
    canvas = fractalApp.canvas;

    header = document.getElementById('headerContainer');
    handle = document.getElementById('handle'); // Header click icon
    infoText = document.getElementById('infoText');
    resetButton = document.getElementById('reset');
    randomizeColorsButton = document.getElementById('randomize');
    screenshotButton = document.getElementById('screenshot');
    demoButton = document.getElementById('demo');

    mandelbrotRadio = document.getElementById('mandelbrotRadio');
    juliaRadio = document.getElementById('juliaRadio');

    realSlider = document.getElementById('realSlider');
    realSliderValue = document.getElementById('realSliderValue');
    imagSlider = document.getElementById('imagSlider');
    imagSliderValue = document.getElementById('imagSliderValue');

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initPresetButtonEvents();
    initInfoText();
    initFractalSwitchRadios();

    if (fractalRenderer instanceof JuliaRenderer) {
        initSliders();
        juliaRadio.checked = true;
    }

    // Register control events
    if (isTouchDevice()) {
        initTouchHandlers(fractalApp);
        console.log('Touch event handlers registered.');
    } else {
        initMouseHandlers(fractalApp);
        console.log('Mouse event handlers registered.');
    }

    updateColorSchema();

    uiInitialized = true;
}

function updateColorSchema() {
    const palette = fractalApp.colorPalette;
    // Convert the palette into RGB values for the primary color
    const brightnessFactor = 1.9; // Increase brightness by 90%
    const adjustChannel = (value) => Math.min(255, Math.floor(value * 255 * brightnessFactor));
    const primaryColor = `rgb(${adjustChannel(palette[0])}, ${adjustChannel(palette[1])}, ${adjustChannel(palette[2])})`;

    // Adjust border colors based on the primary color
    const borderColor = `rgba(${Math.floor(palette[0] * 200)}, ${Math.floor(palette[1] * 200)}, ${Math.floor(palette[2] * 200)}, 0.3)`; // Slightly dimmed for borders

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

    realSlider.style.setProperty('--thumb-color', borderColor);
    realSlider.style.setProperty('--slider-color', primaryColor);
    imagSlider.style.setProperty('--thumb-color', borderColor);
    imagSlider.style.setProperty('--slider-color', primaryColor);

    // Update infoText border and background color
    const colorableElements = document.getElementsByClassName('colorable');
    if (colorableElements) {
        for (let i = 0; i < colorableElements.length; i++) {
            colorableElements[i].style.color = primaryColor;
        }
    }

    // Optional: Update other UI elements using CSS variables or inline styles
    //const root = document.documentElement;
    //root.style.setProperty('--app-primary-color', primaryColor);
    //root.style.setProperty('--app-border-color', borderColor);
}

/**
 * Disables button sets
 * @param presets
 * @param reset
 * @param randomize
 * @param demo
 */
export function disableControls(presets = true, reset = true, randomize = true, demo = true) {
    if (presets) {
        presetButtons.forEach(button => {
            button.disabled = true;
        });
    }

    if (reset) {
        const button = document.getElementById("reset");
        button.disabled = true;
    }

    if (randomize) {
        const button = document.getElementById("randomize");
        button.disabled = true;
    }

    if (demo) {
        const button = document.getElementById("demo");
        button.disabled = true;
    }
}

/**
 * Enables button sets
 * @param presets
 * @param reset
 * @param randomize
 * @param demo
 */
export function enableControls(presets = true, reset = true, randomize = true, demo = true) {
    if (presets) {
        presetButtons.forEach(button => {
            button.disabled = false;
        });
    }

    if (reset) {
        const button = document.getElementById("reset");
        button.disabled = false;
    }

    if (randomize) {
        const button = document.getElementById("randomize");
        button.disabled = false;
    }

    if (demo) {
        const button = document.getElementById("demo");
        button.disabled = false;
    }
}

/**
 * Updates the bottom info bar
 * @param inputEvent mouse event (optional)
 * @param traveling {boolean} if inside animation
 * @param demo {boolean} if demo mode
 */
export function updateInfo(inputEvent, traveling = false, demo = false) {
    if (isUpdatingInfo) return;

    isUpdatingInfo = true;

    requestAnimationFrame(() => {
        if (!canvas || !fractalApp) {
            isUpdatingInfo = false;
            return;
        }

        // Determine base text
        let text = traveling
            ? `${demo ? 'DEMO: ' : ''}Traveling to: `
            : demo
                ? 'DEMO: '
                : '';

        // Add mouse coordinates if inputEvent exists
        if (inputEvent && inputEvent.clientX !== undefined) {
            const rect = canvas.getBoundingClientRect();
            const [fx, fy] = getRotatedFractalCoords(
                fractalApp,
                inputEvent.clientX - rect.left,
                inputEvent.clientY - rect.top,
                rect
            );

            if (!isTouchDevice()) {
                text += `x=${fx.toFixed(6)}, y=${fy.toFixed(6)} | `;
            }
        }

        // Append fractal-specific information
        const zoom = fractalApp.zoom?.toFixed(6) || '0';
        if (fractalMode === MODE_MANDELBROT) {
            const [panX, panY] = fractalApp.pan || [0, 0];
            text += `cx=${panX.toFixed(6)}, cy=${panY.toFixed(6)}, zoom=${zoom}`;
        } else if (fractalMode === MODE_JULIA) {
            const [cx, cy] = fractalApp.c || [0, 0];
            text += `cx=${cx.toFixed(6)}, cy=${cy.toFixed(6)}, zoom=${zoom}`;
        } else {
            console.warn('Unknown fractal mode');
        }

        // Update the info text content
        infoText.value = text;

        isUpdatingInfo = false; // Allow next update
    });
}

/**
 * Updates the real/imaginary sliders appropriately
 */
export function updateJuliaSliders() {
    if (isUpdatingSliders) {
        return; // Prevent overlapping animation frame calls
    }

    isUpdatingSliders = true;

    requestAnimationFrame(() => {
        const cx = fractalApp.c[0].toFixed(2);
        const cy = fractalApp.c[1].toFixed(2);

        realSliderValue.innerText = cx;
        imagSliderValue.innerText = cy;
        realSlider.value = parseFloat(cx);
        imagSlider.value = parseFloat(cy);

        isUpdatingSliders = false; // Allow the next update
        console.log("Sliders updated via animation frame");
    });
}