import {clearURLParams, hsbToRgb, isTouchDevice} from './utils.js';
import {initMouseHandlers, registerMouseEventHandlers, unregisterMouseEventHandlers} from "./mouseEventHandlers";
import {initTouchHandlers, registerTouchEventHandlers, unregisterTouchEventHandlers} from "./touchEventHandlers";
import {JuliaRenderer} from "./juliaRenderer";

/**
 * @module UI
 * @author Radim Brnka
 * @description Contains code to manage the UI (header interactions, buttons, infoText update, etc.).
 */

/**
 * Debug mode. False for prod
 * @type {boolean}
 */
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
let juliaDemoTime = 0;
let activeJuliaDiveIndex = -1;
let activePresetIndex = -1;
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
let diveButtons = [];
let allButtons = [];

// Julia sliders
let realSlider;
let imagSlider;
let realSliderValue;
let imagSliderValue;
let lastSliderUpdate = 0; // Tracks the last time the sliders were updated
const sliderUpdateThrottleLimit = 10; // Throttle limit in milliseconds
const JULIA_HOTKEY_C_STEP = 0.0005; // Smooth stepping: step size
const JULIA_HOTKEY_C_SMOOTH_STEP = 0.1; // Super smooth stepping multiplier (SHIFT)
const JULIA_HOTKEY_C_SPEED = 50; // Smooth stepping: animation delay

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
    juliaRadio.checked = true;
}

function onTravelToPresetFinished() {
    console.log("Travel to preset complete");
    stopDemoMode(true);
}

function stopDemoMode(presetOnly = false) {
    if (!demoActive) return;
    activeJuliaDiveIndex = -1;

    console.log("Stopping demo");

    demoActive = false;
    currentMandelbrotDemoPresetIndex = 0;
    fractalApp.stopCurrentNonColorAnimation();
    demoButton.innerText = "Demo";
    demoButton.classList.remove('active');
    if (!presetOnly)
        resetPresetAndDiveButtons();

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

function initDemoMode() {
    console.log('Starting demo mode for ' + fractalMode);
    demoActive = true;

    resetPresetAndDiveButtons();
    demoButton.innerText = "Stop";
    demoButton.classList.add('active');
    // Register control events
    if (isTouchDevice()) {
        console.log("Unregistering touch events");
        unregisterTouchEventHandlers();
    } else {
        unregisterMouseEventHandlers();
    }

    disableJuliaSliders();
    clearURLParams();
}

function toggleDemo() {
    if (demoActive) {
        resetPresetAndDiveButtons();
        stopDemoMode();
        return;
    }

    stopRotationAnimation();
    resetPresetAndDiveButtons();

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
}

function startMandelbrotDemo() {
    if (demoActive) return;
    initDemoMode();

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

function startJuliaDive(dive) {
    if (demoActive) return;

    // Validate configuration:
    if (dive.cxDirection < 0 && dive.endC[0] >= dive.startC[0]) {
        console.error("For negative cxDirection, endC[0] must be lower than startC[0].");
        return;
    } else if (dive.cxDirection > 0 && dive.endC[0] <= dive.startC[0]) {
        console.error("For positive cxDirection, endC[0] must be higher than startC[0].");
        return;
    }
    if (dive.cyDirection < 0 && dive.endC[1] >= dive.startC[1]) {
        console.error("For negative cyDirection, endC[1] must be lower than startC[1].");
        return;
    } else if (dive.cyDirection > 0 && dive.endC[1] <= dive.startC[1]) {
        console.error("For positive cyDirection, endC[1] must be higher than startC[1].");
        return;
    }

    if (!dive.phases) {
        console.warn("Phases are not defined, setting to default order.");
        dive.phases = [1, 2, 3, 4];
    }

    initDemoMode();

    if (DEBUG_MODE) dive.step *= 10;

    let phase = dive.phases[0] || 1;
    let phaseIndex = 0; // TODO implement phase ordering

    // Transition to the initial preset first.
    fractalApp.animateTravelToPreset({
        pan: dive.pan,
        c: dive.startC.slice(), // copy initial c
        zoom: dive.zoom,
        rotation: dive.rotation
    }, 500, () => {
        function animate() {
            const step = dive.step;
            // Phase 1: Animate cx (real part) toward endC[0]
            if (phase === 1) {
                fractalApp.c[0] += dive.cxDirection * step;
                if ((dive.cxDirection < 0 && fractalApp.c[0] <= dive.endC[0]) ||
                    (dive.cxDirection > 0 && fractalApp.c[0] >= dive.endC[0])) {
                    fractalApp.c[0] = dive.endC[0];
                    phase = 2;
                }
            }
            // Phase 2: Animate cy (imaginary part) toward endC[1]
            else if (phase === 2) {
                fractalApp.c[1] += dive.cyDirection * step;
                if ((dive.cyDirection < 0 && fractalApp.c[1] <= dive.endC[1]) ||
                    (dive.cyDirection > 0 && fractalApp.c[1] >= dive.endC[1])) {
                    fractalApp.c[1] = dive.endC[1];
                    phase = 3;
                }
            }
            // Phase 3: Animate cx back toward startC[0]
            else if (phase === 3) {
                fractalApp.c[0] -= dive.cxDirection * step;
                if ((dive.cxDirection < 0 && fractalApp.c[0] >= dive.startC[0]) ||
                    (dive.cxDirection > 0 && fractalApp.c[0] <= dive.startC[0])) {
                    fractalApp.c[0] = dive.startC[0];
                    phase = 4;
                }
            }
            // Phase 4: Animate cy back toward startC[1]
            else if (phase === 4) {
                fractalApp.c[1] -= dive.cyDirection * step;
                if ((dive.cyDirection < 0 && fractalApp.c[1] >= dive.startC[1]) ||
                    (dive.cyDirection > 0 && fractalApp.c[1] <= dive.startC[1])) {
                    fractalApp.c[1] = dive.startC[1];
                    phase = 1; // Loop back to start phase.
                }
            }

            fractalApp.draw();
            currentJuliaAnimationFrame = requestAnimationFrame(animate);
            updateInfo(true);
            updateJuliaSliders();
        }

        animate();
    });
}

function startJuliaDemo() {
    if (demoActive) return;

    initDemoMode();

    function animate() {
        fractalApp.c = [
            ((Math.sin(juliaDemoTime) + 1) / 2) * 1.5 - 1,   // Oscillates between -1 and 0.5
            ((Math.cos(juliaDemoTime) + 1) / 2) * 1.4 - 0.7    // Oscillates between -0.7 and 0.7
        ];
        fractalApp.rotation += 0.0001;
        fractalApp.draw();
        juliaDemoTime += 0.0005;

        currentJuliaAnimationFrame = requestAnimationFrame(animate);
        updateInfo(true);
        updateJuliaSliders();
    }

    fractalApp.animatePanZoomRotate(
        fractalApp.DEFAULT_PAN.slice(),
        fractalApp.DEFAULT_ZOOM,
        fractalApp.DEFAULT_ROTATION,
        500,
        juliaDemoTime > 0
            ? animate
            : () => {
                fractalApp.animateToC([-0.25, 0.7], 500, animate);
            }
    );
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
    imagSliderValue.innerText = imagSlider.value + 'i';
    juliaDemoTime = 0;
}

function travelToPreset(preset) {
    initDemoMode();

    if (isJuliaMode()) {
        juliaDemoTime = 0;
        fractalApp.animateTravelToPreset(preset, 750, onTravelToPresetFinished);
    } else {
        fractalApp.animateTravelToPreset(preset, 500, 500, 3500, onTravelToPresetFinished);
    }
    clearURLParams();
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
        CANVAS: ${canvas.width}x${canvas.height}, aspect: ${(canvas.width / canvas.height).toFixed(2)} 
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

export function resetPresetAndDiveButtons() {
    console.log("Resetting active buttons");
    presetButtons.concat(diveButtons).forEach(b => b.classList.remove('active'));
}

/**
 * This needs to happen on any fractal change
 */
export function resetActivePresetIndex() {
    activePresetIndex = -1;
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

function randomizeColors() {
    // Generate a bright random color palette
    // Generate colors with better separation and higher brightness
    const hue = Math.random(); // Hue determines the "base color" (red, green, blue, etc.)
    const saturation = Math.random() * 0.5 + 0.5; // Ensure higher saturation (more vivid colors)
    const brightness = Math.random() * 0.5 + 0.5; // Ensure higher brightness

    // Convert HSB/HSV to RGB
    const newPalette = hsbToRgb(hue, saturation, brightness);

    fractalApp.animateColorPaletteTransition(newPalette, 250, updateColorTheme); // Update app colors
}

function initHeaderEvents() {
    if (DEBUG_MODE) return;
    header.addEventListener('pointerenter', () => {
        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
        handle.style.display = "none";
        header.classList.remove('minimized');
    });

    header.addEventListener('pointerleave', () => {
        // Only minimize if it hasn't been toggled manually
        if (!headerToggled) {
            headerMinimizeTimeout = setTimeout(() => {
                header.classList.add('minimized');
                handle.style.display = "block";
                headerMinimizeTimeout = null;
            }, 1000);
        }
    });

    // Toggle header state when header is clicked/tapped and stop auto-close
    handle.addEventListener('pointerdown', (event) => {

        if (!headerToggled) {
            header.classList.remove('minimized');
            handle.style.display = "none";
        } else {
            header.classList.add('minimized');
            handle.style.display = "block";
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
        handle.style.display = "block";
        headerToggled = false;
    });
}

function initControlButtonEvents() {

    resetButton.addEventListener('click', () => {
        switchFractalMode(fractalMode);
    });

    randomizeColorsButton.addEventListener('click', () => {
        randomizeColors();
    });

    demoButton.addEventListener('click', () => {
        toggleDemo();
    });

    screenshotButton.addEventListener('click', () => {
        takeScreenshot();
    });

}

function initPresetButtonEvents() {
    const presetBlock = document.getElementById('presets');
    presetBlock.innerHTML = 'Presets: ';

    presetButtons = [];

    const presets = fractalApp.PRESETS.slice();
    presets.forEach((preset, index) => {
        const btn = document.createElement('button');
        btn.id = 'preset' + (index);
        btn.className = 'preset';
        btn.textContent = (index).toString();
        btn.addEventListener('click', () => {
            if (index !== activePresetIndex) {
                activePresetIndex = index;
                travelToPreset(presets[index]);
                btn.classList.add('active');
            } else {
                console.log("Already set preset, skipping");
            }

        });

        presetBlock.appendChild(btn);
        presetButtons.push(btn);
        presetButtons[0].classList.add('active');
    });
}

/**
 * Inits behavior common for all buttons
 */
function initCommonButtonEvents() {
    allButtons = diveButtons.concat(presetButtons);
    allButtons.push(resetButton, randomizeColorsButton, screenshotButton, demoButton);

    allButtons.forEach((btn) => {
        btn.addEventListener('mouseleave', () => {
            btn.blur();
        });

        btn.addEventListener('mouseup', () => {
            btn.blur();
        });
    });
}

function initDives() {
    if (isJuliaMode()) {
        const diveBlock = document.getElementById('dives');
        diveBlock.innerHTML = 'Dives: ';

        diveButtons = [];

        const dives = fractalApp.DIVES.slice();
        dives.forEach((dive, index) => {
            const btn = document.createElement('button');
            btn.id = 'dive' + (index);
            btn.className = 'dive';
            btn.textContent = (index).toString();
            btn.addEventListener('click', () => {
                if (index !== activeJuliaDiveIndex) {
                    stopDemoMode();
                }

                startJuliaDive(dive);
                activeJuliaDiveIndex = index;
                btn.classList.add('active');
            });

            diveBlock.appendChild(btn);
            diveButtons.push(btn);
        });

        diveBlock.style.display = 'block';
    }
}

function initFractalSwitchRadios() {
    mandelbrotRadio.addEventListener('click', (event) => {
        if (isJuliaMode())
            switchFractalMode(MODE_MANDELBROT);
    });

    juliaRadio.addEventListener('click', (event) => {
        if (!isJuliaMode())
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
        resetPresetAndDiveButtons();
        juliaDemoTime = 0;
    });

    imagSlider.addEventListener('input', () => {
        fractalApp.c[1] = parseFloat(imagSlider.value);
        imagSliderValue.innerText = fractalApp.c[1].toFixed(2) + 'i';
        fractalApp.draw();
        updateInfo();
        clearURLParams();
        resetPresetAndDiveButtons();
        juliaDemoTime = 0;
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
        let text = `{pan: [${fractalApp.pan}], rotation: ${fractalApp.rotation}, zoom: ${fractalApp.zoom}`;
        text += isJuliaMode()
            ? `, c: [${fractalApp.c}]}`
            : `}`;
        navigator.clipboard.writeText(text).then(function () {
            textarea.innerText = 'Copied to clipboard!';
        }, function (err) {
            console.error('Not copied to clipboard! ' + err.toString());
        });
    });
}

function initHotkeys() {
    document.addEventListener("keydown", (event) => {

        const disallowedHotkeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"];

        if (demoActive && disallowedHotkeys.includes(event.code)) return;

        const rotationSpeed = event.shiftKey ? 0.01 : 0.1;
        const mandelbrotPanSpeed = event.shiftKey ? 0.01 : 0.1;

        /**
         * https://www.freecodecamp.org/news/javascript-keycode-list-keypress-event-key-codes/
         */
        switch (event.code) {
            case 'KeyQ': // Rotation counter-clockwise
                if (rotationAnimationFrame !== null) {
                    stopRotationAnimation();
                } else {
                    (function animate() {
                        fractalApp.rotation = (fractalApp.rotation - rotationSpeed + 2 * Math.PI) % (2 * Math.PI); // Normalize rotation
                        fractalApp.draw();
                        rotationAnimationFrame = requestAnimationFrame(animate);
                        updateInfo(true);
                    })();
                }
                break;

            case 'KeyW':  // Rotation clockwise
                if (rotationAnimationFrame !== null) {
                    stopRotationAnimation();
                } else {
                    (function animate() {
                        fractalApp.rotation = (fractalApp.rotation + rotationSpeed + 2 * Math.PI) % (2 * Math.PI); // Normalize rotation
                        fractalApp.draw();
                        rotationAnimationFrame = requestAnimationFrame(animate);
                        updateInfo(true);
                    })();
                }
                break;


            case 'KeyE': // Debug lines
                toggleDebugLines();
                break;

            case 'KeyR': // Reset
                if (event.shiftKey) switchFractalMode(fractalMode);
                break;

            case 'KeyT': // Random colors
                if (event.altKey) {
                    fractalApp.colorPalette = fractalApp.DEFAULT_PALETTE;
                    fractalApp.draw();
                    updateColorTheme();
                    return;
                }
                if (event.shiftKey) {
                    console.log(" animating colors  " + fractalApp.currentColorAnimationFrame);
                    if (fractalApp.currentColorAnimationFrame !== null) {
                        console.log("stopping animating colors");
                        fractalApp.stopCurrentColorAnimation();
                    } else {
                        console.log("starting animating colors");
                        fractalApp.animateFullColorSpaceCycle(15000);
                    }
                } else {
                    randomizeColors();
                }
                break;

            case 'KeyA': // Forced resize
                console.log("Resizing canvas (forced)");
                fractalApp.resizeCanvas();
                break;

            case 'KeyS': // Screenshot
                if (event.shiftKey) takeScreenshot();
                break;

            case 'KeyD': // Start/stop demo
                toggleDemo();
                break;

            case "ArrowLeft": // Julia cx smooth down
                if (event.ctrlKey || !isJuliaMode()) {
                    let step = mandelbrotPanSpeed * fractalApp.zoom;
                    let r = fractalApp.rotation;
                    let dx = -step, dy = 0;
                    let deltaX = dx * Math.cos(r) - dy * Math.sin(r);
                    let deltaY = dx * Math.sin(r) + dy * Math.cos(r);
                    fractalApp.animatePan([fractalApp.pan[0] + deltaX, fractalApp.pan[1] + deltaY], 50);
                } else {
                    fractalApp.animateToC([fractalApp.c[0] - JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_STEP : 1), fractalApp.c[1]], JULIA_HOTKEY_C_SPEED);
                }
                break;

            case "ArrowRight": // Julia cx smooth up
                if (event.ctrlKey || !isJuliaMode()) {
                    let step = mandelbrotPanSpeed * fractalApp.zoom;
                    let r = fractalApp.rotation;
                    let dx = step, dy = 0;
                    let deltaX = dx * Math.cos(r) - dy * Math.sin(r);
                    let deltaY = dx * Math.sin(r) + dy * Math.cos(r);
                    fractalApp.animatePan([fractalApp.pan[0] + deltaX, fractalApp.pan[1] + deltaY], 50);
                } else {
                    fractalApp.animateToC([fractalApp.c[0] + JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_STEP : 1), fractalApp.c[1]], JULIA_HOTKEY_C_SPEED);
                }
                break;

            case "ArrowUp": // Julia cy smooth up
                if (event.ctrlKey || !isJuliaMode()) {
                    let step = mandelbrotPanSpeed * fractalApp.zoom;
                    let r = fractalApp.rotation;
                    let dx = 0, dy = step;
                    let deltaX = dx * Math.cos(r) - dy * Math.sin(r);
                    let deltaY = dx * Math.sin(r) + dy * Math.cos(r);
                    fractalApp.animatePan([fractalApp.pan[0] + deltaX, fractalApp.pan[1] + deltaY], 50);
                } else {
                    fractalApp.animateToC([fractalApp.c[0], fractalApp.c[1] - JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_STEP : 1)], JULIA_HOTKEY_C_SPEED);
                }
                break; // Julia cy smooth down

            case "ArrowDown":
                if (event.ctrlKey || !isJuliaMode()) {
                    let step = mandelbrotPanSpeed * fractalApp.zoom;
                    let r = fractalApp.rotation;
                    let dx = 0, dy = -step;
                    let deltaX = dx * Math.cos(r) - dy * Math.sin(r);
                    let deltaY = dx * Math.sin(r) + dy * Math.cos(r);
                    fractalApp.animatePan([fractalApp.pan[0] + deltaX, fractalApp.pan[1] + deltaY], 50);
                } else {
                    fractalApp.animateToC([fractalApp.c[0], fractalApp.c[1] + JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_STEP : 1)], JULIA_HOTKEY_C_SPEED);
                }
                break;

            case "Space":
                fractalApp.animateZoom(fractalApp.zoom * (event.shiftKey ? 1.1 : 0.9), 20);
                break;

            case "Enter":
                header.classList.remove('minimized');
                handle.style.display = "none";
                console.log(fractalApp.colorPalette);
                break;

            default:
                // Case nums:
                const match = event.code.match(/^(Digit|Numpad)([1-9])$/);
                if (match) {
                    console.log("Pressed:", event.code, "Number:", match[2]);

                    const index = match[2]; // match[2] contains the digit pressed
                    if (event.shiftKey && isJuliaMode()) {
                        if (index !== activeJuliaDiveIndex) {
                            stopDemoMode();
                        }
                        activeJuliaDiveIndex = index;
                        startJuliaDive(fractalApp.DIVES[activeJuliaDiveIndex]);
                        diveButtons[index].classList.add('active');
                    } else {
                        if (index !== activePresetIndex) {
                            activePresetIndex = index;
                            travelToPreset(fractalApp.PRESETS[index]);
                            presetButtons[index].classList.add('active');
                        } else {
                            console.log("Already set preset, skipping");
                        }
                    }
                }
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
        initDives();
        updateColorTheme([0.298, 0.298, 0.741]);
        header.style.background = 'rgba(20, 20, 20, 0.8)';
        infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';
    }

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initPresetButtonEvents();
    initInfoText();
    initFractalSwitchRadios();
    initHotkeys();
    initCommonButtonEvents(); // After all dynamic buttons are set


    // Register control events
    if (isTouchDevice()) {
        initTouchHandlers(fractalApp);
    } else {
        initMouseHandlers(fractalApp);
    }

    if (DEBUG_MODE) {
        //initDebugMode();
    }

    uiInitialized = true;
}

/**
 * Updates color scheme
 * @param [palette] defaults to the fractal palette
 */
function updateColorTheme(palette) {
    palette ||= fractalApp.colorPalette.slice();
    console.log('Setting color theme to ' + palette)
    const brightnessFactor = 1.9; // Increase brightness by 90%
    const adjustChannel = (value) => Math.min(255, Math.floor(value * 255 * brightnessFactor));

    const borderColor = `rgb(${adjustChannel(palette[0])}, ${adjustChannel(palette[1])}, ${adjustChannel(palette[2])})`;
    const accentColor = `rgba(${Math.floor(palette[0] * 200)}, ${Math.floor(palette[1] * 200)}, ${Math.floor(palette[2] * 200)}, 0.1)`; // Slightly dimmed for borders

    let root = document.querySelector(':root');
    root.style.setProperty('--bg-color', accentColor);
    root.style.setProperty('--accent-color', borderColor);
}

/**
 * Disable slider controls
 */
function disableJuliaSliders() {
    imagSlider.disabled = true;
    realSlider.disabled = true;

    realSlider.classList.add('thumbDisabled');
    imagSlider.classList.add('thumbDisabled');
}

/**
 * Enable slider controls
 */
function enableJuliaSliders() {
    imagSlider.disabled = false;
    realSlider.disabled = false;

    realSlider.classList.remove('thumbDisabled');
    imagSlider.classList.remove('thumbDisabled');
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
        text += `p = [${panX.toFixed(DEBUG_MODE ? 12 : 6)}, ${panY.toFixed(DEBUG_MODE ? 12 : 6)}i] · `;
    }

    if (fractalMode === MODE_JULIA) {
        const cx = fractalApp.c[0] ?? 0;
        const cy = fractalApp.c[1] ?? 0;

        text += `c = [${cx.toFixed(DEBUG_MODE ? 12 : 2)}, ${cy.toFixed(DEBUG_MODE ? 12 : 2)}i] · `;
    }

    const currentZoom = fractalApp.zoom ?? 0;
    const currentRotation = (fractalApp.rotation * 180 / Math.PI) % 360;
    const normalizedRotation = currentRotation < 0 ? currentRotation + 360 : currentRotation;
    text += `r = ${normalizedRotation.toFixed(0)}° · zoom = ${currentZoom.toFixed(6)}`;

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
    imagSliderValue.innerText = fractalApp.c[1].toFixed(2) + 'i';
    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
}