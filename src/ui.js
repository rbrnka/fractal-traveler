import {clearURLParams, hsbToRgb, isTouchDevice} from './utils.js';
import {initMouseHandlers, registerMouseEventHandlers, unregisterMouseEventHandlers} from "./mouseEventHandlers";
import {initTouchHandlers, registerTouchEventHandlers, unregisterTouchEventHandlers} from "./touchEventHandlers";
import {JuliaRenderer} from "./juliaRenderer";

export const DEBUG_MODE = false;

let canvas;
let fractalApp;
// 0..Mandelbrot, 1..Julia
export const MODE_MANDELBROT = 0;
export const MODE_JULIA = 1;
let fractalMode = MODE_MANDELBROT;
let mandelbrotRadio;
let juliaRadio;

let headerMinimizeTimeout = null;
let uiInitialized = false;
let headerToggled = false;
let demoActive = false;
let resizeTimeout;

let header;
let handle;
let infoLabel;
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
let lastSliderUpdate = 0; // Tracks the last time the sliders were updated
const sliderUpdateThrottleLimit = 10; // Throttle limit in milliseconds

let lastInfoUpdate = 0; // Tracks the last time the sliders were updated
const infoUpdateThrottleLimit = 10; // Throttle limit in milliseconds


let currentMandelbrotDemoPresetIndex = 0; // Keep track of the current preset
let currentJuliaAnimationFrame = null;
let rotationAnimationFrame = null; // For hotkey rotation only
let activeTimers = []; // Store all active demo timers

function switchFractalMode(mode) {
    clearURLParams();

    const path = mode === MODE_JULIA ? '#julia' : '';
    window.location.hash = path; // Update URL hash
    window.location.reload();
}

export function isJuliaMode() {
    return fractalMode === MODE_JULIA;
}

export function enableJuliaMode() {
    fractalMode = MODE_JULIA;
}

function stopDemo() {
    if (!demoActive) return;

    console.log("Stopping demo");

    demoActive = false;
    currentMandelbrotDemoPresetIndex = 0;
    fractalApp.stopCurrentAnimation();
    demoButton.innerText = "Demo";

    if (isTouchDevice()) {
        console.log("Registering touch events");
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
    enableJuliaSliders();

    setTimeout(() => {
        updateInfo();
    }, 150);
}

function startDemo() {
    console.log('Starting demo for mode ' + fractalMode);
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
    startDemo();

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
        fractalApp.animateTravelToPresetWithRandomRotation(currentPreset, 2000, 1000, 5000);

        // Schedule the next animation
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

    disableJuliaSliders();
    startDemo();

    let time = 0;

    function animate() {
        fractalApp.c = [
            Math.sin(time) * 0.5, // Oscillate real part
            Math.cos(time) * 0.5  // Oscillate imaginary part
        ];
        fractalApp.draw();
        time += 0.005;

        currentJuliaAnimationFrame = requestAnimationFrame(animate);
        updateInfo(true);
        updateJuliaSliders();
    }

    fractalApp.animatePanZoomRotate(fractalApp.DEFAULT_PAN.slice(), fractalApp.DEFAULT_ZOOM, fractalApp.DEFAULT_ROTATION, 500, animate);
}

function stopRotationAnimation() {
    if (rotationAnimationFrame !== null) {
        cancelAnimationFrame(rotationAnimationFrame);
        rotationAnimationFrame = null;
    }
}

function resetSliders() {
    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
    realSliderValue.innerText = realSlider.value;
    imagSliderValue.innerText = imagSlider.value;
}

function initDebugMode() {
    console.warn('DEBUG MODE ENABLED');

    infoLabel.style.height = '100px';

    const debugInfo = document.getElementById('debugInfo');
    debugInfo.style.display = 'block';
    const dpr = window.devicePixelRatio;

    const {width, height} = canvas.getBoundingClientRect();
    const displayWidth = Math.round(width * dpr);
    const displayHeight = Math.round(height * dpr);
    (function update() {
        debugInfo.innerText = `WINDOW: ${window.innerWidth}x${window.innerHeight} (dpr: ${window.devicePixelRatio})
        CANVAS: ${canvas.width}x${canvas.height}, aspect: ${(canvas.width/canvas.height).toFixed(2)} 
        BoundingRect: ${width}x${height}, display W/H: ${displayWidth}x${displayHeight}`;
        requestAnimationFrame(update);
    })();

    debugInfo.addEventListener('click', () => {
        console.log(debugInfo.innerText);
    });

    toggleDebugLines();
}

export function toggleDebugLines() {
    const verticalLine = document.getElementById('verticalLine');
    const horizontalLine = document.getElementById('horizontalLine');

    if (verticalLine.style.display === 'block' && horizontalLine.style.display === 'block') {
        verticalLine.style.display = 'none';
        horizontalLine.style.display = 'none';
    } else {
        verticalLine.style.display = 'block';
        horizontalLine.style.display = 'block';
    }
}

function takeScreenshot() {
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
            ? `(Mandelbrot: p=[${fractalApp.pan[0].toFixed(6)}, ${fractalApp.pan[1].toFixed(6)}i], Z=${fractalApp.zoom.toFixed(6)})`
            : `(Julia: c=[${fractalApp.c[0]}, ${fractalApp.c[1]}i], p=[${fractalApp.pan[0].toFixed(6)}, ${fractalApp.pan[1].toFixed(6)}], Z=${fractalApp.zoom.toFixed(6)})`
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
        offscreenCanvas.toDataURL("image/jpeg", 0.95)
    );
    link.click();
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
        switchFractalMode(fractalMode);
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
        if (demoActive) {
            stopDemo();
            return;
        }

        stopRotationAnimation();

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
        takeScreenshot();
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
                stopRotationAnimation();
                clearURLParams();
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
    resetSliders();

    // Update `c` dynamically when sliders are moved
    realSlider.addEventListener('input', () => {
        fractalApp.c[0] = parseFloat(realSlider.value);
        realSliderValue.innerText = fractalApp.c[0].toFixed(2);
        fractalApp.draw();
        updateInfo();
        clearURLParams();
    });

    imagSlider.addEventListener('input', () => {
        fractalApp.c[1] = parseFloat(imagSlider.value);
        imagSliderValue.innerText = fractalApp.c[1].toFixed(2);
        fractalApp.draw();
        updateInfo();
        clearURLParams();
    });

    let sliderContainer = document.getElementById('sliders');
    sliderContainer.style.display = 'flex';
}

function initWindowEvents() {
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            fractalApp.resizeCanvas(); // Adjust canvas dimensions
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

function initHotkeys() {
    document.addEventListener("keydown", (event) => {

        switch (event.code) {
            case 'KeyR':
                if (rotationAnimationFrame !== null) {
                    stopRotationAnimation();
                } else {
                    (function animate() {
                        fractalApp.rotation = (fractalApp.rotation - 0.1 + 2 * Math.PI) % (2 * Math.PI); // Normalize rotation
                        fractalApp.draw();
                        rotationAnimationFrame = requestAnimationFrame(animate);
                        updateInfo(true);
                    })();
                }
                break;

            case 'KeyE':
                if (rotationAnimationFrame !== null) {
                    stopRotationAnimation();
                } else {
                    (function animate() {
                        fractalApp.rotation = (fractalApp.rotation + 0.1 + 2 * Math.PI) % (2 * Math.PI); // Normalize rotation
                        fractalApp.draw();
                        rotationAnimationFrame = requestAnimationFrame(animate);
                        updateInfo(true);
                    })();
                }
                break;

            case 'KeyT':
                console.log("Resizing canvas (forced)");
                fractalApp.resizeCanvas();
                break;

            case 'KeyQ':
                switchFractalMode(fractalMode);
                break;

            case 'KeyA':
                toggleDebugLines();
                break;

            default:
                break;
        }
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

    // Element binding
    realSlider = document.getElementById('realSlider');
    realSliderValue = document.getElementById('realSliderValue');
    imagSlider = document.getElementById('imagSlider');
    imagSliderValue = document.getElementById('imagSliderValue');
    mandelbrotRadio = document.getElementById('mandelbrotRadio');
    juliaRadio = document.getElementById('juliaRadio');
    header = document.getElementById('headerContainer');
    handle = document.getElementById('handle'); // Header click icon
    infoLabel = document.getElementById('infoLabel');
    infoText = document.getElementById('infoText');
    resetButton = document.getElementById('reset');
    randomizeColorsButton = document.getElementById('randomize');
    screenshotButton = document.getElementById('screenshot');
    demoButton = document.getElementById('demo');

    if (fractalRenderer instanceof JuliaRenderer) {
        enableJuliaMode();
        initSliders();
        juliaRadio.checked = true;
    }

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initPresetButtonEvents();
    initInfoText();
    initFractalSwitchRadios();
    initHotkeys();

    // Register control events
    if (isTouchDevice()) {
        initTouchHandlers(fractalApp);
        console.log('Touch event handlers registered.');
    } else {
        initMouseHandlers(fractalApp);
        console.log('Mouse event handlers registered.');
    }

    updateColorSchema();

    if (DEBUG_MODE) {
        initDebugMode();
    }

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
 *
 */
export function disableJuliaSliders() {
    imagSlider.disabled = true;
    realSlider.disabled = true;
}

/**
 *
 */
export function enableJuliaSliders() {
    imagSlider.disabled = false;
    realSlider.disabled = false;
}

/**
 * Updates the bottom info bar
 * @param traveling {boolean} if inside animation
 */
export function updateInfo(traveling = false) {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastInfoUpdate;

    if (timeSinceLastUpdate < infoUpdateThrottleLimit) {
        return; // Skip update if called too soon
    }

    // Update the last update time
    lastInfoUpdate = now;

    if (!canvas || !fractalApp) {
        return;
    }

    let text = (demoActive ? ` [DEMO] ` : ``);

    const panX = fractalApp.pan[0] ?? 0;
    const panY = fractalApp.pan[1] ?? 0;

    if (fractalMode === MODE_MANDELBROT || (fractalMode === MODE_JULIA && !demoActive)) {
        text += `px=${panX.toFixed(6)}, py=${panY.toFixed(6)}, `;
    }

    if (fractalMode === MODE_JULIA) {
        const cx = fractalApp.c[0] ?? 0;
        const cy = fractalApp.c[1] ?? 0;

        text += `cx=${cx.toFixed(2)}, cy=${cy.toFixed(2)}, `;
    }

    const currentZoom = fractalApp.zoom ?? 0;
    const currentRotation = (fractalApp.rotation * 180 / Math.PI) % 360;
    const normalizedRotation = currentRotation < 0 ? currentRotation + 360 : currentRotation;
    text += `r=${normalizedRotation.toFixed(0)}°, zoom=${currentZoom.toFixed(6)}`;

    if (demoActive) {
        infoText.classList.add('demoActive');
    } else {
        infoText.classList.remove('demoActive');
    }

    infoText.textContent = text;
}

/**
 * Updates the real/imaginary sliders appropriately
 */
export function updateJuliaSliders() {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastSliderUpdate;

    if (timeSinceLastUpdate < sliderUpdateThrottleLimit) {
        return; // Skip update if called too soon
    }

    // Update the last update time
    lastSliderUpdate = now;
    realSliderValue.innerText = fractalApp.c[0].toFixed(2);
    imagSliderValue.innerText = fractalApp.c[1].toFixed(2);
    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
}