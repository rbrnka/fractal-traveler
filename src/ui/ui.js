import {
    clearURLParams,
    ddValue,
    destroyArrayOfButtons,
    getAnimationDuration,
    getFractalName,
    hsbToRgb,
    isMobileDevice,
    isTouchDevice,
    normalizeRotation,
    updateURLParams
} from '../global/utils.js';
import {initMouseHandlers, registerMouseEventHandlers, unregisterMouseEventHandlers} from "./mouseEventHandlers";
import {initTouchHandlers, registerTouchEventHandlers, unregisterTouchEventHandlers} from "./touchEventHandlers";
import {JuliaRenderer} from "../renderers/juliaRenderer";
import {takeScreenshot} from "./screenshotController";
import {
    CONSOLE_GROUP_STYLE,
    CONSOLE_MESSAGE_STYLE,
    DEBUG_LEVEL,
    DEBUG_MODE,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_BG_COLOR,
    DEFAULT_JULIA_THEME_COLOR,
    DEFAULT_MANDELBROT_THEME_COLOR,
    FF_TRAVEL_TO_PRESET_WITH_ROTATION,
    FF_USER_INPUT_ALLOWED,
    FRACTAL_TYPE,
    log,
    PI,
    RANDOMIZE_COLOR_BUTTON_DEFAULT_TITLE
} from "../global/constants";
import {destroyHotKeys, initHotKeys} from "./hotkeyController";
import MandelbrotRenderer from "../renderers/mandelbrotRenderer";
import RiemannRenderer from "../renderers/riemannRenderer";
import {
    destroyJuliaSliders,
    disableJuliaSliders,
    enableJuliaSliders,
    initJuliaSliders,
    resetJuliaSliders,
    updateJuliaSliders
} from "./juliaSlidersController";
import {DebugPanel} from "./debugPanel";

/**
 * @module UI
 * @author Radim Brnka
 * @description Contains code to manage the UI (header interactions, buttons, infoText update, etc.).
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
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
let activePresetIndex = 0;
let resizeTimeout;

// HTML elements
let header;
let logo; // H1
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
export let debugPanel;

let lastInfoUpdate = 0; // Tracks the last time the sliders were updated
const infoUpdateThrottleLimit = 100; // Throttle limit in milliseconds

let pendingInfoTimer = null;
let pendingInfoForce = false;


export const getFractalMode = () => getFractalName(fractalMode);

/**
 * Switches among fractal modes
 * @param {FRACTAL_TYPE} mode
 * @param {PRESET} [preset] If present, it's set as the default state through travelToPreset
 */
export async function switchFractalMode(mode, preset = null) {
    console.groupCollapsed(`%c switchFractalMode`, CONSOLE_GROUP_STYLE);

    if (mode === fractalMode) {
        console.warn(`Switching to the same mode? Why?`);
        console.groupEnd();
        return;
    }

    exitAnimationMode();

    fractalApp.destroy();

    switch (mode) {
        case FRACTAL_TYPE.MANDELBROT:
            enableMandelbrotMode();
            break;

        case FRACTAL_TYPE.JULIA:
            enableJuliaMode();
            break;

        case FRACTAL_TYPE.RIEMANN:
            enableRiemannMode();
            break;

        default:
            console.error(`Unknown fractal mode "${mode}"!`);
            console.groupEnd();
            return;
    }

    // Detach debug panel from old renderer BEFORE destroy
    debugPanel?.setRenderer?.(null);

    // Attach debug panel to new renderer AFTER init/constructor
    debugPanel?.setRenderer?.(fractalApp);

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

    if (preset) {
        resetPresetAndDiveButtonStates();
        initAnimationMode();

        console.log(`Preset found, setting: ${JSON.stringify(preset)}`)
        if (isJuliaMode()) {
            await fractalApp.animateTravelToPreset({
                pan: [0, 0], c: preset.c, zoom: 0.5, rotation: 0
            }, 1000);
        } else {
            await fractalApp.animateTravelToPreset({
                pan: preset.pan, zoom: 0.0005, rotation: 0
            }, 500, 1000);
        }

        exitAnimationMode();
        updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null);
    }

    console.log(`Switched to ${mode === FRACTAL_TYPE.MANDELBROT ? 'Mandelbrot' : 'Julia'}`);
    console.groupEnd();
}

/**
 * Switches among fractal modes but keeps the c/pan settings so the fractals match each other.
 * @param {FRACTAL_TYPE} mode
 * @return {Promise<void>}
 */
export async function switchFractalModeWithPersistence(mode) {
    console.groupCollapsed(`%c switchFractalModeWithPersistence`, CONSOLE_GROUP_STYLE);

    if (mode === fractalMode) {
        console.warn(`Switching to the same mode? Why?`);
        console.groupEnd();
        return;
    }

    if (mode === FRACTAL_TYPE.MANDELBROT) {
        console.log('MAND')
        await switchFractalMode(FRACTAL_TYPE.MANDELBROT, {
            pan: fractalApp.c.slice(), zoom: 0.00005, rotation: 0
        });
    } else {
        console.log('JUL')
        await switchFractalMode(FRACTAL_TYPE.JULIA, {
            pan: [0, 0], c: fractalApp.pan.slice(), zoom: 0.5, rotation: 0
        });
    }

    console.groupEnd();
}

export const isJuliaMode = () => fractalMode === FRACTAL_TYPE.JULIA;

/**
 * Implemented in a way it's not needed to be called at the first render. Everything should be pre-initialized
 * for Mandelbrot mode.
 */
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
    if (activePresetIndex !== 0) resetActivePresetIndex();
    initPresetButtonEvents();

    updateColorTheme(DEFAULT_MANDELBROT_THEME_COLOR);

    updateRecolorButtonTitle();

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
    initDiveButtons();

    if (activePresetIndex !== 0) resetActivePresetIndex();

    updateColorTheme(DEFAULT_JULIA_THEME_COLOR);
    // Darker backgrounds for Julia as it renders on white
    header.style.background = 'rgba(20, 20, 20, 0.8)';
    infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';

    updateRecolorButtonTitle();

    window.location.hash = '#julia'; // Update URL hash
}

export function enableRiemannMode() {
    fractalApp = new RiemannRenderer(canvas);
    fractalApp.useAnalyticExtension = false;
    fractalMode = FRACTAL_TYPE.RIEMANN;

    destroyArrayOfButtons(presetButtons);

    window.location.hash = '#zeta'; // Update URL hash
}

export function updateRecolorButtonTitle() {
    if (isJuliaMode()) {
        let nextTheme = fractalApp.getNextColorThemeId();
        if (nextTheme) randomizeColorsButton.title = 'Next theme: "' + nextTheme + '" (T)';
    } else {
        randomizeColorsButton.title = RANDOMIZE_COLOR_BUTTON_DEFAULT_TITLE;
    }
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
 * @param force
 */
export function updateInfo(force = false) {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastInfoUpdate;

    // Coalescing throttle: If called too soon, schedule exactly one deferred update instead of dropping updates entirely.
    if (!force && timeSinceLastUpdate < infoUpdateThrottleLimit) {
        pendingInfoForce = pendingInfoForce || force;

        if (!pendingInfoTimer) {
            const delay = Math.max(infoUpdateThrottleLimit - timeSinceLastUpdate, 0);

            pendingInfoTimer = setTimeout(() => {
                pendingInfoTimer = null;

                const pendingForce = pendingInfoForce;
                pendingInfoForce = false;

                updateInfo(pendingForce || true);
            }, delay);
        }

        return;
    }

    lastInfoUpdate = now;

    if (!canvas || !fractalApp) {
        return;
    }

    let text = (animationActive ? ` [AUTO] ` : ``);

    const panX = ddValue(fractalApp.panDD.x) ?? 0;
    const panY = ddValue(fractalApp.panDD.y) ?? 0;

    text += `p: [${panX.toFixed(8)}, ${panY.toFixed(8)}i] · `;

    if (fractalMode === FRACTAL_TYPE.JULIA) {
        const cx = fractalApp.c[0] ?? 0;
        const cy = fractalApp.c[1] ?? 0;

        text += `c: [${cx.toFixed(4)}, ${cy.toFixed(4)}i] · `;
    }

    const currentZoom = fractalApp.zoom ?? 0;
    const currentRotation = (fractalApp.rotation * 180 / PI) % 360;
    const normalizedRotation = currentRotation < 0 ? currentRotation + 360 : currentRotation;
    text += `r: ${normalizedRotation.toFixed(0)}° · zoom:&nbsp;${currentZoom.toExponential(0)}`;

    if (animationActive) {
        if (!infoText.classList.contains('animationActive')) infoText.classList.add('animationActive');
    } else {
        if (infoText.classList.contains('animationActive')) infoText.classList.remove('animationActive');
    }

    if (FF_USER_INPUT_ALLOWED) {
        if (document.activeElement !== infoText) {
            if (infoText.innerHTML !== text) infoText.innerHTML = text;
        }
    } else {
        if (infoText.innerHTML !== text) infoText.innerHTML = text;
    }
}

/** @returns {boolean} */
export const isAnimationActive = () => animationActive;

/** Enables controls, resets demo button */
function exitAnimationMode() {
    console.groupCollapsed(`%c exitAnimationMode`, CONSOLE_GROUP_STYLE);

    if (!animationActive) {
        console.groupEnd();
        return;
    }

    animationActive = false;
    infoText.classList.remove('animation');

    fractalApp.stopAllNonColorAnimations();

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

    console.groupEnd();
}

/** Disables controls, activates demo button */
function initAnimationMode() {
    console.groupCollapsed(`%c initAnimationMode`, CONSOLE_GROUP_STYLE);

    if (animationActive) {
        console.groupEnd();
        return;
    }

    animationActive = true;
    infoText.classList.add('animation');

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
    console.groupCollapsed(`%c toggleDemo`, CONSOLE_GROUP_STYLE);

    if (animationActive) {
        resetPresetAndDiveButtonStates();
        activeJuliaDiveIndex = -1;
        fractalApp.stopDemo();
        exitAnimationMode();
        console.groupEnd();
        return;
    }

    resetPresetAndDiveButtonStates();
    initAnimationMode();

    switch (fractalMode) {
        // @formatter:off
        case FRACTAL_TYPE.MANDELBROT: await startMandelbrotDemo(); break;

        case FRACTAL_TYPE.JULIA: await startJuliaDemo(); break;

        default:
            console.warn(`No demo defined for mode ${fractalMode}`);
            exitAnimationMode();
            break;
        // @formatter:on
    }

    console.groupEnd();
}

/** Starts the Mandelbrot demo */
async function startMandelbrotDemo() {
    console.groupCollapsed(`%c startMandelbrotDemo`, CONSOLE_GROUP_STYLE);

    await fractalApp.animateDemo();

    console.log("Demo ended");
    console.groupEnd();
}

/**
 * Starts the Julia dive infinite animation
 * @param {Array<DIVE>} dives
 * @param {number} index Index of the dive
 * @return {Promise<void>}
 */
export async function startJuliaDive(dives, index) {
    if (animationActive && index === activeJuliaDiveIndex) {
        console.log(`%c startJuliaDive: %c Dive ${index} already in progress. Skipping.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
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
    console.groupCollapsed(`%c startJuliaDemo`, CONSOLE_GROUP_STYLE);

    if (animationActive) {
        console.log(`Animation already in progress. Stopping.`);
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
        console.log(`%c travelToPreset: %c Travel to preset ${index} requested, active animation in progress, interrupting...`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        exitAnimationMode();
    }

    if (index === activePresetIndex) {
        console.log(`%c travelToPreset: %c Already on preset ${index}, skipping.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    console.log(`%c travelToPreset: %c Executing travel to preset ${index}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    resetPresetAndDiveButtonStates();
    initAnimationMode();

    presetButtons[index].classList.add('active');

    if (isJuliaMode()) {
        fractalApp.demoTime = 0;
        await fractalApp.animateTravelToPreset(presets[index], 1500);
    } else {
        if (FF_TRAVEL_TO_PRESET_WITH_ROTATION) {
            await fractalApp.animateTravelToPresetWithRandomRotation(presets[index], 2000, 500, 1500);
        } else {
            await fractalApp.animateTravelToPreset(presets[index]);
        }
    }
    activePresetIndex = index;

    exitAnimationMode();
    updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null);
}

/** Inits debug bar with various information permanently shown on the screen */
export function toggleDebugMode() {
    if (debugPanel) {
        debugPanel.toggle();
    } else {
        debugPanel = new DebugPanel(canvas, fractalApp, accentColor);
        toggleCenterLines();
    }
}

/** Toggles x/y axes */
export function toggleCenterLines() {
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
    if (DEBUG_MODE) console.log(`%c resetPresetAndDiveButtonStates: %c Button states reset.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
    presetButtons.concat(diveButtons).forEach(b => b.classList.remove('active'));
}

/**
 * This needs to happen on any fractal change
 */
export function resetActivePresetIndex() {
    activePresetIndex = -1;
}

export async function randomizeColors() {
    if (isJuliaMode()) {
        await fractalApp.animateColorPaletteTransition(250, updateColorTheme);
        updateRecolorButtonTitle();
    } else {
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
    console.groupCollapsed(`%c reset`, CONSOLE_GROUP_STYLE);

    updateColorTheme(isJuliaMode() ? DEFAULT_JULIA_THEME_COLOR : DEFAULT_MANDELBROT_THEME_COLOR);

    exitAnimationMode();

    fractalApp.reset();
    if (isJuliaMode()) {
        resetJuliaSliders();
    }
    resetAppState();
    updateRecolorButtonTitle();
    presetButtons[0].classList.add('active');

    console.groupEnd();
}

// region > INITIALIZERS -----------------------------------------------------------------------------------------------

function initHeaderEvents() {

    logo.addEventListener('pointerenter', () => {
        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
        toggleHeader(true);
    });

    if (DEBUG_MODE > DEBUG_LEVEL.NONE) {
        logo.addEventListener('click', () => {
            toggleHeader();
        });
    }

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

    log('Initialized.', 'initHeaderEvents');
}

function initControlButtonEvents() {
    resetButton.addEventListener('click', async () => {
        await reset();
    });

    randomizeColorsButton.addEventListener('click', randomizeColors);

    demoButton.addEventListener('click', toggleDemo);

    screenshotButton.addEventListener('click', captureScreenshot);

    log('Initialized.', 'initControlButtonEvents');
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
        btn.title = (preset.title || ('Preset ' + index)) + (index < 10 ? ` (Num ${index})` : ` (${index})`); // TODO keep the ID in the title
        btn.textContent = (preset.title || index).toString();
        btn.addEventListener('click', async () => {
            await travelToPreset(presets, index);
        });

        presetBlock.appendChild(btn);
        presetButtons.push(btn);
        presetButtons[0].classList.add('active');
    });

    log('Initialized.', 'initPresetButtonEvents');
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

    log('Initialized.', 'initCommonButtonEvents');
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
            btn.title = (dive.title || ('Preset ' + index)) + ` (Shift+${index})`;
            btn.textContent = dive.title || (index).toString();
            btn.addEventListener('click', async () => {
                await startJuliaDive(dives, index);
            });

            diveBlock.appendChild(btn);
            diveButtons.push(btn);
        });

        diveBlock.style.display = 'inline-flex';
    }

    log('Initialized.', 'initDiveButtons');
}

function initFractalSwitchButtons() {
    mandelbrotSwitch.addEventListener('click', async (e) => {
        if (e.ctrlKey) {
            console.log('mandelbrotSwitch clicked (with persistence).');
            await switchFractalModeWithPersistence(FRACTAL_TYPE.MANDELBROT);
        } else {
            console.log('mandelbrotSwitch clicked.');
            await switchFractalMode(FRACTAL_TYPE.MANDELBROT);
        }
    });

    juliaSwitch.addEventListener('click', async (e) => {
        if (e.ctrlKey) {
            await switchFractalModeWithPersistence(FRACTAL_TYPE.JULIA);
        } else {
            await switchFractalMode(FRACTAL_TYPE.JULIA);
        }
    });

    log('Initialized.', 'initFractalSwitchButtons');
}

function initWindowEvents() {
    // Resize canvas on window resize
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            fractalApp.resizeCanvas(); // Adjust canvas dimensions
        }, 200); // Adjust delay as needed
    });

    // Initialize draggable elements (debug info)
    const dragElements = document.querySelectorAll(".draggable");

    const move = (event, element) => {
        let leftValue = parseInt(window.getComputedStyle(element).left);
        let topValue = parseInt(window.getComputedStyle(element).top);
        element.style.left = `${leftValue + event.movementX}px`;
        element.style.top = `${topValue + event.movementY}px`;
    }

    dragElements.forEach((element) => {
        element.addEventListener("mousedown", () => {
            const onMove = (event) => move(event, element);

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", () => {
                document.removeEventListener("mousemove", onMove);
            }, {once: true});
        });
    });

    log('Initialized.', 'initWindowEvents');
}

/**
 * Parses a string of the form:
 *   p = [<panX>, <panY>i] c = [<cX>, <cY>i] zoom = <zoom> r = <rotation>
 * and returns an object with the parsed numbers.
 * If a part is invalid or missing, an error message is returned.
 *
 * @param {string} input The input string.
 * @returns {PRESET|Object}
 */
export function parseUserInput(input) {

    // https://regex101.com/
    const panRegex = /\s*p\s*=\s*[\[\(]?\s*(-?[\d.]+)\s*[,|\s+]\s*(-?[\d.]+)\s*i?\s*[\]\)]?/i;
    const cRegex = /\s*c\s*=\s*[\[\(]?\s*(-?[\d.]+)\s*[,|\s+]\s*(-?[\d.]+)\s*i?\s*[\]\)]?/i;
    const zoomRegex = /\s*zoom\s*=\s*([\d.]+)/i;
    const rotationRegex = /\s*r\s*=\s*([\d.]+)/i;

    let errors = [];

    // Validate and extract pan.
    const panMatch = input.match(panRegex);
    if (!panMatch) {
        errors.push(`Pan coordinates (p) are missing or invalid.`);
    }
    // Validate and extract Julia c in Julia mode
    const cMatch = input.match(cRegex);
    if (!cMatch && isJuliaMode()) {
        errors.push(`Julia constant (c) is missing or invalid.`);
    }
    // Validate and extract zoom.
    const zoomMatch = input.match(zoomRegex);
    if (!zoomMatch) {
        errors.push(`Zoom (zoom) value is missing or invalid.`);
    }
    // Validate and extract rotation.
    const rotationMatch = input.match(rotationRegex);
    if (!rotationMatch) {
        errors.push(`Rotation (r) value is missing or invalid.`);
    }

    // If any errors, return error object.
    if (errors.length > 0) {
        return {error: errors.join(" ")};
    }

    // Otherwise, parse values.
    const panX = parseFloat(panMatch[1]);
    const panY = parseFloat(panMatch[2]);
    const z = parseFloat(zoomMatch[1]);
    const r = normalizeRotation(parseFloat(rotationMatch[1]) * Math.PI / 180);

    // Optionally check for isNaN here too.
    // if ([panX, panY, cX, cY, z, r].some(v => isNaN(v))) {
    //     return { error: "One or more numeric values could not be parsed." };
    // }

    if (isJuliaMode()) {
        const cX = parseFloat(cMatch[1]);
        const cY = parseFloat(cMatch[2]);

        return {pan: [panX, panY], c: [cX, cY], zoom: z, rotation: r};
    } else {
        return {pan: [panX, panY], zoom: z, rotation: r};
    }

}

function initInfoText() {
    if (!FF_USER_INPUT_ALLOWED) {

        infoText.addEventListener('mouseenter', () => {
            infoText.innerHTML = 'Click to copy fractal state to clipboard.';
        });

        infoText.addEventListener('mouseleave', () => {
            updateInfo();
        });

        infoText.addEventListener('click', () => {
            let text = `{pan: [${fractalApp.pan}], rotation: ${fractalApp.rotation}, zoom: ${fractalApp.zoom}`
                + (isJuliaMode() ? `, c: [${fractalApp.c}]}` : `}`);

            navigator.clipboard.writeText(text).then(function () {
                infoText.innerHTML = 'Copied to clipboard!';
            }, function (err) {
                console.error('Not copied to clipboard! ' + err.toString());
            });
        });
    } else {
        infoText.setAttribute("contenteditable", true);
        infoText.style.cursor = 'auto';
        infoText.removeAttribute("readonly");

        infoText.addEventListener('focus', () => {
            infoLabel.style.zoom = '200%';
        })

        infoText.addEventListener('blur', () => {
            infoLabel.style.zoom = '120%';
        })

        infoText.addEventListener("keydown", function (e) {
            e.stopPropagation();

            if (e.key === "Enter") {
                e.preventDefault(); // Prevent a newline

                //const regex = /\s*p\s*=\s*\[(-?[\d.]+)\s*[,|\s+]\s*(-?[\d.]+)\s*i?\s*\]\s*·?\s*r\s*=\s*(-?[\d.]+)\s*°?\s*·?\s*zoom\s*=\s*(-?[\d.]+)/;
                /* for C capture the same as for P
                    Allowed complex notations:
                    p = [ -0.500000000000, 0.000000000000i] · r = 0° · zoom = 3.000000
                    p = [-0.500000000000 + 2i] · r = 0° · zoom = 3.000000
                    p = [ 0.500000000000, 0.000000000000] · r = 0° · zoom = 3.000000
                    p = [0.500000000000 + 0.000000000000] · r = 0° · zoom = 3.000000
                    p = (0.500000000000 + 0.000000000001) · r = 0° · zoom = 3.000000
                    p = (0.500000000000 - 0.000000000001) · r = 0° · zoom = 3.000000
                    p = (0.500000000000 - 0.000000000001i) · r = 0 · zoom = -3.000000 (No match)
                 */

                const result = parseUserInput(infoText.innerHTML);
                if (result.error) {
                    infoLabel.style.color = '#f00';
                    alert(result.error);
                } else {
                    infoLabel.style.color = '#fff';
                    fractalApp.animateTravelToPreset(result);
                }
            }
        });
    }
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
    logo = document.getElementById('logo');
    infoLabel = document.getElementById('infoLabel');
    infoText = document.getElementById('infoText');
    resetButton = document.getElementById('reset');
    randomizeColorsButton = document.getElementById('randomize');
    screenshotButton = document.getElementById('screenshot');
    demoButton = document.getElementById('demo');

    if (fractalRenderer instanceof JuliaRenderer) {
        fractalMode = FRACTAL_TYPE.JULIA;
        juliaSwitch.classList.add('active');
        mandelbrotSwitch.classList.remove('active');

        initJuliaSliders(fractalApp);
        updateJuliaSliders();
        initDiveButtons();

        updateColorTheme(DEFAULT_JULIA_THEME_COLOR);
        // Darker backgrounds for Julia as it renders on white
        header.style.background = 'rgba(20, 20, 20, 0.8)';
        infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';

        window.location.hash = '#julia'; // Update URL hash
    }
    initPresetButtonEvents();
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

    updateRecolorButtonTitle();

    if (DEBUG_MODE === DEBUG_LEVEL.FULL && !isMobileDevice()) {
        toggleDebugMode();
    }

    uiInitialized = true;
}

// endregion------------------------------------------------------------------------------------------------------------