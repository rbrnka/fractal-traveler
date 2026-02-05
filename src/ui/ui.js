import {
    clearURLParams,
    ddValue,
    destroyArrayOfButtons,
    esc,
    getAnimationDuration,
    getFractalName,
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
    APP,
    CONSOLE_GROUP_STYLE,
    CONSOLE_MESSAGE_STYLE,
    DEBUG_LEVEL,
    DEBUG_MODE,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_BG_COLOR,
    DEFAULT_JULIA_THEME_COLOR,
    DEFAULT_MANDELBROT_THEME_COLOR,
    FF_PERSISTENT_FRACTAL_SWITCHING_BUTTON_DISPLAYED,
    FRACTAL_TYPE,
    log,
    PI
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
import {calculateMandelbrotZoomFromJulia} from "../global/utils.fractal";

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

// LocalStorage keys for user presets
const USER_PRESETS_KEY_MANDELBROT = 'u_mandelbrot_presets';
const USER_PRESETS_KEY_JULIA = 'u_julia_presets';

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
let saveViewButton;
let screenshotButton;
let demoButton;
// Dialog elements
let saveViewDialog;
let saveViewNameInput;
let saveViewConfirmBtn;
let saveViewCancelBtn;
let editCoordsDialog;
let editPanXInput;
let editPanYInput;
let editZoomInput;
let editRotationInput;
let editCxInput;
let editCyInput;
let editJsonInput;
let editCoordsError;
let editCoordsApplyBtn;
let editCoordsCancelBtn;
let juliaCInputs;
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
            }, 500);
        } else {
            await fractalApp.animateTravelToPreset({
                pan: preset.pan, zoom: preset.zoom, rotation: 0
            }, 500, 500, 500);
        }

        exitAnimationMode();
        updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null, getCurrentPaletteId());
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
        // Julia → Mandelbrot: Use c value as pan position
        // Calculate appropriate zoom based on point analysis and current Julia zoom
        const [cx, cy] = fractalApp.c;
        const juliaDefaultZoom = 3.5;
        const finalZoom = calculateMandelbrotZoomFromJulia(cx, cy, fractalApp.zoom, juliaDefaultZoom);

        console.log('Julia → Mandelbrot: c=', [cx, cy], 'juliaZoom:', fractalApp.zoom, 'finalZoom:', finalZoom);

        await switchFractalMode(FRACTAL_TYPE.MANDELBROT, {
            pan: fractalApp.c.slice(),
            zoom: finalZoom,
            rotation: 0
        });
    } else {
        // Mandelbrot → Julia: Use Mandelbrot pan as Julia c parameter
        // Always show the full Julia set at default zoom since Julia structures vary
        // wildly depending on c - user should see the whole set first
        const juliaDefaultZoom = 3.5;

        await switchFractalMode(FRACTAL_TYPE.JULIA, {
            pan: [0, 0], c: fractalApp.pan.slice(), zoom: juliaDefaultZoom, rotation: 0
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

    const palettes = fractalApp.PALETTES || [];
    const currentIndex = fractalApp.currentPaletteIndex;
    const isCycling = fractalApp.paletteCyclingActive;

    // Update tooltip
    if (palettes.length > 0 && currentIndex >= 0) {
        const currentPalette = palettes[currentIndex];
        paletteToggle.title = `Current: "${currentPalette.id}" (T to cycle)`;
    } else {
        paletteToggle.title = 'Change Color Palette (T)';
    }

    // paletteButtons: [0] = Random, [1] = Palette Cycle, [2+] = palette indices
    paletteButtons.forEach((btn, btnIndex) => {
        if (btnIndex === 1) {
            // Sync cycle button active state with actual cycling state
            btn.classList.toggle('active', isCycling);
        } else if (btnIndex >= 2) {
            // Palette buttons - highlight current palette
            const paletteIndex = btnIndex - 2;
            btn.classList.toggle('active', currentIndex === paletteIndex);
        }
    });
}

/**
 * Returns the current palette ID from the fractal renderer
 * @returns {string|null}
 */
export function getCurrentPaletteId() {
    const palettes = fractalApp?.PALETTES || [];
    const currentIndex = fractalApp?.currentPaletteIndex;
    if (palettes.length > 0 && currentIndex >= 0 && currentIndex < palettes.length) {
        return palettes[currentIndex].id;
    }
    return null;
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

    // Show adaptive quality indicator when quality is reduced
    if (fractalApp.adaptiveQualityEnabled && fractalApp.extraIterations < 0) {
        const qualityPct = Math.round(100 + (fractalApp.extraIterations / Math.abs(fractalApp.adaptiveQualityMin)) * 100);
        text += ` <span class="middot">&middot;</span> <span class="aq-indicator">⚡${qualityPct}%</span>`;
    }

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

    if (infoText.innerHTML !== text) infoText.innerHTML = text;
}

/** @returns {boolean} */
export const isAnimationActive = () => animationActive;

/**
 * Updates the palette cycle button state to match the actual cycling state
 */
export function updatePaletteCycleButtonState() {
    const cycleBtn = document.getElementById('palette-cycle');
    if (!cycleBtn) return;

    const shouldBeActive = fractalApp?.paletteCyclingActive || false;
    const isActive = cycleBtn.classList.contains('active');

    if (shouldBeActive && !isActive) {
        cycleBtn.classList.add('active');
    } else if (!shouldBeActive && isActive) {
        cycleBtn.classList.remove('active');
    }
}

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
    // Note: Don't stop color animations here - palette cycling should be independent

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

    // Stop palette cycling if active before starting demo
    if (fractalApp.paletteCyclingActive) {
        fractalApp.stopCurrentColorAnimations();
        updatePaletteCycleButtonState();
    }

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

    await fractalApp.animateDemo(true, updateColorTheme, updatePaletteDropdownState, getUserPresets());

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

    // Stop palette cycling if dive has a defined palette
    if (dive.paletteId) {
        fractalApp.stopCurrentColorAnimations();
        updatePaletteCycleButtonState();
    }

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

    // Phase 1: Set initial state with optional palette transition
    // await fractalApp.animateTravelToPreset({
    //     pan: dive.pan, c: dive.startC.slice(), // copy initial c
    //     zoom: dive.zoom, rotation: dive.rotation
    // }, 1500, EASE_TYPE.QUINT);
    // Alternatively:
    await Promise.all([
        fractalApp.animateToZoomAndC(fractalApp.DEFAULT_ZOOM, dive.startC, 1500),
        fractalApp.animatePaletteByIdTransition(dive, 2500, updateColorTheme)
    ]);

    // Update palette button state if dive changed the palette
    updatePaletteDropdownState();

    // Phase 2: Enter dive mode (infinite animation - never resolves)
    await Promise.all([
        fractalApp.animateDive(dive),
        fractalApp.animatePanZoomRotationTo(dive.pan, dive.zoom, dive.rotation, 1500)
    ]);
}

/** Starts the Julia demo */
async function startJuliaDemo() {
    console.groupCollapsed(`%c startJuliaDemo`, CONSOLE_GROUP_STYLE);

    await fractalApp.animateDemo(false, updateColorTheme, updatePaletteDropdownState, getUserPresets());
    // await fractalApp.animateRandomDemo(); // sin/cos original demo

    console.log("Demo ended");
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

    // Sync button state after travel (in case preset had paletteId that stopped cycling)
    updatePaletteCycleButtonState();

    activePresetIndex = index;

    // Update palette button state if preset changed the palette
    updatePaletteDropdownState();

    exitAnimationMode();
    updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null, getCurrentPaletteId());
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
    const palettes = fractalApp.PALETTES || [];
    if (palettes.length === 0) return;

    // Pick a random palette index different from current if possible
    let randomIndex;
    if (palettes.length === 1) {
        randomIndex = 0;
    } else {
        do {
            randomIndex = Math.floor(Math.random() * palettes.length);
        } while (randomIndex === fractalApp.currentPaletteIndex);
    }

    await fractalApp.applyPaletteByIndex(randomIndex, 250, updateColorTheme);
    updatePaletteDropdownState();
    updatePaletteCycleButtonState();
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
    updatePaletteCycleButtonState();
    presetButtons[0]?.classList.add('active');

    console.groupEnd();
}

// region > USER PRESETS -----------------------------------------------------------------------------------------------

/**
 * Gets the localStorage key for user presets based on current fractal mode
 * @returns {string}
 */
function getUserPresetsKey() {
    return isJuliaMode() ? USER_PRESETS_KEY_JULIA : USER_PRESETS_KEY_MANDELBROT;
}

/**
 * Gets user presets from localStorage for current fractal mode
 * @returns {Array<PRESET>}
 */
export function getUserPresets() {
    try {
        const stored = localStorage.getItem(getUserPresetsKey());
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('Failed to load user presets:', e);
        return [];
    }
}

/**
 * Saves user presets to localStorage for current fractal mode
 * @param {Array<PRESET>} presets
 */
function saveUserPresets(presets) {
    try {
        localStorage.setItem(getUserPresetsKey(), JSON.stringify(presets));
    } catch (e) {
        console.error('Failed to save user presets:', e);
    }
}

/**
 * Saves the current view as a user preset
 * @param {string} name - The name for the preset
 */
function saveCurrentViewAsPreset(name) {
    const userPresets = getUserPresets();

    // Create the preset object with u_ prefix
    const preset = {
        // id: `u_${Date.now()}`,
        id: name,
        pan: [ddValue(fractalApp.panDD.x), ddValue(fractalApp.panDD.y)],
        zoom: fractalApp.zoom,
        rotation: fractalApp.rotation,
        speed: 10
    };

    // Add Julia-specific c parameter
    if (isJuliaMode() && fractalApp.c) {
        preset.c = [...fractalApp.c];
    }

    // Store the current palette ID
    if (fractalApp.PALETTES && fractalApp.currentPaletteIndex >= 0 &&
        fractalApp.currentPaletteIndex < fractalApp.PALETTES.length) {
        preset.paletteId = fractalApp.PALETTES[fractalApp.currentPaletteIndex].id;
    }

    userPresets.push(preset);
    saveUserPresets(userPresets);

    // Refresh the presets dropdown to include the new preset
    destroyArrayOfButtons(presetButtons);
    initPresetButtonEvents();

    log(`Saved user preset: ${name}`, 'saveCurrentViewAsPreset');
}

/**
 * Deletes a user preset by its id
 * @param {string} presetId
 */
function deleteUserPreset(presetId) {
    let userPresets = getUserPresets();
    userPresets = userPresets.filter(p => p.id !== presetId);
    saveUserPresets(userPresets);

    // Refresh the presets dropdown
    destroyArrayOfButtons(presetButtons);
    initPresetButtonEvents();

    log(`Deleted user preset: ${presetId}`, 'deleteUserPreset');
}

/**
 * Shows the save view dialog
 */
export function showSaveViewDialog() {
    if (!saveViewDialog) return;

    saveViewNameInput.value = '';
    saveViewConfirmBtn.disabled = true;
    saveViewDialog.classList.add('show');
    saveViewNameInput.focus();
}

/**
 * Hides the save view dialog
 */
function hideSaveViewDialog() {
    if (!saveViewDialog) return;
    saveViewDialog.classList.remove('show');
}

/**
 * Initializes the save view dialog events
 */
function initSaveViewDialog() {
    if (!saveViewDialog) return;

    // Enable/disable save button based on input content
    saveViewNameInput.addEventListener('input', () => {
        saveViewConfirmBtn.disabled = !saveViewNameInput.value.trim();
    });

    saveViewConfirmBtn.addEventListener('click', () => {
        const name = saveViewNameInput.value.trim();
        if (name) {
            saveCurrentViewAsPreset(name);
            hideSaveViewDialog();
        }
    });

    saveViewCancelBtn.addEventListener('click', () => {
        hideSaveViewDialog();
    });

    // Close on overlay click
    saveViewDialog.addEventListener('click', (e) => {
        if (e.target === saveViewDialog) {
            hideSaveViewDialog();
        }
    });

    // Handle Enter key in input
    saveViewNameInput.addEventListener('keydown', (e) => {
        e.stopPropagation(); // Prevent hotkeys from firing
        if (e.key === 'Enter') {
            const name = saveViewNameInput.value.trim();
            if (name) {
                saveCurrentViewAsPreset(name);
                hideSaveViewDialog();
            }
        } else if (e.key === 'Escape') {
            hideSaveViewDialog();
        }
    });

    log('Initialized.', 'initSaveViewDialog');
}

/**
 * Shows the edit coordinates dialog
 */
export function showEditCoordsDialog() {
    if (!editCoordsDialog) return;

    // Show/hide Julia C inputs based on current mode
    if (juliaCInputs) {
        juliaCInputs.style.display = isJuliaMode() ? 'contents' : 'none';
    }

    // Populate individual fields with current values (shortened precision)
    const viewPanX = ddValue(fractalApp.panDD.x);
    const viewPanY = ddValue(fractalApp.panDD.y);

    editPanXInput.value = viewPanX.toFixed(8);
    editPanYInput.value = viewPanY.toFixed(8);
    editZoomInput.value = fractalApp.zoom.toExponential(6);
    editRotationInput.value = (fractalApp.rotation * 180 / Math.PI).toFixed(2);

    if (isJuliaMode()) {
        editCxInput.value = fractalApp.c[0].toFixed(8);
        editCyInput.value = fractalApp.c[1].toFixed(8);
    }

    // Clear JSON textarea and error
    editJsonInput.value = '';
    editCoordsError.textContent = '';

    // Clear validation states
    [editPanXInput, editPanYInput, editZoomInput, editRotationInput, editCxInput, editCyInput, editJsonInput].forEach(input => {
        if (input) input.classList.remove('invalid');
    });

    editCoordsDialog.classList.add('show');
    editPanXInput.focus();
}

/**
 * Hides the edit coordinates dialog
 */
function hideEditCoordsDialog() {
    if (!editCoordsDialog) return;
    editCoordsDialog.classList.remove('show');
}

/**
 * Parses user input from either JSON or individual fields
 * Tries JSON first, then falls back to field-by-field parsing
 * @returns {Object} Parsed coordinates object or {error: string}
 */
function parseEditCoordsInput() {
    const jsonText = editJsonInput.value.trim();

    // If JSON textarea has content, prioritize that
    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText);

            // Validate required fields
            if (!parsed.pan || !Array.isArray(parsed.pan) || parsed.pan.length !== 2) {
                return {error: 'JSON must include "pan" as array [x, y]'};
            }
            if (typeof parsed.pan[0] !== 'number' || isNaN(parsed.pan[0])) {
                return {error: 'JSON "pan[0]" must be a valid number'};
            }
            if (typeof parsed.pan[1] !== 'number' || isNaN(parsed.pan[1])) {
                return {error: 'JSON "pan[1]" must be a valid number'};
            }
            if (typeof parsed.zoom !== 'number' || isNaN(parsed.zoom)) {
                return {error: 'JSON "zoom" must be a valid number'};
            }
            if (parsed.zoom <= 0) {
                return {error: 'JSON "zoom" must be positive'};
            }
            if (typeof parsed.rotation !== 'number' || isNaN(parsed.rotation)) {
                return {error: 'JSON "rotation" must be a valid number (in radians)'};
            }

            // Validate Julia C if in Julia mode
            if (isJuliaMode()) {
                if (!parsed.c || !Array.isArray(parsed.c) || parsed.c.length !== 2) {
                    return {error: 'JSON must include "c" as array [real, imag] in Julia mode'};
                }
                if (typeof parsed.c[0] !== 'number' || isNaN(parsed.c[0])) {
                    return {error: 'JSON "c[0]" must be a valid number'};
                }
                if (typeof parsed.c[1] !== 'number' || isNaN(parsed.c[1])) {
                    return {error: 'JSON "c[1]" must be a valid number'};
                }
            }

            // Return only the necessary fields (strip id, paletteId if empty, etc.)
            const result = {
                pan: [parsed.pan[0], parsed.pan[1]],
                zoom: parsed.zoom,
                rotation: parsed.rotation
            };

            // Add optional fields if present and non-empty
            if (parsed.c && Array.isArray(parsed.c) && parsed.c.length === 2) {
                result.c = [parsed.c[0], parsed.c[1]];
            }
            if (parsed.paletteId && parsed.paletteId.trim()) {
                result.paletteId = parsed.paletteId;
            }

            return result;

        } catch (e) {
            return {error: `Invalid JSON: ${e.message}`};
        }
    }

    // Otherwise, parse from individual fields
    const panXStr = editPanXInput.value.trim();
    const panYStr = editPanYInput.value.trim();
    const zoomStr = editZoomInput.value.trim();
    const rotationStr = editRotationInput.value.trim();

    // Check for empty fields
    if (!panXStr) return {error: 'Pan X is required'};
    if (!panYStr) return {error: 'Pan Y is required'};
    if (!zoomStr) return {error: 'Zoom is required'};
    if (!rotationStr) return {error: 'Rotation is required'};

    const panX = parseFloat(panXStr);
    const panY = parseFloat(panYStr);
    const zoom = parseFloat(zoomStr);
    const rotationDeg = parseFloat(rotationStr);

    // Validate numbers
    if (isNaN(panX)) return {error: `Pan X "${panXStr}" is not a valid number`};
    if (isNaN(panY)) return {error: `Pan Y "${panYStr}" is not a valid number`};
    if (isNaN(zoom)) return {error: `Zoom "${zoomStr}" is not a valid number`};
    if (zoom <= 0) return {error: 'Zoom must be a positive number'};
    if (isNaN(rotationDeg)) return {error: `Rotation "${rotationStr}" is not a valid number`};

    const result = {
        pan: [panX, panY],
        zoom: zoom,
        rotation: normalizeRotation(rotationDeg * Math.PI / 180) // Convert degrees to radians
    };

    // Add Julia C if in Julia mode
    if (isJuliaMode()) {
        const cxStr = editCxInput.value.trim();
        const cyStr = editCyInput.value.trim();

        if (!cxStr) return {error: 'C Real is required in Julia mode'};
        if (!cyStr) return {error: 'C Imag is required in Julia mode'};

        const cx = parseFloat(cxStr);
        const cy = parseFloat(cyStr);

        if (isNaN(cx)) return {error: `C Real "${cxStr}" is not a valid number`};
        if (isNaN(cy)) return {error: `C Imag "${cyStr}" is not a valid number`};

        result.c = [cx, cy];
    }

    return result;
}

/**
 * Validates current input and updates UI accordingly
 * @returns {boolean} True if valid
 */
function validateEditCoordsInput() {
    const result = parseEditCoordsInput();

    // Clear all invalid states first
    [editPanXInput, editPanYInput, editZoomInput, editRotationInput, editCxInput, editCyInput, editJsonInput].forEach(input => {
        if (input) input.classList.remove('invalid');
    });

    if (result.error) {
        editCoordsError.textContent = result.error;
        editCoordsApplyBtn.disabled = true;

        // Mark specific field as invalid based on error message
        if (editJsonInput.value.trim()) {
            editJsonInput.classList.add('invalid');
        } else {
            // Mark individual field based on error
            if (result.error.includes('Pan X')) editPanXInput.classList.add('invalid');
            else if (result.error.includes('Pan Y')) editPanYInput.classList.add('invalid');
            else if (result.error.includes('Zoom')) editZoomInput.classList.add('invalid');
            else if (result.error.includes('Rotation')) editRotationInput.classList.add('invalid');
            else if (result.error.includes('C Real')) editCxInput.classList.add('invalid');
            else if (result.error.includes('C Imag')) editCyInput.classList.add('invalid');
        }

        return false;
    }

    // Clear error and enable apply button
    editCoordsError.textContent = '';
    editCoordsApplyBtn.disabled = false;

    return true;
}

/**
 * Applies the edited coordinates and animates travel
 */
async function applyEditedCoords() {
    const result = parseEditCoordsInput();

    if (result.error) {
        editCoordsError.textContent = result.error;
        return;
    }

    hideEditCoordsDialog();

    // Animate travel to the new coordinates
    initAnimationMode();

    // Different signatures for different fractal types
    if (isJuliaMode()) {
        // JuliaRenderer: animateTravelToPreset(preset, duration, coloringCallback)
        await fractalApp.animateTravelToPreset(result, 1500, updateColorTheme);
    } else {
        // MandelbrotRenderer: animateTravelToPreset(preset, zoomOutDuration, panDuration, zoomInDuration, coloringCallback)
        await fractalApp.animateTravelToPreset(result, 1000, 500, 1000, updateColorTheme);
    }

    exitAnimationMode();
}

/**
 * Initializes the edit coordinates dialog events
 */
function initEditCoordsDialog() {
    if (!editCoordsDialog) return;

    // Filter input to allow only valid number characters
    const numericInputs = [editPanXInput, editPanYInput, editZoomInput, editRotationInput, editCxInput, editCyInput];
    numericInputs.forEach(input => {
        if (!input) return;

        input.addEventListener('input', (e) => {
            let value = e.target.value;

            // 1. Initial cleanup: Keep only digits, dots, minus signs, and e/E
            let filtered = value.replace(/[^0-9.\-eE]/g, '');

            // 2. Ensure only one decimal point
            const dotParts = filtered.split('.');
            if (dotParts.length > 2) {
                filtered = dotParts[0] + '.' + dotParts.slice(1).join('');
            }

            // 3. Allow minus at start OR after 'e'
            filtered = filtered.replace(/-/g, (match, offset) => {
                if (offset === 0) return match;
                const prevChar = filtered[offset - 1];
                if (prevChar === 'e' || prevChar === 'E') return match;
                return '';
            });

            // 4. Ensure only one 'e'
            const eParts = filtered.split(/[eE]/);
            if (eParts.length > 2) {
                filtered = eParts[0] + 'e' + eParts[1];
            }

            // Update value if it changed
            if (value !== filtered) {
                e.target.value = filtered;
            }
        });
    });

    // Validate on input change
    const allInputs = [editPanXInput, editPanYInput, editZoomInput, editRotationInput, editCxInput, editCyInput, editJsonInput];
    allInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', validateEditCoordsInput);
    });

    // Apply button
    editCoordsApplyBtn.addEventListener('click', async () => {
        await applyEditedCoords();
    });

    // Cancel button
    editCoordsCancelBtn.addEventListener('click', () => {
        hideEditCoordsDialog();
    });

    // Close on overlay click
    editCoordsDialog.addEventListener('click', (e) => {
        if (e.target === editCoordsDialog) {
            hideEditCoordsDialog();
        }
    });

    // Handle keyboard shortcuts in inputs
    allInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Prevent hotkeys from firing

            if (e.key === 'Enter') {
                if (validateEditCoordsInput()) {
                    applyEditedCoords();
                }
            } else if (e.key === 'Escape') {
                hideEditCoordsDialog();
            }
        });
    });

    log('Initialized.', 'initEditCoordsDialog');
}

// endregion -----------------------------------------------------------------------------------------------------------

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

    logo.innerHTML = APP.randomName;

    document.getElementById("versionLink").innerHTML = `v${APP.version}`;

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

    saveViewButton.addEventListener('click', showSaveViewDialog);

    demoButton.addEventListener('click', toggleDemo);

    screenshotButton.addEventListener('click', captureScreenshot);

    log('Initialized.', 'initControlButtonEvents');
}

function initPresetButtonEvents() {
    const presetBlock = document.getElementById('presets');
    presetButtons = [];

    // Add built-in presets
    const presets = [...fractalApp.PRESETS];
    presets.forEach((preset) => {
        const btn = document.createElement('button');
        btn.id = 'preset-' + (preset.index);
        btn.className = 'preset';
        btn.title = `${(preset.id || ('Preset ' + preset.index))} ` +
            `${preset.index < 10 ? '(Num ' : '('}${preset.index})`;

        btn.textContent = (preset.id || preset.index).toString();

        // Apply palette keyColor as border if preset has a paletteId
        if (preset.paletteId && fractalApp.PALETTES) {
            const palette = fractalApp.PALETTES.find(p => p.id === preset.paletteId);
            if (palette && palette.keyColor) {
                btn.style.borderColor = palette.keyColor;
                btn.style.setProperty('--palette-color', palette.keyColor);
                btn.classList.add('has-palette');
            }
        }

        btn.addEventListener('click', async () => {
            closePresetsDropdown();
            await travelToPreset(presets, preset.index);
        });

        presetBlock.appendChild(btn);
        presetButtons.push(btn);
    });

    // Add user presets from localStorage
    const userPresets = getUserPresets();
    userPresets.forEach((preset) => {
        const btn = document.createElement('button');
        btn.id = 'preset-' + preset.id;
        btn.className = 'preset user-preset';
        btn.title = `${preset.id} (User) - Right-click to delete`;
        btn.textContent = preset.id;

        // Apply palette keyColor as border if preset has a paletteId
        if (preset.paletteId && fractalApp.PALETTES) {
            const palette = fractalApp.PALETTES.find(p => p.id === preset.paletteId);
            if (palette && palette.keyColor) {
                btn.style.borderColor = palette.keyColor;
                btn.style.setProperty('--palette-color', palette.keyColor);
                btn.classList.add('has-palette');
            }
        }

        // Left click to travel to preset
        btn.addEventListener('click', async () => {
            closePresetsDropdown();
            resetPresetAndDiveButtonStates();
            initAnimationMode();
            btn.classList.add('active');

            if (isJuliaMode()) {
                await fractalApp.animateTravelToPreset(preset, 1500, updateColorTheme);
            } else {
                await fractalApp.animateTravelToPreset(preset, 2000, 500, 1500, updateColorTheme);
            }

            exitAnimationMode();
            updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null, getCurrentPaletteId());
        });

        // Right click to delete
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (confirm(`Delete view "${preset.id}"?`)) {
                deleteUserPreset(preset.id);
            }
        });

        // Long press to delete (touch devices)
        let longPressTimer = null;
        let touchMoved = false;
        btn.addEventListener('touchstart', (e) => {
            touchMoved = false;
            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    e.preventDefault();
                    if (confirm(`Delete view "${preset.id}"?`)) {
                        deleteUserPreset(preset.id);
                    }
                }
            }, 600);
        }, {passive: false});
        btn.addEventListener('touchmove', () => {
            touchMoved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        btn.addEventListener('touchend', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        presetBlock.appendChild(btn);
        presetButtons.push(btn);
    });

    if (presetButtons.length > 0) {
        presetButtons[0].classList.add('active');
    }

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
    randomBtn.title = 'Pick a random palette (T)';
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
    cycleBtn.title = 'Cycle through palettes sequentially (Shift+T)';
    cycleBtn.innerHTML = '<span class="color-swatch color-cycle-swatch"></span>Palette Cycle';
    cycleBtn.addEventListener('click', async () => {
        if (fractalApp.paletteCyclingActive) {
            fractalApp.stopCurrentColorAnimations();
        } else {
            closePaletteDropdown();
            await fractalApp.startPaletteCycling(5000, 2000, updateColorTheme, updatePaletteDropdownState);
        }
        // Ensure button state is synced
        updatePaletteCycleButtonState();
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
            await fractalApp.applyPaletteByIndex(index, 250, updateColorTheme);
            updatePaletteDropdownState();
            updatePaletteCycleButtonState();
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
    allButtons.push(resetButton, saveViewButton, screenshotButton, demoButton);

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
            btn.title = (dive.id || ('Preset ' + index)) + ` (Shift+${index})`;
            btn.textContent = dive.id || (index).toString();

            // Apply palette keyColor as border if dive has a paletteId
            if (dive.paletteId && fractalApp.PALETTES) {
                const palette = fractalApp.PALETTES.find(p => p.id === dive.paletteId);
                if (palette && palette.keyColor) {
                    btn.style.borderColor = palette.keyColor;
                    btn.style.setProperty('--palette-color', palette.keyColor);
                    btn.classList.add('has-palette');
                }
            }

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
            persistSwitch.blur(); // Release focus to prevent space key from re-triggering
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

function initInfoText() {
    infoText.addEventListener('mouseenter', () => {
        if (animationActive) return; // Disable during animations
        infoText.innerHTML = 'Left click to copy, Right click to edit.';
    });

    infoText.addEventListener('mouseleave', () => {
        if (animationActive) return; // Disable during animations
        updateInfo();
    });

    infoText.addEventListener('click', () => {
        if (animationActive) return; // Disable during animations

        copyInfoToClipboard();
    });

    // Right-click to edit coordinates
    infoText.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (animationActive) return; // Disable during animations

        showEditCoordsDialog();
    });

    // Long touch to edit coordinates (for touch devices)
    let longTouchTimer = null;
    const LONG_TOUCH_DURATION = 500; // ms

    infoText.addEventListener('touchstart', (e) => {
        if (animationActive) return;

        longTouchTimer = setTimeout(() => {
            e.preventDefault();
            showEditCoordsDialog();
            longTouchTimer = null;
        }, LONG_TOUCH_DURATION);
    }, { passive: false });

    infoText.addEventListener('touchend', () => {
        if (longTouchTimer) {
            clearTimeout(longTouchTimer);
            longTouchTimer = null;
        }
    });

    infoText.addEventListener('touchmove', () => {
        if (longTouchTimer) {
            clearTimeout(longTouchTimer);
            longTouchTimer = null;
        }
    });
}

export function copyInfoToClipboard() {
    const viewPanX = ddValue(fractalApp.panDD.x);
    const viewPanY = ddValue(fractalApp.panDD.y);
    const randomTitle = Math.random().toString(36).slice(2).substring(2, 2 + 4);
    const paletteId = getCurrentPaletteId() || '';

    let text =
        `{"id": "${randomTitle}", ` +
        (isJuliaMode() ? `"c": [${fractalApp.c}], ` : ``) +
        `"pan": [${esc(viewPanX.toFixed(24))}, ${esc(viewPanY.toFixed(24))}], ` +
        `"rotation": ${normalizeRotation(fractalApp.rotation)}, "zoom": ${fractalApp.zoom}, "paletteId": "${paletteId}"}`;

    navigator.clipboard.writeText(text).then(function () {
        infoText.innerHTML = 'Copied to clipboard!';
    }, function (err) {
        console.error('Not copied to clipboard! ' + err.toString());
    });
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
    saveViewButton = document.getElementById('saveView');
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
    // Save View Dialog elements
    saveViewDialog = document.getElementById('saveViewDialog');
    saveViewNameInput = document.getElementById('saveViewName');
    saveViewConfirmBtn = document.getElementById('saveViewConfirm');
    saveViewCancelBtn = document.getElementById('saveViewCancel');
    // Edit Coordinates Dialog elements
    editCoordsDialog = document.getElementById('editCoordsDialog');
    editPanXInput = document.getElementById('editPanX');
    editPanYInput = document.getElementById('editPanY');
    editZoomInput = document.getElementById('editZoom');
    editRotationInput = document.getElementById('editRotation');
    editCxInput = document.getElementById('editCx');
    editCyInput = document.getElementById('editCy');
    editJsonInput = document.getElementById('editJsonInput');
    editCoordsError = document.getElementById('editCoordsError');
    editCoordsApplyBtn = document.getElementById('editCoordsApply');
    editCoordsCancelBtn = document.getElementById('editCoordsCancel');
    juliaCInputs = document.getElementById('juliaCInputs');
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
    initSaveViewDialog();
    initEditCoordsDialog();
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

    // Tap-to-toggle for controls hint on touch devices
    const controlsHint = document.getElementById("controlsHint");
    if (controlsHint) {
        controlsHint.addEventListener("click", (e) => {
            if (window.matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                e.stopPropagation();
                controlsHint.classList.toggle("active");
            }
        });
        // Close tooltip when tapping outside
        document.addEventListener("click", (e) => {
            if (!controlsHint.contains(e.target)) {
                controlsHint.classList.remove("active");
            }
        });
    }

    uiInitialized = true;
}

// endregion------------------------------------------------------------------------------------------------------------