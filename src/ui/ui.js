import {
    clearURLParams,
    ddValue,
    destroyArrayOfButtons,
    esc,
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
    CONTROLS_TOOLTIP,
    DEBUG_LEVEL,
    DEBUG_MODE,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_BG_COLOR,
    DEFAULT_JULIA_THEME_COLOR,
    DEFAULT_MANDELBROT_THEME_COLOR,
    FF_PERSISTENT_FRACTAL_SWITCHING_BUTTON_DISPLAYED,
    FF_USER_INPUT_ALLOWED,
    FRACTAL_TYPE,
    log,
    PI,
    VERSION
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
import {destroyJuliaPreview, initJuliaPreview, recolorJuliaPreview, resetJuliaPreview} from "./juliaPreview";

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
let persistSwitch;
let resetButton;
let screenshotButton;
let demoButton;
let presetsToggle;
let presetsMenu;
let divesToggle;
let divesMenu;
let divesDropdown;
let paletteToggle;
let paletteMenu;
let paletteDropdown;
let presetButtons = [];
let diveButtons = [];
let paletteButtons = [];
let allButtons = [];
let infoLabel;
let infoText;
export let debugPanel;

let lastInfoUpdate = 0; // Tracks the last time the sliders were updated
const infoUpdateThrottleLimit = 100; // Throttle limit in milliseconds

let pendingInfoTimer = null;


export const getFractalMode = () => getFractalName(fractalMode);

/**
 * Switches among fractal modes
 * @param {FRACTAL_TYPE} mode
 * @param {PRESET|MANDELBROT_PRESET|JULIA_PRESET} [preset] If present, it's set as the default state through travelToPreset
 */
export async function switchFractalMode(mode, preset = null) {
    console.groupCollapsed(`%c switchFractalMode`, CONSOLE_GROUP_STYLE);

    if (mode === fractalMode) {
        console.warn(`Switching to the same mode? Why?`);
        console.groupEnd();
        if (DEBUG_MODE === DEBUG_LEVEL.NONE) return;
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
                pan: [0, 0], c: preset.c, zoom: preset.zoom, rotation: 0
            }, 1000);
        } else {
            await fractalApp.animateTravelToPreset({
                pan: preset.pan, zoom: preset.zoom, rotation: 0
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
 * @param {FRACTAL_TYPE} targetType
 * @return {Promise<void>}
 */
export async function switchFractalTypeWithPersistence(targetType) {
    console.groupCollapsed(`%c switchFractalTypeWithPersistence`, CONSOLE_GROUP_STYLE);

    if (targetType === fractalMode) {
        console.warn(`Switching to the same fractal? Why?`);
        console.groupEnd();
        return;
    }

    if (targetType === FRACTAL_TYPE.MANDELBROT) {
        // Calculate appropriate Mandelbrot zoom to show local structure at c
        // When Julia is at default zoom (~3.5), Mandelbrot zoom ~0.02 shows nice detail
        // Scale proportionally as Julia zooms in/out
        const juliaDefaultZoom = 3.5;
        const mandelbrotBaseZoom = 0.02;
        const scaleFactor = mandelbrotBaseZoom / juliaDefaultZoom; // ~0.006

        // Calculate target zoom with reasonable bounds
        const calculatedZoom = fractalApp.zoom * scaleFactor;
        const targetZoom = Math.max(fractalApp.MAX_ZOOM, Math.min(0.5, calculatedZoom));

        await switchFractalMode(FRACTAL_TYPE.MANDELBROT, {
            pan: fractalApp.c.slice(), zoom: targetZoom, rotation: 0
        });
    } else {
        // Mandelbrot → Julia: use Mandelbrot pan as Julia c
        // Scale zoom so that local Mandelbrot detail maps to Julia view
        const mandelbrotDefaultZoom = 3.0;
        const juliaBaseZoom = 1.5;
        const scaleFactor = juliaBaseZoom / 0.02; // Inverse of above relationship

        // Calculate target zoom - when deeply zoomed on Mandelbrot, show more detail on Julia
        const calculatedZoom = Math.min(juliaBaseZoom, fractalApp.zoom * scaleFactor);
        const targetZoom = Math.max(0.01, Math.min(3.5, calculatedZoom));

        await switchFractalMode(FRACTAL_TYPE.JULIA, {
            pan: [0, 0], c: fractalApp.pan.slice(), zoom: targetZoom, rotation: 0
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
    divesDropdown.style.display = 'none';

    destroyJuliaSliders();
    destroyJuliaPreview();

    fractalApp.destroy();
    fractalApp = new MandelbrotRenderer(canvas);
    fractalMode = FRACTAL_TYPE.MANDELBROT;

    // Remove each button from the DOM and reinitialize
    destroyArrayOfButtons(presetButtons);
    if (activePresetIndex !== 0) resetActivePresetIndex();
    initPresetButtonEvents();

    // Update palette dropdown for new renderer
    initPaletteButtonEvents();

    updateColorTheme(DEFAULT_MANDELBROT_THEME_COLOR);

    updatePaletteDropdownState();

    window.location.hash = ''; // Update URL hash
}

export function enableJuliaMode() {
    fractalApp.destroy();
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

    // Update palette dropdown for new renderer
    initPaletteButtonEvents();

    if (activePresetIndex !== 0) resetActivePresetIndex();

    updateColorTheme(DEFAULT_JULIA_THEME_COLOR);
    // Darker backgrounds for Julia as it renders on white
    header.style.background = 'rgba(20, 20, 20, 0.8)';
    infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';

    updatePaletteDropdownState();

    window.location.hash = '#julia'; // Update URL hash
}

export function enableRiemannMode() {
    fractalApp = new RiemannRenderer(canvas);
    fractalApp.useAnalyticExtension = false;
    fractalMode = FRACTAL_TYPE.RIEMANN;

    destroyArrayOfButtons(presetButtons);

    window.location.hash = '#zeta'; // Update URL hash
}

export function updatePaletteDropdownState() {
    if (!paletteToggle) return;

    // Update button text to show current palette
    const palettes = fractalApp.PALETTES || [];
    const currentIndex = fractalApp.currentPaletteIndex;

    if (palettes.length > 0 && currentIndex >= 0) {
        const currentPalette = palettes[currentIndex];
        paletteToggle.title = `Current: "${currentPalette.id}" (T to cycle)`;
    } else {
        paletteToggle.title = 'Change Color Palette (T)';
    }

    // Update active state on palette buttons
    // paletteButtons: [0] = Random, [1] = Color Cycle, [2+] = palette indices
    paletteButtons.forEach((btn, btnIndex) => {
        if (btnIndex <= 1) {
            // Random and Color Cycle buttons - never show active state here
            // (Color Cycle is handled separately during animation)
        } else {
            // Palette buttons - btnIndex-2 maps to palette index
            const paletteIndex = btnIndex - 2;
            btn.classList.toggle('active', currentIndex === paletteIndex);
        }
    });
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

    recolorJuliaPreview(palette);
}

/** Resets buttons, active presets and URL */
export function resetAppState() {
    resetPresetAndDiveButtonStates();
    resetActivePresetIndex();
    clearURLParams();
}

/**
 * Updates the bottom info bar.
 * Throttled to avoid layout thrashing during animations (max ~10 updates/sec).
 * @param {boolean} force - If true, ensures an update is scheduled even if throttled (won't be dropped)
 */
export function updateInfo(force = false) {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastInfoUpdate;

    // Always apply throttle - even force=true respects timing to prevent layout thrash
    if (timeSinceLastUpdate < infoUpdateThrottleLimit) {
        // If force=true, ensure we schedule a deferred update (don't drop it)
        if (force && !pendingInfoTimer) {
            const delay = Math.max(infoUpdateThrottleLimit - timeSinceLastUpdate, 0);

            pendingInfoTimer = setTimeout(() => {
                pendingInfoTimer = null;
                updateInfo(true);
            }, delay);
        }
        return;
    }

    lastInfoUpdate = now;

    if (!canvas || !fractalApp) {
        return;
    }

    let text = (animationActive ? ` <span class="middot">🎬</span> ` : ``);

    const panX = ddValue(fractalApp.panDD.x) ?? 0;
    const panY = ddValue(fractalApp.panDD.y) ?? 0;

    text += `p:&nbsp;[${panX.toFixed(8)}, ${panY.toFixed(8)}i] <span class="middot">&middot;</span> `;

    const currentZoom = fractalApp.zoom ?? 0;
    const currentRotation = (fractalApp.rotation * 180 / PI) % 360;
    const normalizedRotation = currentRotation < 0 ? currentRotation + 360 : currentRotation;
    text += `r:&nbsp;${normalizedRotation.toFixed(0)}° <span class="middot">&middot;</span> zoom:&nbsp;${currentZoom.toExponential(0)}`;

    if (fractalMode === FRACTAL_TYPE.JULIA) {
        const cx = fractalApp.c[0] ?? 0;
        const cy = fractalApp.c[1] ?? 0;

        text += `<br/>c:&nbsp;[${cx.toFixed(4)}, ${cy.toFixed(4)}i]`;
    }

    if (animationActive) {
        if (infoText && !infoText.classList.contains('animationActive')) infoText.classList.add('animationActive');
    } else {
        if (infoText?.classList.contains('animationActive')) infoText.classList.remove('animationActive');
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
    infoText?.classList.remove('animation');

    fractalApp?.stopAllNonColorAnimations();

    if (demoButton) {
        demoButton.innerText = DEMO_BUTTON_DEFAULT_TEXT;
        demoButton.classList.remove('active');
    }

    if (presetsToggle) presetsToggle.disabled = false;
    if (divesToggle) divesToggle.disabled = false;

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
    infoText?.classList.add('animation');

    // resetPresetAndDiveButtons();
    if (demoButton) {
        demoButton.innerText = DEMO_BUTTON_STOP_TEXT;
        demoButton.classList.add('active');
    }

    closePresetsDropdown();
    if (presetsToggle) presetsToggle.disabled = true;
    closeDivesDropdown();
    if (divesToggle) divesToggle.disabled = true;

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
    diveButtons[index]?.classList.add('active');

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

    presetButtons[index]?.classList.add('active');

    if (isJuliaMode()) {
        fractalApp.demoTime = 0;
        await fractalApp.animateTravelToPreset(presets[index], 1500, updateColorTheme);
    } else {
        // Cinematic animation with zoom-out, pan, zoom-in with rotation
        await fractalApp.animateTravelToPreset(presets[index], 2000, 500, 1500, updateColorTheme);
    }
    activePresetIndex = index;

    // Update palette button state if preset changed the palette
    updatePaletteDropdownState();

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
    presetButtons.concat(diveButtons).forEach(b => b?.classList.remove('active'));
}

/**
 * This needs to happen on any fractal change
 */
export function resetActivePresetIndex() {
    activePresetIndex = -1;
}

export async function randomizeColors() {
    // Stop color cycling and remove active state from cycle button
    const cycleBtn = document.getElementById('palette-cycle');
    if (cycleBtn) cycleBtn.classList.remove('active');

    if (isJuliaMode()) {
        await fractalApp.animateColorPaletteTransition(250, updateColorTheme);
        updatePaletteDropdownState();
    } else {
        // Generate a bright random color palette
        // Generate colors with better separation and higher brightness
        const hue = Math.random(); // Hue determines the "base color" (red, green, blue, etc.)
        const saturation = Math.random() * 0.5 + 0.5; // Ensure higher saturation (more vivid colors)
        const brightness = Math.random() * 0.5 + 0.5; // Ensure higher brightness

        // Convert HSB/HSV to RGB
        const newPalette = hsbToRgb(hue, saturation, brightness);

        fractalApp.currentPaletteIndex = -1; // Mark as random
        await fractalApp.animateColorPaletteTransition(newPalette, 250, () => {
            updateColorTheme(newPalette);
        }); // Update app colors

        recolorJuliaPreview(newPalette);
        updatePaletteDropdownState();
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
    } else {
        resetJuliaPreview();
    }
    resetAppState();
    updatePaletteDropdownState();
    presetButtons[0].classList.add('active');

    console.groupEnd();
}

// region > INITIALIZERS -----------------------------------------------------------------------------------------------

function initHeaderEvents() {

    let lastPointerType = 'mouse';

    logo.addEventListener('pointerdown', (e) => {
        lastPointerType = e.pointerType;
    });

    logo.addEventListener('pointerenter', (e) => {
        // Skip hover behavior for touch - handled by click
        if (e.pointerType === 'touch') return;

        if (headerMinimizeTimeout) {
            clearTimeout(headerMinimizeTimeout);
            headerMinimizeTimeout = null;
        }
        toggleHeader(true);
    });

    // Toggle on tap/click for touch devices (and debug mode)
    logo.addEventListener('click', () => {
        if (lastPointerType === 'touch' || DEBUG_MODE > DEBUG_LEVEL.NONE) {
            toggleHeader();
        }
    });

    header.addEventListener('pointerleave', (e) => {
        // Skip auto-hide for touch - handled by tapping outside
        if (e.pointerType === 'touch') return;

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

    demoButton.addEventListener('click', toggleDemo);

    screenshotButton.addEventListener('click', captureScreenshot);

    log('Initialized.', 'initControlButtonEvents');
}

function initPresetButtonEvents() {
    const presetBlock = document.getElementById('presets');
    presetButtons = [];

    const presets = [...fractalApp.PRESETS];
    presets.forEach((preset, index) => {
        const btn = document.createElement('button');
        btn.id = 'preset' + (index);
        btn.className = 'preset';
        btn.title = (preset.title || ('Preset ' + index)) + (index < 10 ? ` (Num ${index})` : ` (${index})`);
        btn.textContent = (preset.title || index).toString();
        btn.addEventListener('click', async () => {
            closePresetsDropdown();
            await travelToPreset(presets, index);
        });

        presetBlock.appendChild(btn);
        presetButtons.push(btn);
        presetButtons[0].classList.add('active');
    });

    log('Initialized.', 'initPresetButtonEvents');
}

/** Toggles the presets dropdown menu */
function togglePresetsDropdown() {
    presetsMenu.classList.toggle('show');
    const isOpen = presetsMenu.classList.contains('show');
    presetsToggle.textContent = isOpen ? 'View ▴' : 'View ▾';
}

/** Closes the presets dropdown menu */
function closePresetsDropdown() {
    presetsMenu?.classList.remove('show');
    if (presetsToggle) presetsToggle.textContent = 'View ▾';
}

function initPresetsDropdown() {
    presetsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDivesDropdown();
        closePaletteDropdown();
        togglePresetsDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!presetsMenu.contains(e.target) && e.target !== presetsToggle) {
            closePresetsDropdown();
        }
    });

    log('Initialized.', 'initPresetsDropdown');
}

/** Toggles the dives dropdown menu */
function toggleDivesDropdown() {
    divesMenu.classList.toggle('show');
    const isOpen = divesMenu.classList.contains('show');
    divesToggle.textContent = isOpen ? 'Dive ▴' : 'Dive ▾';
}

/** Closes the dives dropdown menu */
function closeDivesDropdown() {
    divesMenu?.classList.remove('show');
    if (divesToggle) divesToggle.textContent = 'Dive ▾';
}

function initDivesDropdown() {
    divesToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        closePresetsDropdown();
        closePaletteDropdown();
        toggleDivesDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!divesMenu.contains(e.target) && e.target !== divesToggle) {
            closeDivesDropdown();
        }
    });

    log('Initialized.', 'initDivesDropdown');
}

/** Toggles the palette dropdown menu */
function togglePaletteDropdown() {
    paletteMenu.classList.toggle('show');
    const isOpen = paletteMenu.classList.contains('show');
    paletteToggle.textContent = isOpen ? 'Palette ▴' : 'Palette ▾';
}

/** Closes the palette dropdown menu */
function closePaletteDropdown() {
    paletteMenu.classList.remove('show');
    paletteToggle.textContent = 'Palette ▾';
}

function initPaletteButtonEvents() {
    paletteButtons = [];
    paletteMenu.innerHTML = ''; // Clear existing

    const palettes = fractalApp.PALETTES || [];

    // Always add "Random" option first
    const randomBtn = document.createElement('button');
    randomBtn.id = 'palette-random';
    randomBtn.className = 'palette';
    randomBtn.title = 'Random color palette';
    randomBtn.innerHTML = '<span class="color-swatch" style="background: linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3);"></span>Random';
    randomBtn.addEventListener('click', async () => {
        closePaletteDropdown();
        await randomizeColors();
    });
    paletteMenu.appendChild(randomBtn);
    paletteButtons.push(randomBtn);

    // Add "Color Cycle" option (Shift+T functionality)
    const cycleBtn = document.createElement('button');
    cycleBtn.id = 'palette-cycle';
    cycleBtn.className = 'palette';
    cycleBtn.title = 'Smooth color cycling animation (Shift+T)';
    cycleBtn.innerHTML = '<span class="color-swatch color-cycle-swatch"></span>Color Cycle';
    cycleBtn.addEventListener('click', async () => {
        if (fractalApp.currentColorAnimationFrame) {
            // Stop if already running
            fractalApp.stopCurrentColorAnimations();
            cycleBtn.classList.remove('active');
        } else {
            // Start color cycle
            fractalApp.currentPaletteIndex = -1;
            updatePaletteDropdownState(); // Deactivate palette buttons
            cycleBtn.classList.add('active');
            closePaletteDropdown();
            await fractalApp.animateFullColorSpaceCycle(isJuliaMode() ? 10000 : 15000, updateColorTheme);
            cycleBtn.classList.remove('active');
        }
    });
    paletteMenu.appendChild(cycleBtn);
    paletteButtons.push(cycleBtn);

    // Add palette options if available
    palettes.forEach((palette, index) => {
        const btn = document.createElement('button');
        btn.id = 'palette-' + index;
        btn.className = 'palette';
        btn.title = palette.id;

        // Create two-color swatch to better represent palette
        const primaryColor = palette.keyColor || '#888';
        let secondaryColor = primaryColor;

        if (palette.theme) {
            if (palette.theme.length === 15) {
                // Julia: extract color from stop 3 (index 9-11)
                const r = Math.min(255, Math.round(palette.theme[9] * 255));
                const g = Math.min(255, Math.round(palette.theme[10] * 255));
                const b = Math.min(255, Math.round(palette.theme[11] * 255));
                secondaryColor = `rgb(${r}, ${g}, ${b})`;
            } else if (palette.theme.length === 3) {
                // Mandelbrot: derive color from theme multipliers applied to keyColor
                const hex = primaryColor.replace('#', '');
                const kr = parseInt(hex.substring(0, 2), 16);
                const kg = parseInt(hex.substring(2, 4), 16);
                const kb = parseInt(hex.substring(4, 6), 16);
                const r = Math.min(255, Math.round(kr * palette.theme[0] * 0.7));
                const g = Math.min(255, Math.round(kg * palette.theme[1] * 0.7));
                const b = Math.min(255, Math.round(kb * palette.theme[2] * 0.7));
                secondaryColor = `rgb(${r}, ${g}, ${b})`;
            }
        }

        btn.innerHTML = `<span class="color-swatch" style="background: linear-gradient(135deg, ${primaryColor} 50%, ${secondaryColor} 50%);"></span>${palette.id}`;

        btn.addEventListener('click', async () => {
            closePaletteDropdown();
            // Stop color cycling and remove active state from cycle button
            const cycleBtn = document.getElementById('palette-cycle');
            if (cycleBtn) cycleBtn.classList.remove('active');
            await fractalApp.applyPaletteByIndex(index, 250, updateColorTheme);
            updatePaletteDropdownState();
        });

        paletteMenu.appendChild(btn);
        paletteButtons.push(btn);
    });

    // Set initial active state
    updatePaletteDropdownState();

    log('Initialized.', 'initPaletteButtonEvents');
}

function initPaletteDropdown() {
    paletteToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        closePresetsDropdown();
        closeDivesDropdown();
        togglePaletteDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!paletteMenu.contains(e.target) && e.target !== paletteToggle) {
            closePaletteDropdown();
        }
    });

    log('Initialized.', 'initPaletteDropdown');
}

/**
 * Inits behavior common for all buttons
 */
function initCommonButtonEvents() {
    allButtons = diveButtons.concat(presetButtons).concat(paletteButtons);
    allButtons.push(resetButton, screenshotButton, demoButton);

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
        diveButtons = [];

        const dives = [...fractalApp.DIVES];
        dives.forEach((dive, index) => {
            const btn = document.createElement('button');
            btn.id = 'dive' + (index);
            btn.className = 'dive';
            btn.title = (dive.title || ('Preset ' + index)) + ` (Shift+${index})`;
            btn.textContent = dive.title || (index).toString();
            btn.addEventListener('click', async () => {
                closeDivesDropdown();
                await startJuliaDive(dives, index);
            });

            diveBlock.appendChild(btn);
            diveButtons.push(btn);
        });

        divesDropdown.style.display = 'inline-block';
    }

    log('Initialized.', 'initDiveButtons');
}

function initFractalSwitchButtons() {
    mandelbrotSwitch.addEventListener('click', async (e) => {
        if (e.ctrlKey) {
            console.log('mandelbrotSwitch clicked (with persistence).');
            await switchFractalTypeWithPersistence(FRACTAL_TYPE.MANDELBROT);
        } else {
            console.log('mandelbrotSwitch clicked.');
            await switchFractalMode(FRACTAL_TYPE.MANDELBROT);
        }
    });

    juliaSwitch.addEventListener('click', async (e) => {
        if (e.ctrlKey) {
            console.log('juliaSwitch clicked (with persistence).');
            await switchFractalTypeWithPersistence(FRACTAL_TYPE.JULIA);
        } else {
            await switchFractalMode(FRACTAL_TYPE.JULIA);
        }
    });

    if (FF_PERSISTENT_FRACTAL_SWITCHING_BUTTON_DISPLAYED) {
        persistSwitch.addEventListener('click', async () => {
            console.log('persistSwitch clicked.');
            if (isJuliaMode()) {
                await switchFractalTypeWithPersistence(FRACTAL_TYPE.MANDELBROT)
            } else {
                await switchFractalTypeWithPersistence(FRACTAL_TYPE.JULIA);
            }
        });

        persistSwitch.style.display = 'inline-flex';
    }

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
            if (animationActive) return; // Disable during animations
            infoText.innerHTML = 'Click to copy fractal state to clipboard.';
        });

        infoText.addEventListener('mouseleave', () => {
            if (animationActive) return; // Disable during animations
            updateInfo();
        });

        infoText.addEventListener('click', () => {
            if (animationActive) return; // Disable during animations

            const viewPanX = ddValue(fractalApp.panDD.x);
            const viewPanY = ddValue(fractalApp.panDD.y);

            let text = `"pan": [${esc(viewPanX.toFixed(24))}, ${esc(viewPanY.toFixed(24))}], ` +
                `"rotation": ${normalizeRotation(fractalApp.rotation)}, "zoom": ${fractalApp.zoom}`+ (isJuliaMode() ? `, "c": [${fractalApp.c}]}` : `}`);

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

function bindHTMLElements() {
    // Element binding
    mandelbrotSwitch = document.getElementById('mandelbrotSwitch');
    juliaSwitch = document.getElementById('juliaSwitch');
    persistSwitch = document.getElementById('persistSwitch');
    header = document.getElementById('headerContainer');
    logo = document.getElementById('logo');
    infoLabel = document.getElementById('infoLabel');
    infoText = document.getElementById('infoText');
    resetButton = document.getElementById('reset');
    screenshotButton = document.getElementById('screenshot');
    demoButton = document.getElementById('demo');
    presetsToggle = document.getElementById('presets-toggle');
    presetsMenu = document.getElementById('presets');
    divesToggle = document.getElementById('dives-toggle');
    divesMenu = document.getElementById('dives');
    divesDropdown = document.getElementById('dives-dropdown');
    paletteToggle = document.getElementById('palette-toggle');
    paletteMenu = document.getElementById('palettes');
    paletteDropdown = document.getElementById('palette-dropdown');
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

    bindHTMLElements();

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
    } else {
        initJuliaPreview();
    }

    initPresetButtonEvents();
    initPresetsDropdown();
    initDivesDropdown();
    initPaletteButtonEvents();
    initPaletteDropdown();
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

    updatePaletteDropdownState();

    if (DEBUG_MODE === DEBUG_LEVEL.FULL && !isMobileDevice()) {
        toggleDebugMode();
    }

    document.getElementById("controlsLink").title = CONTROLS_TOOLTIP;
    document.getElementById("versionLink").innerHTML = `v${VERSION}`;

    uiInitialized = true;
}

// endregion------------------------------------------------------------------------------------------------------------