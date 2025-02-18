import {
    clearURLParams,
    destroyArrayOfButtons,
    getAnimationDuration,
    hsbToRgb,
    isTouchDevice,
    updateURLParams
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
    DEFAULT_JULIA_THEME_COLOR,
    DEFAULT_MANDELBROT_THEME_COLOR,
    FRACTAL_TYPE
} from "../global/constants";
import {destroyHotKeys, initHotKeys} from "./hotkeyController";
import {MandelbrotRenderer} from "../renderers/mandelbrotRenderer";
import {
    destroyJuliaSliders,
    disableJuliaSliders,
    enableJuliaSliders,
    initJuliaSliders,
    resetJuliaSliders, updateJuliaSliders
} from "./juliaSlidersController";

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
let midColor = DEFAULT_BG_COLOR; // TODO use?
let bgColor = DEFAULT_BG_COLOR;

let headerMinimizeTimeout = null;
let uiInitialized = false;
/** @type {boolean} */
let headerVisible = true;

let animationActive = false;
let activeJuliaDiveIndex = -1;
let activePresetIndex = -1;
let resizeTimeout;

// HTML elements
let header;
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

let lastInfoUpdate = 0; // Tracks the last time the sliders were updated
const infoUpdateThrottleLimit = 10; // Throttle limit in milliseconds

export function switchFractalMode(mode) {
    if (mode === fractalMode) return;

    fractalApp.destroy();

    if (mode === FRACTAL_TYPE.MANDELBROT) {
        enableMandelbrotMode();
    } else {
        enableJuliaMode();
    }

    // Register control events
    if (isTouchDevice()) {
        unregisterTouchEventHandlers();
        initTouchHandlers(fractalApp);
    } else {
        destroyHotKeys();
        initHotKeys(fractalApp);

        unregisterMouseEventHandlers();
        initMouseHandlers(fractalApp);
    }

    fractalApp.reset();
}

export function isJuliaMode() {
    return fractalMode === FRACTAL_TYPE.JULIA;
}

export function enableMandelbrotMode() {
    juliaSwitch.classList.remove('active');
    mandelbrotSwitch.classList.add('active');

    destroyArrayOfButtons(diveButtons);
    const diveBlock = document.getElementById('dives');
    diveBlock.style.display = 'none';

    destroyJuliaSliders();

    fractalApp = new MandelbrotRenderer(canvas);
    fractalMode = FRACTAL_TYPE.MANDELBROT;

    // Remove each button from the DOM and reinitialize
    destroyArrayOfButtons(presetButtons);
    resetActivePresetIndex();
    initPresetButtonEvents();

    updateColorTheme(DEFAULT_MANDELBROT_THEME_COLOR);

    window.location.hash = ''; // Update URL hash
}

export function enableJuliaMode() {
    fractalApp = new JuliaRenderer(canvas);
    fractalMode = FRACTAL_TYPE.JULIA;

    juliaSwitch.classList.add('active');
    mandelbrotSwitch.classList.remove('active');

    // Remove each button from the DOM and reinitialize
    destroyArrayOfButtons(presetButtons);
    initPresetButtonEvents();

    initJuliaSliders(fractalApp);
    updateJuliaSliders();

    destroyArrayOfButtons(diveButtons);
    const diveBlock = document.getElementById('dives');
    diveBlock.style.display = 'none';

    initDiveButtons();

    resetActivePresetIndex();

    updateColorTheme(DEFAULT_JULIA_THEME_COLOR);
    // Darker backgrounds for Julia as it renders on white
    header.style.background = 'rgba(20, 20, 20, 0.8)';
    infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';

    window.location.hash = '#julia'; // Update URL hash
}

/**
 * Updates color scheme
 * @param {PALETTE} [palette] defaults to the fractal palette
 */
export function updateColorTheme(palette) {
    palette ||= [...fractalApp.colorPalette];

    const adjustChannel = (value, brightnessFactor = 1.9) => Math.min(255, Math.floor(value * 255 * brightnessFactor));

    accentColor = `rgba(${adjustChannel(palette[0])}, ${adjustChannel(palette[1])}, ${adjustChannel(palette[2])}, 1)`;
    midColor = `rgba(${adjustChannel(palette[0], .5)}, ${adjustChannel(palette[1], .5)}, ${adjustChannel(palette[2], .5)}, 0.2)`;
    bgColor = `rgba(${Math.floor(palette[0] * 200)}, ${Math.floor(palette[1] * 200)}, ${Math.floor(palette[2] * 200)}, 0.1)`; // Slightly dimmed for borders

    let root = document.querySelector(':root');
    root.style.setProperty('--bg-color', bgColor);
    root.style.setProperty('--mid-color', midColor);
    root.style.setProperty('--accent-color', accentColor);
}

/** Resets buttons, active presets and URL */
export function resetAppState() {
    resetPresetAndDiveButtonStates();
    resetActivePresetIndex();
    clearURLParams();
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

    let text = (animationActive ? ` [AUTO] ` : ``);

    const panX = fractalApp.pan[0] ?? 0;
    const panY = fractalApp.pan[1] ?? 0;

    text += `p = [${panX.toFixed(DEBUG_MODE ? 12 : 6)}, ${panY.toFixed(DEBUG_MODE ? 12 : 6)}i] · `;

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

export function isAnimationActive() {
    return animationActive;
}

/** Enables controls, resets demo button */
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

/** Disables controls, activates demo button */
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

/**
 * Turns demo on/off and/or stops current animation
 * @return {Promise<void>}
 */
export async function toggleDemo() {
    console.groupCollapsed(`%c toggleDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    if (animationActive) {
        resetPresetAndDiveButtonStates();
        activeJuliaDiveIndex = -1;
        fractalApp.stopDemo();
        exitAnimationMode();
        return;
    }

    resetPresetAndDiveButtonStates();
    initAnimationMode();

    switch (fractalMode) {
        case FRACTAL_TYPE.MANDELBROT: await startMandelbrotDemo(); break;

        case FRACTAL_TYPE.JULIA: await startJuliaDemo(); break;

        default:
            console.warn(`No demo defined for mode ${fractalMode}`);
            exitAnimationMode();
            break;
    }

    console.groupEnd();
}

/** Starts the Mandelbrot demo */
async function startMandelbrotDemo() {
    console.groupCollapsed(`%c startMandelbrotDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    await fractalApp.animateDemo();

    console.log("Demo ended");
    console.groupEnd();
}

/** Starts the Julia dive infinite animation */
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

/** Starts the Julia demo */
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

/**
 * Travels to preset at given index
 * @param {Array<PRESET>} presets
 * @param {number} index Preset array index
 * @return {Promise<void>}
 */
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
        await fractalApp.animateTravelToPreset(presets[index], 1500);
    } else {
        await fractalApp.animateTravelToPreset(presets[index]);
    }

    exitAnimationMode();
    updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null);
}

/** Inits debug bar with various information permanently shown on the screen */
function initDebugMode() {
    infoLabel.style.height = '80px';

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

/** Toggles x/y axes */
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
    if (DEBUG_MODE) console.log(`%c resetPresetAndDiveButtonStates: %c Button states reset.`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
    presetButtons.concat(diveButtons).forEach(b => b.classList.remove('active'));
}

/**
 * This needs to happen on any fractal change
 */
export function resetActivePresetIndex() {
    activePresetIndex = 0;
}

export async function randomizeColors() {
    // Generate a bright random color palette
    // Generate colors with better separation and higher brightness
    const hue = Math.random(); // Hue determines the "base color" (red, green, blue, etc.)
    const saturation = Math.random() * 0.5 + 0.5; // Ensure higher saturation (more vivid colors)
    const brightness = Math.random() * 0.5 + 0.5; // Ensure higher brightness

    // Convert HSB/HSV to RGB
    const newPalette = hsbToRgb(hue, saturation, brightness);

    await fractalApp.animateColorPaletteTransition(newPalette, 250, () => {
        updateColorTheme(newPalette);
    }); // Update app colors
}

export function captureScreenshot() {
    takeScreenshot(canvas, fractalApp, accentColor);
}

/**
 * Shows/hides/toggles header.
 * @param {boolean|null} show Show header? If null, then toggles current state
 */
export function toggleHeader(show = null) {
    let header = document.getElementById('headerContainer');

    if (show === null) show = !headerVisible;

    if (show) {
        header.classList.remove('minimized');
    } else {
        header.classList.add('minimized');
    }

    headerVisible = show;
}

export async function reset() {
    updateColorTheme(isJuliaMode() ? DEFAULT_JULIA_THEME_COLOR : DEFAULT_MANDELBROT_THEME_COLOR);
    fractalApp.reset();
    if (isJuliaMode()) {
        resetJuliaSliders();
    }
    resetAppState();
    presetButtons[0].classList.add('active');
}

// region > INITIALIZERS -----------------------------------------------------------------------------------------------

function initHeaderEvents() {

    document.getElementById('logo').addEventListener('pointerenter', () => {
        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
        toggleHeader(true);
    });

    header.addEventListener('pointerleave', async () => {
        // Only minimize if it hasn't been toggled manually
        if (headerVisible && !DEBUG_MODE) {
            headerMinimizeTimeout = setTimeout(() => {
                toggleHeader(false);
                headerMinimizeTimeout = null;
            }, 3000);
        }
    });

    // When user clicks/taps outside of the header
    canvas.addEventListener('pointerdown', () => {
        if (DEBUG_MODE) return;
        toggleHeader(false);
    });
}

function initControlButtonEvents() {
    resetButton.addEventListener('click', async () => {
        await reset();
    });

    randomizeColorsButton.addEventListener('click', randomizeColors);

    demoButton.addEventListener('click', toggleDemo);

    screenshotButton.addEventListener('click', captureScreenshot);
}

function initPresetButtonEvents() {
    const presetBlock = document.getElementById('presets');
    // presetBlock.innerHTML = 'Presets: ';
    //
    presetButtons = [];

    const presets = [...fractalApp.PRESETS];
    presets.forEach((preset, index) => {
        const btn = document.createElement('button');
        btn.id = 'preset' + (index);
        btn.className = 'preset';
        btn.title = preset.title || ('Preset ' + index);
        btn.textContent = (index).toString();
        btn.addEventListener('click', async () => {
            await travelToPreset(presets, index);
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
        //diveBlock.innerHTML = 'Dives: ';

        diveButtons = [];

        const dives = [...fractalApp.DIVES];
        dives.forEach((dive, index) => {
            const btn = document.createElement('button');
            btn.id = 'dive' + (index);
            btn.className = 'dive';
            btn.title = dive.title || ('Preset ' + index);
            btn.textContent = (index).toString();
            btn.addEventListener('click', async () => {
                await startJuliaDive(dives, index);
            });

            diveBlock.appendChild(btn);
            diveButtons.push(btn);
        });

        diveBlock.style.display = 'block';
    }
}

function initFractalSwitchButtons() {
    mandelbrotSwitch.addEventListener('click', () => {
        switchFractalMode(FRACTAL_TYPE.MANDELBROT);
    });

    juliaSwitch.addEventListener('click', () => {
        switchFractalMode(FRACTAL_TYPE.JULIA);
    });
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
    mandelbrotSwitch = document.getElementById('mandelbrotSwitch');
    juliaSwitch = document.getElementById('juliaSwitch');
    header = document.getElementById('headerContainer');
    infoLabel = document.getElementById('infoLabel');
    infoText = document.getElementById('infoText');
    resetButton = document.getElementById('reset');
    randomizeColorsButton = document.getElementById('randomize');
    screenshotButton = document.getElementById('screenshot');
    demoButton = document.getElementById('demo');

    if (fractalRenderer instanceof JuliaRenderer) {
        enableJuliaMode();
    } else {
        enableMandelbrotMode();
    }

    initWindowEvents();
    initHeaderEvents();
    initControlButtonEvents();
    initInfoText();
    initFractalSwitchButtons();
    initCommonButtonEvents(); // After all dynamic buttons are set

    // Register control events
    if (isTouchDevice()) {
        initTouchHandlers(fractalApp);
    } else {
        initHotKeys(fractalApp);
        initMouseHandlers(fractalApp);
    }

    if (DEBUG_MODE) {
        initDebugMode();
    }

    uiInitialized = true;
}

// endregion------------------------------------------------------------------------------------------------------------