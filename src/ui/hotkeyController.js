/**
 * @module HotKeyController
 * @author Radim Brnka
 * @description Keyboard shortcuts controller attached to the UI
 * @link https://www.freecodecamp.org/news/javascript-keycode-list-keypress-event-key-codes/
 */

import {
    captureScreenshot,
    isAnimationActive,
    isJuliaMode,
    randomizeColors,
    reset,
    resetAppState,
    startJuliaDive,
    switchFractalMode,
    switchFractalModeWithPersistence,
    toggleDebugLines,
    toggleDebugMode,
    toggleDemo,
    toggleHeader,
    travelToPreset,
    updateColorTheme,
} from "./ui";
import {
    CONSOLE_GROUP_STYLE,
    CONSOLE_MESSAGE_STYLE,
    DEBUG_LEVEL,
    DEBUG_MODE,
    DEFAULT_MANDELBROT_THEME_COLOR,
    FF_PERSISTENT_FRACTAL_SWITCHING,
    FRACTAL_TYPE,
    JULIA_PALETTES,
    log,
    ROTATION_DIRECTION
} from "../global/constants";

//region CONSTANTS > ---------------------------------------------------------------------------------------------------
/**
 * Keys not allowed to work in animation mode
 * @type {string[]}
 */
const ANIMATION_KEYS_BLACKLIST = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyQ", "KeyW"]; // TODO consider allowing rotation in Julia mode as it doesnt collide with the demo mode

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
const JULIA_HOTKEY_C_STEP = .0005;

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
    //event.preventDefault();

    if (!DEBUG_MODE) {
        event.stopImmediatePropagation();
    }

    if (DEBUG_MODE) console.log(`%c onKeyDown: %c Pressed key/code ${event.shiftKey ? 'Shift + ' : ''}${event.ctrlKey ? 'CTRL + ' : ''}${event.altKey ? 'ALT + ' : ''}${event.code}/${event.key}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    const rotationSpeed = event.shiftKey ? ROTATION_ANIMATION_SMOOTH_STEP : ROTATION_ANIMATION_STEP;
    let rotationDirection = ROTATION_DIRECTION.CW;

    let deltaPanX = 0;
    let deltaPanY = 0;
    let deltaCx = 0;
    let deltaCy = 0;

    // Treat MAC Option button as Alt
    const altKey = event.altKey || event.code === 'Alt';

    if (isAnimationActive() && ANIMATION_KEYS_BLACKLIST.includes(event.code)) return;

    switch (event.code) {
        // TODO add shift/non-shift to slow down or speed up the rotation instead of stop.
        case 'KeyQ': // Rotation counter-clockwise
            rotationDirection = ROTATION_DIRECTION.CCW;
        case 'KeyW': // Rotation clockwise
            if (rotationActive) {
                fractalApp.stopCurrentRotationAnimation();
                rotationActive = false;
            } else {
                rotationActive = true;
                await fractalApp.animateInfiniteRotation(rotationDirection, rotationSpeed);
            }
            break;

        case 'KeyE': // Debug lines
            toggleDebugLines();
            break;

        case 'KeyR': // Reset
            if (event.shiftKey) await reset();
            break;

        case 'KeyL': // DEBUG BAR toggle
            if (DEBUG_MODE === DEBUG_LEVEL.FULL) toggleDebugMode();
            break;

        case 'KeyZ': // Switch between fractals with constant p/c
            if (!FF_PERSISTENT_FRACTAL_SWITCHING) break;

            await switchFractalModeWithPersistence(isJuliaMode() ? FRACTAL_TYPE.MANDELBROT : FRACTAL_TYPE.JULIA);
            break;

        case 'KeyT': // Random colors
            if (altKey) {
                if (isJuliaMode()) {
                    await fractalApp.animateInnerStopsTransition(
                        JULIA_PALETTES[0],
                        250,
                        updateColorTheme);
                } else {
                    await fractalApp.animateColorPaletteTransition(
                        DEFAULT_MANDELBROT_THEME_COLOR,
                        250,
                        updateColorTheme);
                }
            } else if (event.shiftKey) {
                if (fractalApp.currentColorAnimationFrame) {
                    fractalApp.stopCurrentColorAnimations();
                    break;
                }

                if (isJuliaMode()) {
                    await fractalApp.animateFullColorSpaceCycle(10000, updateColorTheme);
                } else {
                    await fractalApp.animateFullColorSpaceCycle(15000);
                }
            } else {
                await randomizeColors();
            }
            break;

        case 'KeyA': // Forced resize
            fractalApp.resizeCanvas();
            break;

        case 'KeyS': // Screenshot
            if (event.shiftKey) captureScreenshot();
            break;

        case 'KeyD': // Start/stop demo
            await toggleDemo();
            break;

        case 'KeyM': // Riemann Mode
            if (DEBUG_MODE === DEBUG_LEVEL.FULL) await switchFractalMode(FRACTAL_TYPE.RIEMANN);
            break;

        case 'KeyN':
            if (DEBUG_MODE) {
                log('Analytic Extension toggled.');
                fractalApp.useAnalyticExtension = !fractalApp.useAnalyticExtension;
                fractalApp.draw();
            }
            break;

        case "ArrowLeft":
            deltaPanX = altKey ? 0 : -(event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCx = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : 1)) : 0;
            break;

        case "ArrowRight":
            deltaPanX = altKey ? 0 : (event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCx = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? -JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : -1)) : 0;
            break;

        case "ArrowDown":
            deltaPanY = altKey ? 0 : -(event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCy = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? -JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : -1)) : 0;
            break;

        case "ArrowUp":
            deltaPanY = altKey ? 0 : (event.shiftKey ? PAN_SMOOTH_STEP : PAN_STEP);
            deltaCy = altKey ? (JULIA_HOTKEY_C_STEP * (event.shiftKey ? JULIA_HOTKEY_C_SMOOTH_MULTIPLIER : 1)) : 0;
            break;

        case "Space":
            const increment = event.shiftKey ? ZOOM_ANIMATION_SMOOTH_STEP : ZOOM_ANIMATION_STEP;
            const zoomFactor = (event.ctrlKey || altKey) ? (1 + increment) : (1 - increment);

            let targetZoom = fractalApp.zoom * zoomFactor; // TODO

            if (targetZoom > fractalApp.MAX_ZOOM && targetZoom < fractalApp.MIN_ZOOM) {
                await fractalApp.animateZoomTo(targetZoom, 20);
                resetAppState();
            }
            break;

        case "Enter":
            toggleHeader();
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
            }
            break;
    }

    // Handling pan changes
    if (deltaPanX || deltaPanY) {
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
        const effectiveDeltaCx = deltaCx * fractalApp.zoom;
        const effectiveDeltaCy = deltaCy * fractalApp.zoom;

        await fractalApp.animateToC([fractalApp.c[0] + effectiveDeltaCx, fractalApp.c[1] + effectiveDeltaCy], JULIA_HOTKEY_C_SPEED);
        resetAppState();
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

    console.log(`%c initHotKeys: %c Initialized.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
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