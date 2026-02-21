/**
 * @module HotKeyController
 * @author Radim Brnka
 * @description Keyboard shortcuts controller attached to the UI
 * @link https://www.freecodecamp.org/news/javascript-keycode-list-keypress-event-key-codes/
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {
    captureScreenshot,
    copyInfoToClipboard,
    cycleColors,
    cycleToNextDive,
    cycleToNextFractalMode,
    cycleToNextPreset,
    cycleToPreviousPreset,
    hideViewInfo,
    isAnimationActive,
    isJuliaMode,
    isRiemannMode,
    isRosslerMode,
    reset,
    resetAppState,
    showEditCoordsDialog,
    showQuickInfo,
    showSaveViewDialog,
    startJuliaDive,
    switchFractalMode,
    switchFractalTypeWithPersistence,
    syncRiemannControls,
    syncRiemannToggleStates,
    syncRosslerControls,
    toggleAxes,
    toggleCenterLines,
    toggleDebugMode,
    toggleDemo,
    toggleDoublePrecision,
    toggleHeader,
    toggleRiemannDisplayDropdown,
    toggleZetaPath,
    travelToPreset,
    updateColorTheme,
    updatePaletteCycleButtonState,
    updatePaletteDropdownState,
    updatePaletteDropdownStateWithInfo,
} from "./ui";
import {
    CONSOLE_GROUP_STYLE,
    CONSOLE_MESSAGE_STYLE,
    DEBUG_LEVEL,
    DEBUG_MODE,
    FF_PERSISTENT_FRACTAL_SWITCHING,
    FRACTAL_TYPE,
    log,
    ROTATION_DIRECTION
} from "../global/constants";
import {JuliaRenderer} from "../renderers/juliaRenderer";

//region CONSTANTS > ---------------------------------------------------------------------------------------------------
/**
 * Keys not allowed to work in animation mode
 * @type {string[]}
 */
const ANIMATION_KEYS_BLACKLIST = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyQ", "KeyW"];

/**
 * Pan movement animation duration
 * @type {number}
 */
const PAN_SPEED = 50;

/**
 * Pan step size per keystroke
 * @type {number}
 */
const PAN_STEP = .1;

/**
 * Smooth (Shift) pan step size per keystroke
 * @type {number}
 */
const PAN_SMOOTH_STEP = .01;

/**
 * Normal rotation animation step size
 * @type {number}
 */
const ROTATION_ANIMATION_STEP = .1;

/**
 * Smooth rotation animation step size
 * @type {number}
 */
const ROTATION_ANIMATION_SMOOTH_STEP = .01;

/**
 * Zoom step per keystroke
 * @type {number}
 */
const ZOOM_ANIMATION_STEP = .1;

/**
 * Smooth (Shift) zoom step per keystroke
 * @type {number}
 */
const ZOOM_ANIMATION_SMOOTH_STEP = .01;

/**
 * Smooth stepping: step size
 * @type {number}
 */
const JULIA_HOTKEY_C_STEP = .001;

/**
 * Super smooth stepping multiplier (SHIFT)
 * @type {number}
 */
const JULIA_HOTKEY_C_SMOOTH_MULTIPLIER = .1;

/**
 * Smooth stepping: animation duration
 * @type {number}
 */
const JULIA_HOTKEY_C_SPEED = 10;
//endregion ------------------------------------------------------------------------------------------------------------

let rotationActive = false;
let initialized = false;
let fractalApp;

/**
 * Keydown event handler
 * @param {KeyboardEvent} event
 * @return {Promise<void>}
 */
async function onKeyDown(event) {

    // Do not steal hotkeys from user input fields (search boxes, text inputs, etc.)
    // But allow hotkeys when range sliders are focused
    const target = /** @type {HTMLElement|null} */ (event.target);
    const tag = target?.tagName?.toLowerCase();
    const inputType = target?.type?.toLowerCase();
    const isTypingTarget =
        !!target &&
        (
            (tag === 'input' && inputType !== 'range') ||
            tag === 'textarea' ||
            tag === 'select' ||
            target.isContentEditable
        );

    if (isTypingTarget) return;

    if (DEBUG_MODE) console.log(`%c onKeyDown: %c Pressed key/code ${event.shiftKey ? 'Shift + ' : ''}${event.ctrlKey ? 'CTRL + ' : ''}${event.altKey ? 'ALT + ' : ''}${event.code}/${event.key}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    let handled = false;

    const rotationSpeed = event.shiftKey ? ROTATION_ANIMATION_SMOOTH_STEP : ROTATION_ANIMATION_STEP;
    let rotationDirection = ROTATION_DIRECTION.CW;

    let deltaPanX = 0;
    let deltaPanY = 0;
    let deltaCx = 0;
    let deltaCy = 0;

    // Treat MAC Option button as Alt
    const altKey = event.altKey || event.code === 'Alt';

    if (isAnimationActive() && ANIMATION_KEYS_BLACKLIST.includes(event.code)) {
        event.preventDefault();
        return;
    }
    switch (event.code) {
        // TODO add shift/non-shift to slow down or speed up the rotation instead of stop.
        case 'KeyQ': // Rotation counter-clockwise
            rotationDirection = ROTATION_DIRECTION.CCW;
        case 'KeyW': // Rotation clockwise
            // Disable rotation in Riemann mode (breaks axes alignment)
            if (isRiemannMode()) break;
            if (rotationActive) {
                fractalApp.stopCurrentRotationAnimation();
                rotationActive = false;
            } else {
                // Hide preset overlay on interaction (no longer accurate)
                hideViewInfo();
                rotationActive = true;
                await fractalApp.animateInfiniteRotation(rotationDirection, rotationSpeed);
            }
            handled = true;
            break;

        case 'KeyE': // Edit coords dialog
            showEditCoordsDialog();
            handled = true;
            break;

        case 'KeyR': // Reset
            if (event.shiftKey) {
                fractalApp.resizeCanvas();
            } else {
                await reset();
            }
            handled = true;
            break;

        case 'KeyL': // DEBUG BAR toggle
            toggleDebugMode();
            handled = true;
            break;

        case 'KeyK': // Debug lines
            toggleCenterLines();
            handled = true;
            break;

        case 'KeyO': // Switch between fractals with constant p/c OR toggle zeta path
            // In Riemann mode, Z toggles zeta path
            if (isRiemannMode()) {
                toggleZetaPath();
                handled = true;
                break;
            }
            // In Mandelbrot/Julia mode, Z switches between them with persistence
            if (!FF_PERSISTENT_FRACTAL_SWITCHING) break;
            await switchFractalTypeWithPersistence(isJuliaMode() ? FRACTAL_TYPE.MANDELBROT : FRACTAL_TYPE.JULIA);
            handled = true;
            break;

        case 'KeyP': // Random colors / cycle palettes
            if (altKey) {
                // Alt+P: Reset to first palette (matches UI button behavior)
                if (fractalApp.paletteCyclingActive) {
                    fractalApp.stopCurrentColorAnimations();
                }
                await fractalApp.applyPaletteByIndex(0, 250, updateColorTheme);
                updatePaletteDropdownState();
                updatePaletteCycleButtonState();
                syncRiemannControls();
                syncRosslerControls();
                // Show quick info for reset palette
                const palette = fractalApp.PALETTES?.[0];
                if (palette) {
                    showQuickInfo(palette.id, null, palette.keyColor);
                }
            } else if (event.shiftKey) {
                // Shift+P: Toggle palette cycling
                if (fractalApp.paletteCyclingActive) {
                    // Stop cycling
                    fractalApp.stopCurrentColorAnimations();
                    syncRiemannControls();
                    syncRosslerControls();
                } else {
                    // Start cycling
                    fractalApp.startPaletteCycling(2000, 3000, updateColorTheme, updatePaletteDropdownStateWithInfo);
                }
                updatePaletteCycleButtonState();
            } else {
                // T: Cycle to next palette
                await cycleColors();
            }
            handled = true;
            break;

        case 'KeyA': // Toggle AdaptQ
            fractalApp.toggleAdaptiveQuality();
            handled = true;
            break;

        case 'KeyC': // Copy info / Capture screenshot
            if (event.ctrlKey) {
                copyInfoToClipboard();
            } else {
                captureScreenshot();
            }
            handled = true;
            break;

        case 'KeyS': // Save View
            showSaveViewDialog();
            handled = true;
            break;

        case 'KeyB': // Julia legacy renderer toggle / Riemann precision toggle
            if (isJuliaMode() && DEBUG_MODE === DEBUG_LEVEL.FULL) {
                JuliaRenderer.FF_LEGACY_JULIA_RENDERER = !JuliaRenderer.FF_LEGACY_JULIA_RENDERER
                await switchFractalMode(FRACTAL_TYPE.JULIA);
            } else if (isRiemannMode()) {
                toggleDoublePrecision();
            }
            handled = true;
            break;

        case 'KeyT': // Start/stop demo
            await toggleDemo();
            handled = true;
            break;

        case 'KeyM': // Toggle analytic extension (Riemann mode)
            if (isRiemannMode() && fractalApp.useAnalyticExtension !== undefined) {
                fractalApp.useAnalyticExtension = !fractalApp.useAnalyticExtension;
                log(`Analytic Extension: ${fractalApp.useAnalyticExtension ? 'ON' : 'OFF'}`);
                fractalApp.draw();
                syncRiemannToggleStates();
            }
            handled = true;
            break;

        case 'Comma': // Toggle critical line (Riemann mode)
            if (isRiemannMode() && fractalApp.showCriticalLine !== undefined) {
                fractalApp.showCriticalLine = !fractalApp.showCriticalLine;
                log(`Critical line: ${fractalApp.showCriticalLine ? 'ON' : 'OFF'}`);
                fractalApp.draw();
                syncRiemannToggleStates();
            }
            handled = true;
            break;

        case 'KeyN': // Toggle axes (Riemann mode)
            toggleAxes();
            handled = true;
            break;


        case 'KeyV': // Cycle to next view/preset
            await cycleToNextPreset();
            handled = true;
            break;

        case 'KeyF': // Cycle fractal mode / Toggle adaptive quality (Shift)
            await cycleToNextFractalMode();
            handled = true;
            break;

        case 'NumpadAdd': // Numpad + (Shift for soft step)
        case 'Equal': // = or + key
            if (isRiemannMode()) {
                // Adjust series terms in Riemann mode
                const step = event.shiftKey ? 10 : 50;
                fractalApp.seriesTerms = Math.min(fractalApp.MAX_TERMS, fractalApp.seriesTerms + step);
                syncRiemannControls();
                fractalApp.draw();
            } else if (isRosslerMode()) {
                // Adjust target iterations in Rossler mode
                const step = event.shiftKey ? 100 : 500;
                fractalApp.targetIterations = Math.min(fractalApp.MAX_ITER, fractalApp.targetIterations + step);
                syncRosslerControls();
                fractalApp.draw();
            } else {
                fractalApp.adjustExtraIterations(event.shiftKey ? 25 : 100);
            }
            handled = true;
            break;

        case 'NumpadSubtract': // Numpad - (Shift for soft step)
        case 'Minus': // - key
            if (isRiemannMode()) {
                // Adjust series terms in Riemann mode
                const step = event.shiftKey ? 10 : 50;
                fractalApp.seriesTerms = Math.max(20, fractalApp.seriesTerms - step);
                syncRiemannControls();
                fractalApp.draw();
            } else if (isRosslerMode()) {
                // Adjust target iterations in Rossler mode
                const step = event.shiftKey ? 100 : 500;
                fractalApp.targetIterations = Math.max(1000, fractalApp.targetIterations - step);
                syncRosslerControls();
                fractalApp.draw();
            } else {
                fractalApp.adjustExtraIterations(event.shiftKey ? -25 : -100);
            }
            handled = true;
            break;

        case 'KeyD': // Cycle dives (Julia) / Toggle display dropdown (Riemann) / Edit coords (others)
            if (isJuliaMode()) {
                await cycleToNextDive();
            } else if (isRiemannMode()) {
                toggleRiemannDisplayDropdown();
            }
            handled = true;
            break;

        case "ArrowLeft":
            deltaPanX = altKey ? 0 : -(event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCx = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : 1)) : 0;
            handled = true;
            break;

        case "ArrowRight":
            deltaPanX = altKey ? 0 : (event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCx = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? -JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : -1)) : 0;
            handled = true;
            break;

        case "ArrowDown":
            deltaPanY = altKey ? 0 : -(event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCy = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? -JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : -1)) : 0;
            handled = true;
            break;

        case "ArrowUp":
            deltaPanY = altKey ? 0 : (event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCy = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : 1)) : 0;
            handled = true;
            break;

        case "Space":
            // Hide preset overlay on interaction (no longer accurate)
            hideViewInfo();

            const increment = event.shiftKey ? ZOOM_ANIMATION_SMOOTH_STEP : ZOOM_ANIMATION_STEP;
            const zoomFactor = (event.ctrlKey || altKey) ? (1 + increment) : (1 - increment);

            let targetZoom = fractalApp.zoom * zoomFactor;

            if (targetZoom >= fractalApp.MAX_ZOOM && targetZoom <= fractalApp.MIN_ZOOM) {
                // Use animateZoomToNoPan to preserve DD pan precision at deep zooms
                await fractalApp.animateZoomToNoPan(targetZoom, 20);
                resetAppState();
            }
            handled = true;
            break;

        case "Enter":
            toggleHeader();
            handled = true;
            break;

        case "PageDown": // Next preset
            await cycleToNextPreset();
            handled = true;
            break;

        case "PageUp": // Previous preset
            await cycleToPreviousPreset();
            handled = true;
            break;

        default: // Case nums and others:
            const match = event.code.match(/^(Digit|Numpad)(\d)$/);
            if (match) {
                const index = parseInt(match[2], 0); // match[2] contains the digit pressed
                if (event.shiftKey && isJuliaMode()) {
                    await startJuliaDive(fractalApp.DIVES, index);
                } else {
                    await travelToPreset(fractalApp.PRESETS, index);
                }
                handled = true;
            }
            break;
    }

    // Handling pan changes
    if (deltaPanX || deltaPanY) {
        // Hide preset overlay on interaction (no longer accurate)
        hideViewInfo();
        let r = fractalApp.rotation;

        // Reflect the zoom factor for consistent pan speed at different zoom levels
        const effectiveDeltaX = (deltaPanX * fractalApp.zoom) * Math.cos(r) - (deltaPanY * fractalApp.zoom) * Math.sin(r);
        const effectiveDeltaY = (deltaPanX * fractalApp.zoom) * Math.sin(r) + (deltaPanY * fractalApp.zoom) * Math.cos(r);

        await fractalApp.animatePanBy([effectiveDeltaX, effectiveDeltaY], PAN_SPEED);
        fractalApp.noteInteraction(160);

        resetAppState();
    }

    // Handling C changes
    if ((deltaCx || deltaCy) && isJuliaMode()) {
        // Hide preset overlay on interaction (no longer accurate)
        hideViewInfo();

        const effectiveDeltaCx = deltaCx * fractalApp.zoom;
        const effectiveDeltaCy = deltaCy * fractalApp.zoom;

        await fractalApp.animateToC([fractalApp.c[0] + effectiveDeltaCx, fractalApp.c[1] + effectiveDeltaCy], JULIA_HOTKEY_C_SPEED);
        resetAppState();
    }

    if (handled) {
        event.preventDefault();
    }
}

/**
 * Initializes the keyboard event listener
 * @param {FractalRenderer} app
 */
export function initHotKeys(app) {
    if (initialized) {
        console.warn(`%c initHotKeys: %c Redundant initialization skipped!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    fractalApp = app;
    document.addEventListener("keydown", onKeyDown);
    initialized = true;

    log('Initialized.', 'initHotKeys');
}

/** Destructor. Removes event listeners and cleans up */
export function destroyHotKeys() {
    if (!initialized) {
        console.warn(`%c destroyHotKeys: %c Nothing to destroy!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    fractalApp = null;
    initialized = false;

    document.removeEventListener("keydown", onKeyDown);

    console.log(`%c destroyHotKeys: %c Destroyed.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}