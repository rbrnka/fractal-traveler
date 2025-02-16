import {
    clearURLParams, getAnimationDuration, hsbToRgb, isTouchDevice, updateURLParams
} from '../global/utils.js';
import {initMouseHandlers, registerMouseEventHandlers, unregisterMouseEventHandlers} from "./mouseEventHandlers";
import {initTouchHandlers, registerTouchEventHandlers, unregisterTouchEventHandlers} from "./touchEventHandlers";
import {JuliaRenderer} from "../renderers/juliaRenderer";
import {takeScreenshot} from "./screenshotController";
import {
    DEBUG_MODE,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_BG_COLOR,
    DEFAULT_CONSOLE_GROUP_COLOR,
    FRACTAL_TYPE
} from "../global/constants";
import {initHotKeys} from "./hotkeyController";

/**
 * @module UI
 * @author Radim Brnka
 * @description Contains code to manage the UI (header interactions, buttons, infoText update, etc.).
 */

let canvas;
let fractalApp;

let fractalMode = FRACTAL_TYPE.MANDELBROT;

const DEMO_BUTTON_DEFAULT_TEXT = 'Demo';
const DEMO_BUTTON_STOP_TEXT = 'Stop';

let accentColor = DEFAULT_ACCENT_COLOR;
let bgColor = DEFAULT_BG_COLOR;

let headerMinimizeTimeout = null;
let uiInitialized = false;
let headerToggled = false;

let animationActive = false;
let activeJuliaDiveIndex = -1;
let activePresetIndex = -1;
let resizeTimeout;

// HTML elements
let header;
let handle;
let mandelbrotSwitch;
let juliaSwitch;
let resetButton;
let randomizeColorsButton;
let screenshotButton;
let demoButton;
let presetButtons = [];
let diveButtons = [];
let allButtons = [];
let infoLabel;
let infoText;

// Julia sliders
let realSlider;
let imagSlider;
let realSliderValue;
let imagSliderValue;
let lastSliderUpdate = 0; // Tracks the last time the sliders were updated
const sliderUpdateThrottleLimit = 10; // Throttle limit in milliseconds

let lastInfoUpdate = 0; // Tracks the last time the sliders were updated
const infoUpdateThrottleLimit = 10; // Throttle limit in milliseconds

let rotationAnimationFrame = null; // For hotkey rotation only

export function switchFractalMode(mode) {
    clearURLParams();

    window.location.hash = mode === FRACTAL_TYPE.JULIA ? '#julia' : ''; // Update URL hash
    window.location.reload();
}

export function isJuliaMode() {
    return fractalMode === FRACTAL_TYPE.JULIA;
}

export function enableJuliaMode() {
    fractalMode = FRACTAL_TYPE.JULIA;

    juliaSwitch.classList.add('active');
    mandelbrotSwitch.classList.remove('active');
}

/**
 * Updates color scheme
 * @param [palette] defaults to the fractal palette
 */
export function updateColorTheme(palette) {
    palette ||= [...fractalApp.colorPalette];

    const brightnessFactor = 1.9; // Increase brightness by 90%
    const adjustChannel = (value) => Math.min(255, Math.floor(value * 255 * brightnessFactor));

    accentColor = `rgba(${adjustChannel(palette[0])}, ${adjustChannel(palette[1])}, ${adjustChannel(palette[2])}, 1)`;
    bgColor = `rgba(${Math.floor(palette[0] * 200)}, ${Math.floor(palette[1] * 200)}, ${Math.floor(palette[2] * 200)}, 0.1)`; // Slightly dimmed for borders

    let root = document.querySelector(':root');
    root.style.setProperty('--bg-color', bgColor);
    root.style.setProperty('--accent-color', accentColor);
}

function resetJuliaSliders() {
    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
    realSliderValue.innerText = realSlider.value;
    imagSliderValue.innerText = imagSlider.value + 'i';
    fractalApp.demoTime = 0;
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
 * @param {boolean} [traveling] if inside animation
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

    let text = (animationActive ? ` [DEMO] ` : ``);

    const panX = fractalApp.pan[0] ?? 0;
    const panY = fractalApp.pan[1] ?? 0;

    // TODO refactor using expandComplexToString
    if (fractalMode === FRACTAL_TYPE.MANDELBROT || (fractalMode === FRACTAL_TYPE.JULIA && !animationActive)) {
        text += `p = [${panX.toFixed(DEBUG_MODE ? 12 : 6)}, ${panY.toFixed(DEBUG_MODE ? 12 : 6)}i] · `;
    }

    if (fractalMode === FRACTAL_TYPE.JULIA) {
        const cx = fractalApp.c[0] ?? 0;
        const cy = fractalApp.c[1] ?? 0;

        text += `c = [${cx.toFixed(DEBUG_MODE ? 12 : 2)}, ${cy.toFixed(DEBUG_MODE ? 12 : 2)}i] · `;
    }

    const currentZoom = fractalApp.zoom ?? 0;
    const currentRotation = (fractalApp.rotation * 180 / Math.PI) % 360;
    const normalizedRotation = currentRotation < 0 ? currentRotation + 360 : currentRotation;
    text += `r = ${normalizedRotation.toFixed(0)}° · zoom = ${currentZoom.toFixed(6)}`;

    if (animationActive) {
        infoText.classList.add('animationActive');
    } else {
        infoText.classList.remove('animationActive');
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

function exitAnimationMode() {
    console.groupCollapsed(`%c exitAnimationMode`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    if (!animationActive) {
        return;
    }

    animationActive = false;

    fractalApp.stopCurrentNonColorAnimations();

    demoButton.innerText = DEMO_BUTTON_DEFAULT_TEXT;
    demoButton.classList.remove('active');

    if (isTouchDevice()) {
        registerTouchEventHandlers();
    } else {
        registerMouseEventHandlers();
    }

    if (isJuliaMode()) {
        enableJuliaSliders();
    }

    setTimeout(() => {
        updateInfo();
    }, 150);
}

/**
 * Disable controls, activates demo button
 */
function initAnimationMode() {
    console.groupCollapsed(`%c initAnimationMode`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    if (animationActive) {
        return;
    }

    animationActive = true;

    // resetPresetAndDiveButtons();
    demoButton.innerText = DEMO_BUTTON_STOP_TEXT;
    demoButton.classList.add('active');

    // Unregister control events
    if (isTouchDevice()) {
        unregisterTouchEventHandlers();
    } else {
        unregisterMouseEventHandlers();
    }

    if (isJuliaMode()) {
        disableJuliaSliders();
    }

    clearURLParams();

    console.groupEnd();
}

export function toggleDemo() {
    console.groupCollapsed(`%c toggleDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    if (animationActive) {
        resetPresetAndDiveButtonStates();
        stopRotationAnimation();
        exitAnimationMode();
        activeJuliaDiveIndex = -1;
        fractalApp.stopDemo();
        return;
    }

    initAnimationMode();

    switch (fractalMode) {
        case FRACTAL_TYPE.MANDELBROT:
            startMandelbrotDemo();
            break
        case FRACTAL_TYPE.JULIA:
            startJuliaDemo();
            break
        default:
            console.warn('No demo defined for mode ' + fractalMode);
            exitAnimationMode();
            break;
    }

    console.groupEnd();
}

/**
 * Starts the Mandelbrot demo using async/await.
 * It animates through the presets (from fractalApp.PRESETS) by waiting for the
 * preset animation to finish and then pausing for 3500ms before moving on.
 */
async function startMandelbrotDemo() {
    console.groupCollapsed(`%c startMandelbrotDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    await fractalApp.animateDemo();

    console.log("Demo ended");
    // When animationActive is false, reset the fractal.
    // resetPresetAndDiveButtonStates();
    // stopRotationAnimation();
    // exitAnimationMode();

    console.groupEnd();
}

async function startJuliaDive(dives, index) {
    if (animationActive && index === activeJuliaDiveIndex) {
        console.log(`%c startJuliaDive: %c Dive ${index} already in progress. Skipping.`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        return;
    }

    if (animationActive) {
        exitAnimationMode();
    }

    resetPresetAndDiveButtonStates();
    activeJuliaDiveIndex = index;
    diveButtons[index].classList.add('active');

    const dive = dives[index];

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

    initAnimationMode();

    //if (DEBUG_MODE) dive.step *= 10;

    // Transition to the initial preset first.
    const duration = getAnimationDuration(500, fractalApp, {c: dive.startC, pan: dive.pan, zoom: dive.zoom},
        {pan: 0.5, zoom: 2, c: 1});
    console.log(duration);

    // Phase 1: Set initial state
    // await fractalApp.animateTravelToPreset({
    //     pan: dive.pan, c: dive.startC.slice(), // copy initial c
    //     zoom: dive.zoom, rotation: dive.rotation
    // }, 1500, EASE_TYPE.QUINT);
    // Alternatively:
    await fractalApp.animateToZoomAndC(fractalApp.DEFAULT_ZOOM, dive.startC, 1500);

    // Phase 2: Enter dive mode
    await Promise.all([
        fractalApp.animateDive(dive),
        fractalApp.animatePanZoomRotationTo(dive.pan, dive.zoom, dive.rotation, 1500)
    ]);
}

async function startJuliaDemo() {
    console.groupCollapsed(`%c startJuliaDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    if (animationActive) {
        console.log(`%c startJuliaDive: %c Animation already in progress. Stopping.`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        exitAnimationMode();
    }

    initAnimationMode();

    resetPresetAndDiveButtonStates();

    // Initialize or continue the demo?
    if (fractalApp.demoTime === 0) {
        await fractalApp.animateTravelToPreset({
            pan: fractalApp.DEFAULT_PAN, c: [-0.25, 0.7], // For smooth c transition
            zoom: fractalApp.DEFAULT_ZOOM, rotation: fractalApp.DEFAULT_ROTATION
        }, 1000);
    }

    await fractalApp.animateDemo();

    exitAnimationMode();

    console.groupEnd();
}

function stopRotationAnimation() {
    if (rotationAnimationFrame !== null) {
        cancelAnimationFrame(rotationAnimationFrame);
        rotationAnimationFrame = null;
    }
}

export async function travelToPreset(presets, index) {
    if (animationActive) {
        console.log(`%c travelToPreset: %c Travel to preset ${index} requested, active animation in progress, interrupting...`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        exitAnimationMode();
    }

    if (index === activePresetIndex) {
        console.log(`%c travelToPreset: %c Already on preset ${index}, skipping.`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        return;
    }

    console.log(`%c travelToPreset: %c Executing travel to preset ${index}`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

    resetPresetAndDiveButtonStates();
    initAnimationMode();

    activePresetIndex = index;
    presetButtons[index].classList.add('active');

    if (isJuliaMode()) {
        fractalApp.demoTime = 0;
        await fractalApp.animateTravelToPreset(presets[index], 750);
    } else {
        await fractalApp.animateTravelToPreset(presets[index]);
    }

    exitAnimationMode();
    updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null);
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

export function resetPresetAndDiveButtonStates() {
    console.log(`%c resetPresetAndDiveButtonStates: %c Button states reset.`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
    presetButtons.concat(diveButtons).forEach(b => b.classList.remove('active'));
}

/**
 * This needs to happen on any fractal change
 */
export function resetActivePresetIndex() {
    activePresetIndex = -1;
}

export async function randomizeColors() {
    // Generate a bright random color palette
    // Generate colors with better separation and higher brightness
    const hue = Math.random(); // Hue determines the "base color" (red, green, blue, etc.)
    const saturation = Math.random() * 0.5 + 0.5; // Ensure higher saturation (more vivid colors)
    const brightness = Math.random() * 0.5 + 0.5; // Ensure higher brightness

    // Convert HSB/HSV to RGB
    const newPalette = hsbToRgb(hue, saturation, brightness);

    await fractalApp.animateColorPaletteTransition(newPalette, 250, updateColorTheme); // Update app colors
}

export function captureScreenshot() {
    takeScreenshot(canvas, fractalApp, accentColor);
}

// region > INITIALIZERS -----------------------------------------------------------------------------------------------

function initHeaderEvents() {

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
        if (!headerToggled && !DEBUG_MODE) {
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
        if (DEBUG_MODE) return;

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
        randomizeColors().then(() => {

        });
    });

    demoButton.addEventListener('click', () => {
        toggleDemo();
    });

    screenshotButton.addEventListener('click', () => {
        captureScreenshot();
    });

}

function initPresetButtonEvents() {
    const presetBlock = document.getElementById('presets');
    presetBlock.innerHTML = 'Presets: ';

    presetButtons = [];

    const presets = [...fractalApp.PRESETS];
    presets.forEach((preset, index) => {
        const btn = document.createElement('button');
        btn.id = 'preset' + (index);
        btn.className = 'preset';
        btn.textContent = (index).toString();
        btn.addEventListener('click', () => {
            travelToPreset(presets, index);
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

function initDiveButtons() {
    if (isJuliaMode()) {
        const diveBlock = document.getElementById('dives');
        diveBlock.innerHTML = 'Dives: ';

        diveButtons = [];

        const dives = [...fractalApp.DIVES];
        dives.forEach((dive, index) => {
            const btn = document.createElement('button');
            btn.id = 'dive' + (index);
            btn.className = 'dive';
            btn.textContent = (index).toString();
            btn.addEventListener('click', () => {
                startJuliaDive(dives, index);
            });

            diveBlock.appendChild(btn);
            diveButtons.push(btn);
        });

        diveBlock.style.display = 'block';
    }
}

function initFractalSwitchButtons() {
    mandelbrotSwitch.addEventListener('click', (event) => {
        if (isJuliaMode()) switchFractalMode(FRACTAL_TYPE.MANDELBROT);
    });

    juliaSwitch.addEventListener('click', (event) => {
        if (!isJuliaMode()) switchFractalMode(FRACTAL_TYPE.JULIA);
    });
}

function initJuliaSliders() {
    resetJuliaSliders();

    // Update `c` dynamically when sliders are moved
    realSlider.addEventListener('input', () => {
        fractalApp.c[0] = parseFloat(realSlider.value);
        realSliderValue.innerText = fractalApp.c[0].toFixed(2);
        fractalApp.draw();
        updateInfo();
        clearURLParams();
        resetPresetAndDiveButtonStates();
        fractalApp.demoTime = 0;
    });

    imagSlider.addEventListener('input', () => {
        fractalApp.c[1] = parseFloat(imagSlider.value);
        imagSliderValue.innerText = fractalApp.c[1].toFixed(2) + 'i';
        fractalApp.draw();
        updateInfo();
        clearURLParams();
        resetPresetAndDiveButtonStates();
        fractalApp.demoTime = 0;
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
        text += isJuliaMode() ? `, c: [${fractalApp.c}]}` : `}`;
        navigator.clipboard.writeText(text).then(function () {
            textarea.innerText = 'Copied to clipboard!';
        }, function (err) {
            console.error('Not copied to clipboard! ' + err.toString());
        });
    });
}

function initKeyboardShortcuts() {
    initHotKeys(fractalApp);
}

/**
 * Initializes the UI and registers UI event handlers
 * @param fractalRenderer
 */
export async function initUI(fractalRenderer) {
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
    mandelbrotSwitch = document.getElementById('mandelbrotSwitch');
    juliaSwitch = document.getElementById('juliaSwitch');
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
        initJuliaSliders();
        initDiveButtons();
        updateColorTheme([0.298, 0.298, 0.741]);
        // Darker backgrounds for Julia as it renders on white
        header.style.background = 'rgba(20, 20, 20, 0.8)';
        infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';
    }

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initPresetButtonEvents();
    initInfoText();
    initFractalSwitchButtons();
    initKeyboardShortcuts();
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

// endregion------------------------------------------------------------------------------------------------------------