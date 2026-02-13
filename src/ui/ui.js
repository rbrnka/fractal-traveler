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
import {RosslerRenderer} from "../renderers/rosslerRenderer";
import {initTourAudio, startTourMusic, stopTourMusic} from "../global/audioManager";
import * as zetaPathOverlay from "./zetaPathOverlay";

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
const USER_PRESETS_KEY_RIEMANN = 'u_riemann_presets';
const USER_PRESETS_KEY_ROSSLER = 'u_rossler_presets';

const DEMO_BUTTON_DEFAULT_TEXT = 'Tour';
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
let travelingToPresetIndex = -1; // Track target during travel for instant cycling
let resizeTimeout;

// HTML elements
let header;
let logo; // H1
let fractalToggle;
let fractalModesMenu;
let fractalModeButtons = [];
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

// Riemann controls
let riemannControls;
let riemannDisplayDropdown;
let riemannDisplayToggle;
let riemannDisplayMenu;
let criticalLineToggle;
let analyticExtToggle;
let axesToggle;
let axesCanvas;
let axesCtx;
let axesVisible = false;
let zetaPathToggle;
let zetaPathCanvas;
let freqRSlider;
let freqGSlider;
let freqBSlider;
let freqRValue;
let freqGValue;
let freqBValue;
let contourSlider;
let contourValue;
let termsSlider;
let termsValue;
let viewInfoOverlay;
let viewInfoTitle;
let viewInfoValue;
let viewInfoDescription;
let viewInfoCurrent;
let viewInfoTotal;
let pointMarker;
let lineMarker;
let lineMarkerLabel;
let hLineMarker;
let hLineMarkerLabel;
let regionMarker;
let segmentMarker;
let pairMarker;

// Rossler controls
let rosslerControls;
let rosslerASlider;
let rosslerBSlider;
let rosslerCSlider;
let rosslerAValue;
let rosslerBValue;
let rosslerCValue;
let rosslerFreqRSlider;
let rosslerFreqGSlider;
let rosslerFreqBSlider;
let rosslerFreqRValue;
let rosslerFreqGValue;
let rosslerFreqBValue;
let rosslerIterSlider;
let rosslerIterValue;

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

        case FRACTAL_TYPE.ROSSLER:
            enableRosslerMode();
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
export const isRiemannMode = () => fractalMode === FRACTAL_TYPE.RIEMANN;

/**
 * Implemented in a way it's not needed to be called at the first render. Everything should be pre-initialized
 * for Mandelbrot mode.
 */
export function enableMandelbrotMode() {
    updateFractalDropdownState(FRACTAL_TYPE.MANDELBROT);

    destroyArrayOfButtons(diveButtons);
    divesDropdown.style.display = 'none';

    destroyJuliaSliders();
    destroyJuliaPreview();
    destroyRiemannControls();
    destroyRosslerControls();

    // Show Demo button and persist switch (may have been hidden in other modes)
    if (demoButton) demoButton.style.display = 'inline-flex';
    if (persistSwitch && FF_PERSISTENT_FRACTAL_SWITCHING_BUTTON_DISPLAYED) {
        persistSwitch.style.display = 'inline-flex';
    }

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
    updateFractalDropdownState(FRACTAL_TYPE.JULIA);

    fractalApp.destroy();
    fractalApp = new JuliaRenderer(canvas);
    fractalMode = FRACTAL_TYPE.JULIA;

    // Remove each button from the DOM and reinitialize
    destroyArrayOfButtons(presetButtons);
    initPresetButtonEvents();

    initJuliaSliders(fractalApp);
    updateJuliaSliders();

    destroyArrayOfButtons(diveButtons);
    initDiveButtons();

    // Update palette dropdown for new renderer
    initPaletteButtonEvents();

    destroyRiemannControls();
    destroyRosslerControls();

    // Show Demo button and persist switch (may have been hidden in other modes)
    if (demoButton) demoButton.style.display = 'inline-flex';
    if (persistSwitch && FF_PERSISTENT_FRACTAL_SWITCHING_BUTTON_DISPLAYED) {
        persistSwitch.style.display = 'inline-flex';
    }

    if (activePresetIndex !== 0) resetActivePresetIndex();

    updateColorTheme(DEFAULT_JULIA_THEME_COLOR);
    // Darker backgrounds for Julia as it renders on white
    header.style.background = 'rgba(20, 20, 20, 0.8)';
    infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';

    updatePaletteDropdownState();

    window.location.hash = '#julia'; // Update URL hash
}

export function enableRiemannMode() {
    updateFractalDropdownState(FRACTAL_TYPE.RIEMANN);

    fractalApp.destroy();
    fractalApp = new RiemannRenderer(canvas);
    fractalMode = FRACTAL_TYPE.RIEMANN;

    destroyArrayOfButtons(presetButtons);
    destroyArrayOfButtons(diveButtons);
    divesDropdown.style.display = 'none';

    destroyJuliaSliders();
    destroyJuliaPreview();
    destroyRosslerControls();

    initPresetButtonEvents();
    initPaletteButtonEvents();
    initRiemannControls();

    // Initialize tour background music
    initTourAudio('./audio/riemann-tour.mp3');

    // Show Demo button, hide persist switch in Riemann mode
    if (demoButton) demoButton.style.display = 'inline-flex';
    if (persistSwitch) persistSwitch.style.display = 'none';

    window.location.hash = '#zeta'; // Update URL hash
}

export function enableRosslerMode() {
    updateFractalDropdownState(FRACTAL_TYPE.ROSSLER);

    fractalApp.destroy();
    fractalApp = new RosslerRenderer(canvas);
    fractalMode = FRACTAL_TYPE.ROSSLER;

    destroyArrayOfButtons(presetButtons);
    destroyArrayOfButtons(diveButtons);
    divesDropdown.style.display = 'none';

    destroyJuliaSliders();
    destroyJuliaPreview();

    initPresetButtonEvents();
    initPaletteButtonEvents();
    destroyRiemannControls();
    initRosslerControls();

    // Show Demo button, hide persist switch (only for Mandelbrot/Julia)
    if (demoButton) demoButton.style.display = 'inline-flex';
    if (persistSwitch) persistSwitch.style.display = 'none';

    window.location.hash = '#ross'; // Update URL hash
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
    updateAxes();
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

    // Stop any active demos or tours
    fractalApp?.stopDemo?.();
    fractalApp?.stopZeroTour?.();
    fractalApp?.stopAllNonColorAnimations();
    // Note: Don't stop color animations here - palette cycling should be independent

    // Stop tour music if playing
    stopTourMusic();

    // Hide view info overlay when exiting animation mode
    hideViewInfo();

    if (demoButton) {
        demoButton.innerText = DEMO_BUTTON_DEFAULT_TEXT;
        demoButton.classList.remove('active');
    }

    // Re-enable dives dropdown (only one disabled during animations)
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

    // Close dropdowns but keep most enabled - clicking them will stop the demo
    // Only disable dives dropdown during animation
    closePresetsDropdown();
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
        fractalApp.stopDemo?.();
        fractalApp.stopZeroTour?.();
        hideViewInfo();
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

        case FRACTAL_TYPE.RIEMANN: await startRiemannDemo(); break;

        case FRACTAL_TYPE.ROSSLER: await startRosslerDemo(); break;

        default:
            console.warn(`No demo defined for mode ${fractalMode}`);
            break;
        // @formatter:on
    }

    // Demo/tour ended naturally - clean up
    exitAnimationMode();
    console.groupEnd();
}

/**
 * Callback for demo to show view info overlay
 * @param {Object} preset - The preset object
 * @param {number} index - Current index
 * @param {number} total - Total presets
 * @param {boolean} [isRiemann=false] - Whether this is Riemann mode
 */
function onDemoPresetReached(preset, index, total, isRiemann = false) {
    showViewInfo(preset, index, total, isRiemann);
}

/** Starts the Mandelbrot demo */
async function startMandelbrotDemo() {
    console.groupCollapsed(`%c startMandelbrotDemo`, CONSOLE_GROUP_STYLE);

    await fractalApp.animateDemo(true, updateColorTheme, updatePaletteDropdownState, getUserPresets(),
        (preset, index, total) => onDemoPresetReached(preset, index, total, false));

    hideViewInfo();
    console.log("Demo ended");
    console.groupEnd();
}

/** Starts the Riemann tour (zero tour through significant points) */
async function startRiemannDemo() {
    console.groupCollapsed(`%c startRiemannDemo`, CONSOLE_GROUP_STYLE);

    if (!fractalApp.PRESETS || fractalApp.PRESETS.length === 0) {
        log('No presets data available for tour', 'startRiemannDemo');
        console.groupEnd();
        return;
    }

    // Enable critical line and analytic extension for the tour
    if (fractalApp.showCriticalLine !== undefined) {
        fractalApp.showCriticalLine = true;
    }
    if (fractalApp.useAnalyticExtension !== undefined) {
        fractalApp.useAnalyticExtension = true;
    }
    syncRiemannToggleStates();

    // Turn on axes for tour if not already on
    if (!axesVisible) {
        axesVisible = true;
        if (axesToggle) axesToggle.classList.add('active');
        showAxes();
    }

    fractalApp.draw();

    // Start atmospheric background music
    await startTourMusic();

    const totalPoints = fractalApp.PRESETS.length;

    // Start the zero tour with callback
    await fractalApp.animateZeroTour((point, index) => {
        showViewInfo(point, index, totalPoints, true);
    }, 7000, hideViewInfo);

    // Stop music when tour ends
    await stopTourMusic();

    hideViewInfo();
    console.log("Riemann tour ended");
    console.groupEnd();
}

/** Starts the Rossler demo */
async function startRosslerDemo() {
    console.groupCollapsed(`%c startRosslerDemo`, CONSOLE_GROUP_STYLE);

    await fractalApp.animateDemo(true, updateColorTheme, updatePaletteDropdownState, getUserPresets(),
        (preset, index, total) => onDemoPresetReached(preset, index, total, false));

    hideViewInfo();
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

    await fractalApp.animateDemo(false, updateColorTheme, updatePaletteDropdownState, getUserPresets(),
        (preset, index, total) => onDemoPresetReached(preset, index, total, false));
    // await fractalApp.animateRandomDemo(); // sin/cos original demo

    hideViewInfo();
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
    // Interrupt any active animation immediately
    if (animationActive) {
        console.log(`%c travelToPreset: %c Travel to preset ${index} requested, interrupting current animation...`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        exitAnimationMode();
    }

    // Skip if already at this preset AND not currently traveling
    if (index === activePresetIndex && travelingToPresetIndex < 0) {
        console.log(`%c travelToPreset: %c Already on preset ${index}, skipping.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    console.log(`%c travelToPreset: %c Executing travel to preset ${index}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    // Track target for instant cycling with PageUp/PageDown
    travelingToPresetIndex = index;

    // Hide any existing overlay/markers before travel starts
    hideViewInfo();

    resetPresetAndDiveButtonStates();
    initAnimationMode();

    presetButtons[index]?.classList.add('active');

    const preset = presets[index];
    const isRiemann = fractalMode === FRACTAL_TYPE.RIEMANN;

    if (isJuliaMode()) {
        fractalApp.demoTime = 0;
        await fractalApp.animateTravelToPreset(preset, 1500, updateColorTheme);
    } else {
        // Cinematic animation with zoom-out, pan, zoom-in with rotation
        await fractalApp.animateTravelToPreset(preset, 2000, 500, 1500, updateColorTheme);
    }

    // Check if we were interrupted (travelingToPresetIndex changed)
    if (travelingToPresetIndex !== index) {
        console.log(`%c travelToPreset: %c Travel to preset ${index} was interrupted`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    // Sync button state after travel (in case preset had paletteId that stopped cycling)
    updatePaletteCycleButtonState();

    activePresetIndex = index;
    travelingToPresetIndex = -1; // Clear traveling target

    // Update palette button state if preset changed the palette
    updatePaletteDropdownState();

    exitAnimationMode();
    updateURLParams(fractalMode, fractalApp.pan[0], fractalApp.pan[1], fractalApp.zoom, fractalApp.rotation, fractalApp.c ? fractalApp.c[0] : null, fractalApp.c ? fractalApp.c[1] : null, getCurrentPaletteId());

    // Show overlay after travel completes (showViewInfo handles marker display based on view type)
    showViewInfo(preset, index, presets.length, isRiemann);

    // Auto-hide overlay and markers after delay
    const hideDelay = isRiemann ? 10000 : 5000;
    setTimeout(() => {
        if (!animationActive) {
            hideViewInfo();
        }
    }, hideDelay);
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

/**
 * Gets the current active preset index
 * @returns {number}
 */
export function getActivePresetIndex() {
    return activePresetIndex;
}

/**
 * Cycles to the next preset (wraps around).
 * Uses travelingToPresetIndex if mid-travel for instant consecutive cycling.
 */
export async function cycleToNextPreset() {
    const presets = fractalApp?.PRESETS || [];
    if (presets.length === 0) return;

    // Use traveling target if mid-travel, otherwise use active index
    const currentIndex = travelingToPresetIndex >= 0 ? travelingToPresetIndex : activePresetIndex;
    const nextIndex = (currentIndex + 1) % presets.length;
    await travelToPreset(presets, nextIndex);
}

/**
 * Cycles to the previous preset (wraps around).
 * Uses travelingToPresetIndex if mid-travel for instant consecutive cycling.
 */
export async function cycleToPreviousPreset() {
    const presets = fractalApp?.PRESETS || [];
    if (presets.length === 0) return;

    // Use traveling target if mid-travel, otherwise use active index
    const currentIndex = travelingToPresetIndex >= 0 ? travelingToPresetIndex : activePresetIndex;
    const prevIndex = currentIndex <= 0
        ? presets.length - 1
        : currentIndex - 1;
    await travelToPreset(presets, prevIndex);
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
    syncRiemannControls();
    syncRosslerControls();
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

    // Always stop tour music on reset (exitAnimationMode might skip this if !animationActive)
    stopTourMusic();

    exitAnimationMode();

    fractalApp.reset();

    if (isJuliaMode()) {
        resetJuliaSliders();
    } else {
        resetJuliaPreview();
    }

    // Sync mode-specific controls
    syncRiemannControls();
    syncRosslerControls();

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
    switch (fractalMode) {
        case FRACTAL_TYPE.JULIA: return USER_PRESETS_KEY_JULIA;
        case FRACTAL_TYPE.RIEMANN: return USER_PRESETS_KEY_RIEMANN;
        case FRACTAL_TYPE.ROSSLER: return USER_PRESETS_KEY_ROSSLER;
        default: return USER_PRESETS_KEY_MANDELBROT;
    }
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
        preset.speed = 2;
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

    logo.innerHTML = DEBUG_MODE > DEBUG_LEVEL.NONE ? APP.randomName : APP.defaultName;

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
        closeFractalDropdown();
        closeDivesDropdown();
        closePaletteDropdown();
        closeRiemannDisplayDropdown();
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

// region > FRACTAL MODE DROPDOWN --------------------------------------------------------------------------------------

/** Fractal mode display names */
const FRACTAL_MODE_NAMES = {
    [FRACTAL_TYPE.MANDELBROT]: 'Mandelbrot',
    [FRACTAL_TYPE.JULIA]: 'Julia',
    [FRACTAL_TYPE.RIEMANN]: 'Riemann',
    [FRACTAL_TYPE.ROSSLER]: 'Rossler'
};

/** Toggles the fractal mode dropdown menu */
function toggleFractalDropdown() {
    fractalModesMenu.classList.toggle('show');
    const isOpen = fractalModesMenu.classList.contains('show');
    const currentName = FRACTAL_MODE_NAMES[fractalMode] || 'Mandelbrot';
    fractalToggle.textContent = isOpen ? `${currentName} ▴` : `${currentName} ▾`;
}

/** Closes the fractal mode dropdown menu */
function closeFractalDropdown() {
    fractalModesMenu?.classList.remove('show');
    if (fractalToggle) {
        const currentName = FRACTAL_MODE_NAMES[fractalMode] || 'Mandelbrot';
        fractalToggle.textContent = `${currentName} ▾`;
    }
}

/**
 * Updates the fractal dropdown toggle text and button active states
 * @param {FRACTAL_TYPE} mode
 */
function updateFractalDropdownState(mode) {
    if (fractalToggle) {
        const modeName = FRACTAL_MODE_NAMES[mode] || 'Mandelbrot';
        fractalToggle.textContent = `${modeName} ▾`;
    }

    // Update button active states
    fractalModeButtons.forEach((btn, index) => {
        const btnMode = Object.values(FRACTAL_TYPE)[index];
        btn.classList.toggle('active', btnMode === mode);
    });
}

/**
 * Initializes the fractal mode dropdown buttons
 */
function initFractalModeButtons() {
    fractalModeButtons = [];
    fractalModesMenu.innerHTML = ''; // Clear existing

    const modes = [
        { type: FRACTAL_TYPE.MANDELBROT, name: 'Mandelbrot', title: 'Mandelbrot set explorer' },
        { type: FRACTAL_TYPE.JULIA, name: 'Julia', title: 'Julia set explorer' },
        { type: FRACTAL_TYPE.RIEMANN, name: 'Riemann', title: 'Riemann Zeta function visualization' },
        // { type: FRACTAL_TYPE.ROSSLER, name: 'Rosslerᴮᴱᵀᴬ', title: 'Rossler attractor' }
    ];

    modes.forEach((mode) => {
        const btn = document.createElement('button');
        btn.id = 'fractal-mode-' + mode.name.toLowerCase();
        btn.className = 'fractal-mode';
        btn.title = mode.title;
        btn.textContent = mode.name;

        if (mode.type === fractalMode) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', async (e) => {
            closeFractalDropdown();
            if (mode.type !== fractalMode) {
                if (e.ctrlKey && (mode.type === FRACTAL_TYPE.MANDELBROT || mode.type === FRACTAL_TYPE.JULIA)) {
                    // Ctrl+click for persistent switch between Mandelbrot and Julia
                    await switchFractalTypeWithPersistence(mode.type);
                } else {
                    await switchFractalMode(mode.type);
                }
            }
        });

        fractalModesMenu.appendChild(btn);
        fractalModeButtons.push(btn);
    });

    log('Initialized.', 'initFractalModeButtons');
}

/**
 * Initializes the fractal mode dropdown
 */
function initFractalDropdown() {
    fractalToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        closePresetsDropdown();
        closeDivesDropdown();
        closePaletteDropdown();
        closeRiemannDisplayDropdown();
        toggleFractalDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!fractalModesMenu.contains(e.target) && e.target !== fractalToggle) {
            closeFractalDropdown();
        }
    });

    log('Initialized.', 'initFractalDropdown');
}

// endregion -----------------------------------------------------------------------------------------------------------

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
        closeFractalDropdown();
        closePresetsDropdown();
        closePaletteDropdown();
        closeRiemannDisplayDropdown();
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
            syncRiemannControls();
            syncRosslerControls();
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
            syncRiemannControls();
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
        closeFractalDropdown();
        closePresetsDropdown();
        closeDivesDropdown();
        closeRiemannDisplayDropdown();
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

/** Toggles the Riemann display dropdown menu */
function toggleRiemannDisplayDropdown() {
    if (!riemannDisplayMenu) return;
    riemannDisplayMenu.classList.toggle('show');
    const isOpen = riemannDisplayMenu.classList.contains('show');
    if (riemannDisplayToggle) {
        riemannDisplayToggle.textContent = isOpen ? 'Display ▴' : 'Display ▾';
    }
}

/** Closes the Riemann display dropdown menu */
function closeRiemannDisplayDropdown() {
    if (riemannDisplayMenu) {
        riemannDisplayMenu.classList.remove('show');
    }
    if (riemannDisplayToggle) {
        riemannDisplayToggle.textContent = 'Display ▾';
    }
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
    // Initialize the fractal mode dropdown
    initFractalModeButtons();
    initFractalDropdown();

    // Update the toggle text to reflect current mode (may be Julia from URL hash)
    updateFractalDropdownState(fractalMode);

    // Initialize persist switch button (for Mandelbrot <-> Julia with persistence)
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

        // Only show persist switch in Mandelbrot/Julia modes
        if (fractalMode === FRACTAL_TYPE.MANDELBROT || fractalMode === FRACTAL_TYPE.JULIA) {
            persistSwitch.style.display = 'inline-flex';
        }
    }

    log('Initialized.', 'initFractalSwitchButtons');
}

function initWindowEvents() {
    // Resize canvas on window resize
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            fractalApp.resizeCanvas(); // Adjust canvas dimensions
            // Resize and redraw overlays if visible
            if (axesVisible && axesCanvas) {
                axesCanvas.width = window.innerWidth;
                axesCanvas.height = window.innerHeight;
                drawAxesFull();
            }
            zetaPathOverlay.resize();
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
    }, {passive: false});

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

// region > RIEMANN CONTROLS -------------------------------------------------------------------------------------------

/**
 * Initializes Riemann-specific UI controls
 */
function initRiemannControls() {
    if (!riemannControls) return;

    // Show the controls
    riemannControls.style.display = 'flex';

    // Show the display dropdown in the main toolbar
    if (riemannDisplayDropdown) {
        riemannDisplayDropdown.classList.add('visible');
    }

    // Set up overlay sync callback - called on every draw() for smooth movement
    fractalApp.onDrawCallback = () => {
        updateAxes();
        updateZetaPath();
    };

    // Sync toggle states with renderer
    if (criticalLineToggle) {
        criticalLineToggle.classList.toggle('active', fractalApp.showCriticalLine);
        criticalLineToggle.addEventListener('click', handleCriticalLineToggle);
    }

    if (analyticExtToggle) {
        analyticExtToggle.classList.toggle('active', fractalApp.useAnalyticExtension);
        analyticExtToggle.addEventListener('click', handleAnalyticExtToggle);
    }

    if (axesToggle) {
        axesToggle.classList.toggle('active', axesVisible);
        axesToggle.addEventListener('click', handleAxesToggle);
    }

    if (zetaPathToggle) {
        zetaPathToggle.classList.toggle('active', zetaPathOverlay.isVisible());
        zetaPathToggle.addEventListener('click', handleZetaPathToggle);
    }

    // Initialize zeta path overlay with canvas and renderer
    zetaPathOverlay.init(zetaPathCanvas, fractalApp);

    // Initialize Riemann display dropdown
    if (riemannDisplayToggle && riemannDisplayMenu) {
        riemannDisplayToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            closeFractalDropdown();
            closePresetsDropdown();
            closeDivesDropdown();
            closePaletteDropdown();
            toggleRiemannDisplayDropdown();
        });

        // Close dropdown when clicking outside (but not on toggle buttons inside)
        document.addEventListener('click', (e) => {
            if (!riemannDisplayDropdown?.contains(e.target)) {
                closeRiemannDisplayDropdown();
            }
        });
    }

    // Initialize frequency sliders
    if (freqRSlider) {
        freqRSlider.value = fractalApp.frequency[0];
        freqRValue.textContent = fractalApp.frequency[0].toFixed(1);
        freqRSlider.addEventListener('input', handleFreqRChange);
    }

    if (freqGSlider) {
        freqGSlider.value = fractalApp.frequency[1];
        freqGValue.textContent = fractalApp.frequency[1].toFixed(1);
        freqGSlider.addEventListener('input', handleFreqGChange);
    }

    if (freqBSlider) {
        freqBSlider.value = fractalApp.frequency[2];
        freqBValue.textContent = fractalApp.frequency[2].toFixed(1);
        freqBSlider.addEventListener('input', handleFreqBChange);
    }

    if (contourSlider) {
        contourSlider.value = fractalApp.contourStrength;
        contourValue.textContent = fractalApp.contourStrength.toFixed(2);
        contourSlider.addEventListener('input', handleContourChange);
    }

    if (termsSlider) {
        termsSlider.value = fractalApp.seriesTerms;
        termsValue.textContent = fractalApp.seriesTerms.toString();
        termsSlider.addEventListener('input', handleTermsChange);
    }

    // Turn axes on by default in Riemann mode
    if (!axesVisible) {
        axesVisible = true;
        if (axesToggle) axesToggle.classList.add('active');
        showAxes();
    }

    log('Initialized.', 'initRiemannControls');
}

/**
 * Destroys Riemann-specific UI controls and hides them
 */
function destroyRiemannControls() {
    if (riemannControls) {
        riemannControls.style.display = 'none';
    }

    // Hide the display dropdown in the main toolbar
    if (riemannDisplayDropdown) {
        riemannDisplayDropdown.classList.remove('visible');
    }

    // Clear draw callback
    if (fractalApp) {
        fractalApp.onDrawCallback = null;
    }

    // Remove event listeners
    if (criticalLineToggle) {
        criticalLineToggle.removeEventListener('click', handleCriticalLineToggle);
    }
    if (analyticExtToggle) {
        analyticExtToggle.removeEventListener('click', handleAnalyticExtToggle);
    }
    if (axesToggle) {
        axesToggle.removeEventListener('click', handleAxesToggle);
    }
    if (zetaPathToggle) {
        zetaPathToggle.removeEventListener('click', handleZetaPathToggle);
    }
    // Close dropdown and hide overlays when leaving Riemann mode
    closeRiemannDisplayDropdown();
    hideAxes();
    zetaPathOverlay.hide();
    if (zetaPathToggle) {
        zetaPathToggle.classList.remove('active');
    }
    if (freqRSlider) {
        freqRSlider.removeEventListener('input', handleFreqRChange);
    }
    if (freqGSlider) {
        freqGSlider.removeEventListener('input', handleFreqGChange);
    }
    if (freqBSlider) {
        freqBSlider.removeEventListener('input', handleFreqBChange);
    }
    if (contourSlider) {
        contourSlider.removeEventListener('input', handleContourChange);
    }
    if (termsSlider) {
        termsSlider.removeEventListener('input', handleTermsChange);
    }

    log('Destroyed.', 'destroyRiemannControls');
}

function handleCriticalLineToggle() {
    if (fractalApp.showCriticalLine !== undefined) {
        fractalApp.showCriticalLine = !fractalApp.showCriticalLine;
        criticalLineToggle.classList.toggle('active', fractalApp.showCriticalLine);
        log(`Critical line: ${fractalApp.showCriticalLine ? 'ON' : 'OFF'}`);
        fractalApp.draw();
    }
}

function handleAnalyticExtToggle() {
    if (fractalApp.useAnalyticExtension !== undefined) {
        fractalApp.useAnalyticExtension = !fractalApp.useAnalyticExtension;
        analyticExtToggle.classList.toggle('active', fractalApp.useAnalyticExtension);
        log(`Analytic Extension: ${fractalApp.useAnalyticExtension ? 'ON' : 'OFF'}`);
        fractalApp.draw();
    }
}

function handleAxesToggle() {
    toggleAxes();
}

/**
 * Toggles the axes overlay on/off
 */
export function toggleAxes() {
    if (fractalMode !== FRACTAL_TYPE.RIEMANN) return;

    axesVisible = !axesVisible;
    if (axesToggle) {
        axesToggle.classList.toggle('active', axesVisible);
    }
    if (axesVisible) {
        showAxes();
    } else {
        hideAxes();
    }
    log(`Axes: ${axesVisible ? 'ON' : 'OFF'}`);
}

/**
 * Shows the axes overlay and draws coordinate grid
 */
function showAxes() {
    if (!axesCanvas || !axesCtx) return;

    axesCanvas.width = window.innerWidth;
    axesCanvas.height = window.innerHeight;
    axesCanvas.classList.remove('axes-hidden');

    drawAxesFull();
}

/**
 * Hides the axes overlay
 */
function hideAxes() {
    if (axesCanvas) {
        axesCanvas.classList.add('axes-hidden');
    }
    axesVisible = false;
    if (axesToggle) {
        axesToggle.classList.remove('active');
    }
}

function handleZetaPathToggle() {
    toggleZetaPath();
}

/**
 * Toggles the zeta path overlay on/off
 */
export function toggleZetaPath() {
    if (fractalMode !== FRACTAL_TYPE.RIEMANN) return;

    const visible = zetaPathOverlay.toggle();
    if (zetaPathToggle) {
        zetaPathToggle.classList.toggle('active', visible);
    }
}

/**
 * Updates zeta path when view changes
 */
export function updateZetaPath() {
    if (fractalMode !== FRACTAL_TYPE.RIEMANN) return;
    zetaPathOverlay.update();
}

/**
 * Draws the coordinate axes with numbers
 */
function drawAxesFull() {
    if (!axesCtx || !axesCanvas || !fractalApp) return;

    const width = axesCanvas.width;
    const height = axesCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Clear canvas
    axesCtx.clearRect(0, 0, width, height);

    // Get current view parameters
    const pan = fractalApp.pan;
    const zoom = fractalApp.zoom;

    // Calculate visible range (matching shader: uv = (fragCoord - 0.5*res) / res.y)
    const aspect = width / height;
    const halfWidth = zoom * aspect / 2;
    const halfHeight = zoom / 2;
    const left = pan[0] - halfWidth;
    const right = pan[0] + halfWidth;
    const top = pan[1] + halfHeight;
    const bottom = pan[1] - halfHeight;

    // Determine good tick spacing based on zoom
    const tickSpacing = getTickSpacing(zoom);

    // Pixels per fractal unit (matching shader coordinate system)
    const scale = height / zoom;

    // Calculate main axis positions first (needed for label placement)
    const realAxisY = centerY - (0 - pan[1]) * scale;  // Im=0 line (horizontal)
    const imagAxisX = centerX + (0 - pan[0]) * scale;  // Re=0 line (vertical)

    // Clamp label positions to stay on screen with padding
    const labelPadding = 20;
    const realAxisLabelY = Math.max(labelPadding, Math.min(height - labelPadding, realAxisY));
    const imagAxisLabelX = Math.max(labelPadding + 30, Math.min(width - labelPadding - 30, imagAxisX));

    // Style for grid lines (subtle)
    axesCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    axesCtx.lineWidth = 1;
    axesCtx.font = '14px monospace';
    axesCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';

    // Draw vertical grid lines (real axis values) with labels along real axis
    axesCtx.textAlign = 'center';
    axesCtx.textBaseline = 'top';
    const startX = Math.ceil(left / tickSpacing) * tickSpacing;
    for (let x = startX; x <= right; x += tickSpacing) {
        const screenX = centerX + (x - pan[0]) * scale;
        // Draw tick line
        axesCtx.beginPath();
        axesCtx.moveTo(screenX, 0);
        axesCtx.lineTo(screenX, height);
        axesCtx.stroke();

        // Draw label along the real axis (Im=0), skip zero
        if (Math.abs(x) > tickSpacing * 0.1) {
            const label = formatAxisNumber(x);
            axesCtx.fillText(label, screenX, realAxisLabelY + 5);
        }
    }

    // Draw horizontal grid lines (imaginary axis values) with labels along imaginary axis
    axesCtx.textAlign = 'left';
    axesCtx.textBaseline = 'middle';
    const startY = Math.ceil(bottom / tickSpacing) * tickSpacing;
    for (let y = startY; y <= top; y += tickSpacing) {
        const screenY = centerY - (y - pan[1]) * scale;
        // Draw tick line
        axesCtx.beginPath();
        axesCtx.moveTo(0, screenY);
        axesCtx.lineTo(width, screenY);
        axesCtx.stroke();

        // Draw label along the imaginary axis (Re=0), skip zero
        if (Math.abs(y) > tickSpacing * 0.1) {
            const label = formatAxisNumber(y) + 'i';
            axesCtx.fillText(label, imagAxisLabelX + 5, screenY);
        }
    }

    // Draw main axes (thicker, more visible)
    axesCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    axesCtx.lineWidth = 2;

    // Real axis (horizontal through Im=0)
    axesCtx.beginPath();
    axesCtx.moveTo(0, realAxisY);
    axesCtx.lineTo(width, realAxisY);
    axesCtx.stroke();

    // Imaginary axis (vertical through Re=0)
    axesCtx.beginPath();
    axesCtx.moveTo(imagAxisX, 0);
    axesCtx.lineTo(imagAxisX, height);
    axesCtx.stroke();

    // Draw origin label
    axesCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    axesCtx.textAlign = 'left';
    axesCtx.textBaseline = 'top';
    axesCtx.fillText('0', imagAxisX + 5, realAxisY + 5);
}

/**
 * Calculates appropriate tick spacing based on zoom level
 */
function getTickSpacing(zoom) {
    const idealTicks = 8;
    const rawSpacing = zoom / idealTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawSpacing)));
    const normalized = rawSpacing / magnitude;

    if (normalized < 1.5) return magnitude;
    if (normalized < 3.5) return 2 * magnitude;
    if (normalized < 7.5) return 5 * magnitude;
    return 10 * magnitude;
}

/**
 * Formats axis number for display
 */
function formatAxisNumber(n) {
    if (Number.isInteger(n)) return n.toString();
    if (Math.abs(n) < 0.01 || Math.abs(n) >= 1000) {
        return n.toExponential(1);
    }
    return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Updates axes when view changes
 */
export function updateAxes() {
    if (!axesVisible || fractalMode !== FRACTAL_TYPE.RIEMANN || !fractalApp) return;
    drawAxesFull();
}

function handleFreqRChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.frequency[0] = value;
    freqRValue.textContent = value.toFixed(1);
    fractalApp.draw();
}

function handleFreqGChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.frequency[1] = value;
    freqGValue.textContent = value.toFixed(1);
    fractalApp.draw();
}

function handleFreqBChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.frequency[2] = value;
    freqBValue.textContent = value.toFixed(1);
    fractalApp.draw();
}

function handleContourChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.contourStrength = value;
    contourValue.textContent = value.toFixed(2);
    fractalApp.draw();
}

function handleTermsChange(e) {
    const value = parseInt(e.target.value, 10);
    fractalApp.seriesTerms = value;
    termsValue.textContent = value.toString();
    fractalApp.draw();
}

/**
 * Shows the view info overlay with information about the current view/point
 * Works for both Zeta Tour points (with descriptions) and Demo presets (just title)
 * @param {Object} preset - The preset/point with id or name, pan, and optional description
 * @param {number} index - The current index (0-based)
 * @param {number} total - Total number of items
 * @param {boolean} [isRiemann=false] - Whether this is Riemann mode (show coordinates differently)
 */
function showViewInfo(preset, index, total, isRiemann = false) {
    if (!viewInfoOverlay) return;

    // Get the title - use 'name' for tour points, 'id' for regular presets
    const title = preset.name || preset.id || 'View';

    // Get palette color from preset's paletteId
    let accentColor = null;
    if (preset.paletteId && fractalApp?.PALETTES) {
        const palette = fractalApp.PALETTES.find(p => p.id === preset.paletteId);
        if (palette?.keyColor) {
            accentColor = palette.keyColor;
        }
    }

    // Apply accent color to overlay elements
    if (accentColor) {
        viewInfoOverlay.style.borderColor = accentColor;
        if (viewInfoTitle) viewInfoTitle.style.color = accentColor;
    } else {
        // Reset to default CSS values
        viewInfoOverlay.style.borderColor = '';
        if (viewInfoTitle) viewInfoTitle.style.color = '';
    }

    if (viewInfoTitle) {
        viewInfoTitle.textContent = title;
    }

    if (viewInfoValue) {
        const viewType = preset.type || '';
        // Only show "s = ..." for single point types (nontrivial, special, pole, gram)
        const singlePointTypes = ['nontrivial', 'special', 'pole', 'gram'];
        if (isRiemann && preset.pan && singlePointTypes.includes(viewType)) {
            // Format Riemann coordinates
            const re = preset.pan[0];
            const im = preset.pan[1];
            if (im === 0) {
                viewInfoValue.textContent = `s = ${re}`;
            } else if (re === 0.5) {
                viewInfoValue.textContent = `s = 1/2 + ${im}i`;
            } else {
                viewInfoValue.textContent = `s = ${re} + ${im}i`;
            }
            viewInfoValue.style.display = '';
        } else {
            // Hide value for non-single-point views and non-Riemann modes
            viewInfoValue.style.display = 'none';
        }
    }

    if (viewInfoDescription) {
        if (preset.description) {
            viewInfoDescription.textContent = preset.description;
            viewInfoDescription.style.display = '';
        } else {
            viewInfoDescription.style.display = 'none';
        }
    }

    if (viewInfoCurrent) {
        viewInfoCurrent.textContent = (index + 1).toString();
    }

    if (viewInfoTotal) {
        viewInfoTotal.textContent = total.toString();
    }

    viewInfoOverlay.classList.remove('view-info-hidden');

    // Show appropriate marker based on view type (Riemann only)
    if (isRiemann) {
        // Hide all markers first
        hideAllMarkers();

        const viewType = preset.type || '';

        // Apply accent color to all marker types
        const setMarkerColor = (element) => {
            if (accentColor) {
                element.style.setProperty('--accent-color', accentColor);
            } else {
                element.style.removeProperty('--accent-color');
            }
        };

        if (viewType === 'symmetry') {
            // Vertical line marker for symmetry/critical line views
            if (lineMarker) {
                setMarkerColor(lineMarker);
                if (lineMarkerLabel) {
                    lineMarkerLabel.textContent = 'Re(s) = 1/2';
                }
                lineMarker.classList.remove('line-marker-hidden');
            }
        } else if (viewType === 'axis') {
            // Horizontal line marker for the real axis (Im(s) = 0)
            if (hLineMarker) {
                setMarkerColor(hLineMarker);
                if (hLineMarkerLabel) {
                    hLineMarkerLabel.textContent = 'Im(s) = 0';
                }
                updateHLineMarkerPosition();
                hLineMarker.classList.remove('hline-marker-hidden');
            }
        } else if (viewType === 'overview') {
            // Region marker for overview views - wraps the critical strip (0 < Re(s) < 1)
            if (regionMarker) {
                setMarkerColor(regionMarker);
                updateRegionMarkerPosition();
                regionMarker.classList.remove('region-marker-hidden');
            }
        } else if (viewType === 'trivial') {
            // Segment marker for trivial zeros - multiple points at -2, -4, -6, etc.
            if (segmentMarker) {
                setMarkerColor(segmentMarker);
                updateSegmentMarkerPosition(accentColor);
                segmentMarker.classList.remove('segment-marker-hidden');
            }
        } else if (viewType === 'saddle') {
            // Pair marker for saddle points - two individual points
            if (pairMarker) {
                setMarkerColor(pairMarker);
                updatePairMarkerPosition(preset);
                pairMarker.classList.remove('pair-marker-hidden');
            }
        } else {
            // Point marker for all specific point types (nontrivial, special, pole, gram)
            if (pointMarker) {
                setMarkerColor(pointMarker);
                pointMarker.classList.remove('point-marker-hidden');
            }
        }
    }
}

/**
 * Updates the horizontal line marker position to show the real axis (Im(s) = 0).
 * The line spans the entire viewport width at the y-coordinate of the real axis.
 */
function updateHLineMarkerPosition() {
    if (!hLineMarker || !fractalApp) return;

    const canvas = fractalApp.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Line spans full width
    hLineMarker.style.width = `${width}px`;
    hLineMarker.style.left = '0';

    // Position vertically at Im(s) = 0
    const fractalY = 0;
    const normalizedY = (fractalY - fractalApp.pan[1]) / fractalApp.zoom;
    const screenY = (0.5 - normalizedY) * height;
    hLineMarker.style.top = `${screenY}px`;
}

/**
 * Updates the region marker position to wrap the critical strip (0 < Re(s) < 1).
 * The marker spans from x=0 to x=1 in fractal coordinates, full height of viewport.
 */
function updateRegionMarkerPosition() {
    if (!regionMarker || !fractalApp) return;

    const canvas = fractalApp.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const aspect = width / height;

    // Calculate screen X positions for fractal x=0 and x=1
    // Formula: screenX = ((fractalX - pan[0]) / zoom / aspect + 0.5) * width
    const screenX0 = ((0 - fractalApp.pan[0]) / fractalApp.zoom / aspect + 0.5) * width;
    const screenX1 = ((1 - fractalApp.pan[0]) / fractalApp.zoom / aspect + 0.5) * width;

    // Calculate left position and width
    const left = Math.max(0, screenX0);
    const right = Math.min(width, screenX1);
    const markerWidth = right - left;

    // If strip is off-screen, hide marker
    if (markerWidth <= 0 || right <= 0 || left >= width) {
        regionMarker.style.width = '0';
        return;
    }

    // Position the marker
    regionMarker.style.left = `${left}px`;
    regionMarker.style.width = `${markerWidth}px`;
    regionMarker.style.top = '0';
    regionMarker.style.height = '100vh';
    regionMarker.style.transform = 'none';
}

/**
 * Updates the segment marker to show trivial zeros at -2, -4, -6, etc.
 * Creates/updates multiple point markers along the negative real axis.
 * @param {string} accentColor - The accent color for the markers
 */
function updateSegmentMarkerPosition(accentColor) {
    if (!segmentMarker || !fractalApp) return;

    const canvas = fractalApp.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const aspect = width / height;

    // Clear existing points
    segmentMarker.innerHTML = '';

    // Trivial zeros are at -2, -4, -6, -8, ... (negative even integers)
    // Show zeros that are visible in the current viewport
    const trivialZeros = [-2, -4, -6, -8, -10, -12, -14, -16, -18, -20];

    for (const zeroX of trivialZeros) {
        // Convert fractal coordinates to screen coordinates
        const normalizedX = (zeroX - fractalApp.pan[0]) / fractalApp.zoom;
        const screenX = (normalizedX / aspect + 0.5) * width;

        // Y coordinate is always 0 for trivial zeros (on real axis)
        const normalizedY = (0 - fractalApp.pan[1]) / fractalApp.zoom;
        const screenY = (0.5 - normalizedY) * height;

        // Only show if within viewport (with some margin)
        if (screenX >= -50 && screenX <= width + 50 && screenY >= -50 && screenY <= height + 50) {
            const point = document.createElement('div');
            point.className = 'segment-marker-point';
            point.style.left = `${screenX}px`;
            point.style.top = `${screenY}px`;
            if (accentColor) {
                point.style.setProperty('--accent-color', accentColor);
            }

            const ring = document.createElement('div');
            ring.className = 'segment-marker-ring';

            const dot = document.createElement('div');
            dot.className = 'segment-marker-dot';

            // No labels - axis already shows the values
            point.appendChild(ring);
            point.appendChild(dot);
            segmentMarker.appendChild(point);
        }
    }
}

/**
 * Updates the pair marker to show two saddle points.
 * Saddle points (zeros of ζ'(s)) come in pairs.
 * @param {Object} preset - The current preset containing pan coordinates and optional saddle point data
 */
function updatePairMarkerPosition(preset) {
    if (!pairMarker || !fractalApp) return;

    const canvas = fractalApp.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const aspect = width / height;

    // Get the two point elements
    const point1 = pairMarker.querySelector('.pair-marker-point-1');
    const point2 = pairMarker.querySelector('.pair-marker-point-2');

    if (!point1 || !point2) return;

    // Use preset.points if available, otherwise use default saddle point pair
    // First pair of non-real saddle points: approximately at Re ≈ 0.5 and Re ≈ 2.46 with Im ≈ 6.29
    // View centered at [1, 9.0858] with zoom 10 - use positions from preset or calculate
    const points = preset.points || [
        { re: 0.5, im: 9.0858 },
        { re: 2.0, im: 9.0858 }
    ];
    const saddle1 = points[0] || { re: 0.5, im: 9.0858 };
    const saddle2 = points[1] || { re: 2.0, im: 9.0858 };

    // Convert fractal coordinates to screen coordinates for point 1
    const normalizedX1 = (saddle1.re - fractalApp.pan[0]) / fractalApp.zoom;
    const screenX1 = (normalizedX1 / aspect + 0.5) * width;
    const normalizedY1 = (saddle1.im - fractalApp.pan[1]) / fractalApp.zoom;
    const screenY1 = (0.5 - normalizedY1) * height;

    point1.style.left = `${screenX1}px`;
    point1.style.top = `${screenY1}px`;

    // Convert fractal coordinates to screen coordinates for point 2
    const normalizedX2 = (saddle2.re - fractalApp.pan[0]) / fractalApp.zoom;
    const screenX2 = (normalizedX2 / aspect + 0.5) * width;
    const normalizedY2 = (saddle2.im - fractalApp.pan[1]) / fractalApp.zoom;
    const screenY2 = (0.5 - normalizedY2) * height;

    point2.style.left = `${screenX2}px`;
    point2.style.top = `${screenY2}px`;
}

/**
 * Hides all marker types (point, line, region, segment, pair)
 */
function hideAllMarkers() {
    if (pointMarker) {
        pointMarker.classList.add('point-marker-hidden');
    }
    if (lineMarker) {
        lineMarker.classList.add('line-marker-hidden');
    }
    if (hLineMarker) {
        hLineMarker.classList.add('hline-marker-hidden');
    }
    if (regionMarker) {
        regionMarker.classList.add('region-marker-hidden');
    }
    if (segmentMarker) {
        segmentMarker.classList.add('segment-marker-hidden');
    }
    if (pairMarker) {
        pairMarker.classList.add('pair-marker-hidden');
    }
}

/**
 * Hides the view info overlay and all markers.
 * Called when user interacts with the view (pan/zoom/etc) making preset info inaccurate.
 */
export function hideViewInfo() {
    if (viewInfoOverlay) {
        viewInfoOverlay.classList.add('view-info-hidden');
    }
    hideAllMarkers();
}

/**
 * Syncs Riemann toggle button states with renderer state.
 * Called from hotkeyController after hotkey toggles.
 */
export function syncRiemannToggleStates() {
    if (fractalMode !== FRACTAL_TYPE.RIEMANN) return;

    if (criticalLineToggle && fractalApp.showCriticalLine !== undefined) {
        criticalLineToggle.classList.toggle('active', fractalApp.showCriticalLine);
    }

    if (analyticExtToggle && fractalApp.useAnalyticExtension !== undefined) {
        analyticExtToggle.classList.toggle('active', fractalApp.useAnalyticExtension);
    }

    if (zetaPathToggle) {
        zetaPathToggle.classList.toggle('active', zetaPathOverlay.isVisible());
    }
}

/**
 * Syncs all Riemann UI controls (sliders and toggles) with renderer state.
 * Called after reset to update UI to match default values.
 */
export function syncRiemannControls() {
    if (fractalMode !== FRACTAL_TYPE.RIEMANN) return;

    // Sync toggles
    if (criticalLineToggle) {
        criticalLineToggle.classList.toggle('active', fractalApp.showCriticalLine);
    }
    if (analyticExtToggle) {
        analyticExtToggle.classList.toggle('active', fractalApp.useAnalyticExtension);
    }
    if (zetaPathToggle) {
        zetaPathToggle.classList.toggle('active', zetaPathOverlay.isVisible());
    }

    // Sync frequency sliders
    if (freqRSlider) {
        freqRSlider.value = fractalApp.frequency[0];
        freqRValue.textContent = fractalApp.frequency[0].toFixed(1);
    }
    if (freqGSlider) {
        freqGSlider.value = fractalApp.frequency[1];
        freqGValue.textContent = fractalApp.frequency[1].toFixed(1);
    }
    if (freqBSlider) {
        freqBSlider.value = fractalApp.frequency[2];
        freqBValue.textContent = fractalApp.frequency[2].toFixed(1);
    }

    // Sync contour and terms sliders
    if (contourSlider) {
        contourSlider.value = fractalApp.contourStrength;
        contourValue.textContent = fractalApp.contourStrength.toFixed(2);
    }
    if (termsSlider) {
        termsSlider.value = fractalApp.seriesTerms;
        termsValue.textContent = fractalApp.seriesTerms.toString();
    }
}

// endregion -----------------------------------------------------------------------------------------------------------

// region > ROSSLER CONTROLS -------------------------------------------------------------------------------------------

/**
 * Initializes Rossler-specific UI controls
 */
function initRosslerControls() {
    if (!rosslerControls) return;

    // Show the controls
    rosslerControls.style.display = 'flex';

    // Initialize parameter sliders (a, b, c)
    if (rosslerASlider) {
        rosslerASlider.value = fractalApp.params[0];
        rosslerAValue.textContent = fractalApp.params[0].toFixed(2);
        rosslerASlider.addEventListener('input', handleRosslerAChange);
    }

    if (rosslerBSlider) {
        rosslerBSlider.value = fractalApp.params[1];
        rosslerBValue.textContent = fractalApp.params[1].toFixed(2);
        rosslerBSlider.addEventListener('input', handleRosslerBChange);
    }

    if (rosslerCSlider) {
        rosslerCSlider.value = fractalApp.params[2];
        rosslerCValue.textContent = fractalApp.params[2].toFixed(1);
        rosslerCSlider.addEventListener('input', handleRosslerCChange);
    }

    // Initialize frequency sliders
    if (rosslerFreqRSlider) {
        rosslerFreqRSlider.value = fractalApp.frequency[0];
        rosslerFreqRValue.textContent = fractalApp.frequency[0].toFixed(2);
        rosslerFreqRSlider.addEventListener('input', handleRosslerFreqRChange);
    }

    if (rosslerFreqGSlider) {
        rosslerFreqGSlider.value = fractalApp.frequency[1];
        rosslerFreqGValue.textContent = fractalApp.frequency[1].toFixed(2);
        rosslerFreqGSlider.addEventListener('input', handleRosslerFreqGChange);
    }

    if (rosslerFreqBSlider) {
        rosslerFreqBSlider.value = fractalApp.frequency[2];
        rosslerFreqBValue.textContent = fractalApp.frequency[2].toFixed(2);
        rosslerFreqBSlider.addEventListener('input', handleRosslerFreqBChange);
    }

    // Initialize iterations slider
    if (rosslerIterSlider) {
        const iters = fractalApp.targetIterations ?? fractalApp.DEFAULT_ITERATIONS ?? 10000;
        rosslerIterSlider.value = iters;
        rosslerIterValue.textContent = iters.toString();
        rosslerIterSlider.addEventListener('input', handleRosslerIterChange);
    }

    log('Initialized.', 'initRosslerControls');
}

/**
 * Destroys Rossler-specific UI controls and hides them
 */
function destroyRosslerControls() {
    if (rosslerControls) {
        rosslerControls.style.display = 'none';
    }

    // Remove event listeners
    if (rosslerASlider) rosslerASlider.removeEventListener('input', handleRosslerAChange);
    if (rosslerBSlider) rosslerBSlider.removeEventListener('input', handleRosslerBChange);
    if (rosslerCSlider) rosslerCSlider.removeEventListener('input', handleRosslerCChange);
    if (rosslerFreqRSlider) rosslerFreqRSlider.removeEventListener('input', handleRosslerFreqRChange);
    if (rosslerFreqGSlider) rosslerFreqGSlider.removeEventListener('input', handleRosslerFreqGChange);
    if (rosslerFreqBSlider) rosslerFreqBSlider.removeEventListener('input', handleRosslerFreqBChange);
    if (rosslerIterSlider) rosslerIterSlider.removeEventListener('input', handleRosslerIterChange);

    log('Destroyed.', 'destroyRosslerControls');
}

function handleRosslerAChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.params[0] = value;
    rosslerAValue.textContent = value.toFixed(2);
    fractalApp.draw();
}

function handleRosslerBChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.params[1] = value;
    rosslerBValue.textContent = value.toFixed(2);
    fractalApp.draw();
}

function handleRosslerCChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.params[2] = value;
    rosslerCValue.textContent = value.toFixed(1);
    fractalApp.draw();
}

function handleRosslerFreqRChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.frequency[0] = value;
    rosslerFreqRValue.textContent = value.toFixed(2);
    fractalApp.draw();
}

function handleRosslerFreqGChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.frequency[1] = value;
    rosslerFreqGValue.textContent = value.toFixed(2);
    fractalApp.draw();
}

function handleRosslerFreqBChange(e) {
    const value = parseFloat(e.target.value);
    fractalApp.frequency[2] = value;
    rosslerFreqBValue.textContent = value.toFixed(2);
    fractalApp.draw();
}

function handleRosslerIterChange(e) {
    const value = parseInt(e.target.value, 10);
    fractalApp.targetIterations = value;
    rosslerIterValue.textContent = value.toString();
    fractalApp.draw();
}

/**
 * Syncs Rossler control slider values with renderer state.
 * Called after reset and palette changes.
 */
export function syncRosslerControls() {
    if (fractalMode !== FRACTAL_TYPE.ROSSLER) return;

    // Sync parameter sliders
    if (rosslerASlider) {
        rosslerASlider.value = fractalApp.params[0];
        rosslerAValue.textContent = fractalApp.params[0].toFixed(2);
    }
    if (rosslerBSlider) {
        rosslerBSlider.value = fractalApp.params[1];
        rosslerBValue.textContent = fractalApp.params[1].toFixed(2);
    }
    if (rosslerCSlider) {
        rosslerCSlider.value = fractalApp.params[2];
        rosslerCValue.textContent = fractalApp.params[2].toFixed(1);
    }

    // Sync frequency sliders
    if (rosslerFreqRSlider) {
        rosslerFreqRSlider.value = fractalApp.frequency[0];
        rosslerFreqRValue.textContent = fractalApp.frequency[0].toFixed(2);
    }
    if (rosslerFreqGSlider) {
        rosslerFreqGSlider.value = fractalApp.frequency[1];
        rosslerFreqGValue.textContent = fractalApp.frequency[1].toFixed(2);
    }
    if (rosslerFreqBSlider) {
        rosslerFreqBSlider.value = fractalApp.frequency[2];
        rosslerFreqBValue.textContent = fractalApp.frequency[2].toFixed(2);
    }

    // Sync iterations slider
    if (rosslerIterSlider) {
        const iters = fractalApp.targetIterations ?? fractalApp.DEFAULT_ITERATIONS ?? 10000;
        rosslerIterSlider.value = iters;
        rosslerIterValue.textContent = iters.toString();
    }
}

// endregion -----------------------------------------------------------------------------------------------------------

function bindHTMLElements() {
    // Element binding
    fractalToggle = document.getElementById('fractal-toggle');
    fractalModesMenu = document.getElementById('fractal-modes');
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
    // Riemann Controls elements
    riemannControls = document.getElementById('riemannControls');
    riemannDisplayDropdown = document.getElementById('riemann-display-dropdown');
    riemannDisplayToggle = document.getElementById('riemann-display-toggle');
    riemannDisplayMenu = document.getElementById('riemann-display-menu');
    criticalLineToggle = document.getElementById('criticalLineToggle');
    analyticExtToggle = document.getElementById('analyticExtToggle');
    axesToggle = document.getElementById('axesToggle');
    axesCanvas = document.getElementById('axesCanvas');
    if (axesCanvas) {
        axesCtx = axesCanvas.getContext('2d');
    }
    zetaPathToggle = document.getElementById('zetaPathToggle');
    zetaPathCanvas = document.getElementById('zetaPathCanvas');
    freqRSlider = document.getElementById('freqRSlider');
    freqGSlider = document.getElementById('freqGSlider');
    freqBSlider = document.getElementById('freqBSlider');
    freqRValue = document.getElementById('freqRValue');
    freqGValue = document.getElementById('freqGValue');
    freqBValue = document.getElementById('freqBValue');
    contourSlider = document.getElementById('contourSlider');
    contourValue = document.getElementById('contourValue');
    termsSlider = document.getElementById('termsSlider');
    termsValue = document.getElementById('termsValue');
    viewInfoOverlay = document.getElementById('viewInfoOverlay');
    viewInfoTitle = document.getElementById('viewInfoTitle');
    viewInfoValue = document.getElementById('viewInfoValue');
    viewInfoDescription = document.getElementById('viewInfoDescription');
    viewInfoCurrent = document.getElementById('viewInfoCurrent');
    viewInfoTotal = document.getElementById('viewInfoTotal');
    pointMarker = document.getElementById('pointMarker');
    lineMarker = document.getElementById('lineMarker');
    lineMarkerLabel = lineMarker?.querySelector('.line-marker-label');
    hLineMarker = document.getElementById('hLineMarker');
    hLineMarkerLabel = hLineMarker?.querySelector('.hline-marker-label');
    regionMarker = document.getElementById('regionMarker');
    segmentMarker = document.getElementById('segmentMarker');
    pairMarker = document.getElementById('pairMarker');
    // Rossler Controls elements
    rosslerControls = document.getElementById('rosslerControls');
    rosslerASlider = document.getElementById('rosslerASlider');
    rosslerBSlider = document.getElementById('rosslerBSlider');
    rosslerCSlider = document.getElementById('rosslerCSlider');
    rosslerAValue = document.getElementById('rosslerAValue');
    rosslerBValue = document.getElementById('rosslerBValue');
    rosslerCValue = document.getElementById('rosslerCValue');
    rosslerFreqRSlider = document.getElementById('rosslerFreqRSlider');
    rosslerFreqGSlider = document.getElementById('rosslerFreqGSlider');
    rosslerFreqBSlider = document.getElementById('rosslerFreqBSlider');
    rosslerFreqRValue = document.getElementById('rosslerFreqRValue');
    rosslerFreqGValue = document.getElementById('rosslerFreqGValue');
    rosslerFreqBValue = document.getElementById('rosslerFreqBValue');
    rosslerIterSlider = document.getElementById('rosslerIterSlider');
    rosslerIterValue = document.getElementById('rosslerIterValue');
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

        initJuliaSliders(fractalApp);
        updateJuliaSliders();
        initDiveButtons();

        updateColorTheme(DEFAULT_JULIA_THEME_COLOR);
        updateFractalDropdownState(FRACTAL_TYPE.JULIA);
        // Darker backgrounds for Julia as it renders on white
        header.style.background = 'rgba(20, 20, 20, 0.8)';
        infoLabel.style.background = 'rgba(20, 20, 20, 0.8)';

        window.location.hash = '#julia'; // Update URL hash
    } else if (fractalRenderer instanceof RiemannRenderer) {
        fractalMode = FRACTAL_TYPE.RIEMANN;

        // Hide dives dropdown in Riemann mode
        if (divesDropdown) divesDropdown.style.display = 'none';
        if (demoButton) demoButton.style.display = 'inline-flex';
        if (persistSwitch) persistSwitch.style.display = 'none';

        initRiemannControls();
        updateFractalDropdownState(FRACTAL_TYPE.RIEMANN);

        // Initialize tour background music
        initTourAudio('./audio/riemann-tour.mp3');

        window.location.hash = '#zeta'; // Update URL hash
    } else if (fractalRenderer instanceof RosslerRenderer) {
        fractalMode = FRACTAL_TYPE.ROSSLER;

        // Hide dives dropdown
        if (divesDropdown) divesDropdown.style.display = 'none';
        if (persistSwitch) persistSwitch.style.display = 'none';

        initRosslerControls();
        updateFractalDropdownState(FRACTAL_TYPE.ROSSLER);

        window.location.hash = '#ross'; // Update URL hash
    } else {
        // Mandelbrot mode
        fractalMode = FRACTAL_TYPE.MANDELBROT;
        updateFractalDropdownState(FRACTAL_TYPE.MANDELBROT);
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