/**
 * @module Constants
 * @author Radim Brnka
 * @description Global constants used across the app.
 */

import {easeInOut, easeInOutCubic, easeInOutQuint, hexToRGBArray} from "./utils";
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const DEBUG_LEVEL = {
    NONE: 0,
    VERBOSE: 1,
    FULL: 2
}

/**
 * DEBUG MODE. Set to false for prod deployment!
 * @type {DEBUG_LEVEL}
 */
export const DEBUG_MODE = DEBUG_LEVEL.NONE;
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FEATURE FLAGS
/** Allows switching between fractal while keeping the params to allow Mandelbrot and Julia to match each other */
export const FF_PERSISTENT_FRACTAL_SWITCHING = true;

/** Enables bottom bar for user input for custom coords */
export const FF_USER_INPUT_ALLOWED = false;
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Application name
 * @type {string}
 */
export const APP_NAME = 'Synaptory Fractal Traveler';
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Enum of fractal types
 * @enum {number}
 */
export const FRACTAL_TYPE = {
    MANDELBROT: 0,
    JULIA: 1,
    RIEMANN: 2
}
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Ease in-out transition types matching functions in the Utils module
 * @enum {Function}
 */
export const EASE_TYPE = {
    /** No easing (identity function) */
    NONE: (x) => x,
    /** Slow at the end */
    QUAD: easeInOut,
    /** Slower at the end */
    CUBIC: easeInOutCubic,
    /** Slowest at the end */
    QUINT: easeInOutQuint
}
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Rotation directions
 * @enum {number}
 */
export const ROTATION_DIRECTION = {
    /** Counter-clockwise */
    CCW: -1,
    /** Clockwise */
    CW: 1
}
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Default main GUI color
 * @type {string}
 */
export const DEFAULT_ACCENT_COLOR = '#B4FF6A';
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Default secondary (background) GUI color
 * @type {string}
 */
export const DEFAULT_BG_COLOR = 'rgba(24, 48, 13, 0.2)';
// ---------------------------------------------------------------------------------------------------------------------
/***
 * Default color for console group labels
 * @type {string}
 */
const DEFAULT_CONSOLE_GROUP_COLOR = '#bada55';

const DEFAULT_CONSOLE_MESSAGE_COLOR = '#fff';

export const CONSOLE_GROUP_STYLE = `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`;

export const CONSOLE_MESSAGE_STYLE = `color: ${DEFAULT_CONSOLE_MESSAGE_COLOR}`;
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Set of Julia-specific palettes. Keep the default first
 * @type {Array.<JULIA_PALETTE>}
 */
export const JULIA_PALETTES = [
    {
        id: 'Cosmos', keyColor: '#fefe66', theme: [
            0.0, 0.0, 0.0,
            1.0, 0.647, 0.0,
            0.0, 0.0, 0.0,
            1.2, 1.2, 1.0,
            0.1, 0.1, 0.1
        ]
    },
    {
        id: 'Blue Mist', keyColor: '#4c4cb3', theme: [
            0.0, 0.0, 0.0,
            1.0, 0.647, 0.0,
            1.0, 1.0, 1.0,
            0.0, 0.0, 1.0,
            0.0, 0.0, 0.5
        ]
    }, {
        id: 'Fire', keyColor: '#663300', theme: [
            0.4, 0.2, 0.0,
            255 / 255, 144 / 255, 10 / 255,
            0.2, 0.0, 0.0,
            0.8, 0.7, 0.0,
            49 / 255, 45 / 255, 4 / 255,
        ]
    },
    {
        id: 'Ocean', keyColor: '#0F52BA', theme: [
            230 / 255, 243 / 255, 255 / 255,
            49 / 255, 141 / 255, 178 / 255,
            0.0, 13 / 255, 26 / 255,
            4 / 255, 105 / 255, 151 / 255,
            0, 40 / 255, 77 / 255
        ]
    },
    {
        id: 'Forest', keyColor: '#25591f', theme: [
            129 / 255, 140 / 255, 60 / 255,
            137 / 255, 89 / 255, 31 / 255,
            45 / 255, 22 / 255, 6 / 255,
            25 / 255, 89 / 255, 13 / 255,
            0, 21 / 255, 0,
        ]
    },
]
// ---------------------------------------------------------------------------------------------------------------------
/** Default color used based on the initial Mandelbrot coloring. It's an accent color / 1.9 brightness factor that
 * is hardcoded in the updateColorTheme method.
 * @type {PALETTE}
 */
export const DEFAULT_MANDELBROT_THEME_COLOR = [95 / 255, 134 / 255, 56 / 255];
// ---------------------------------------------------------------------------------------------------------------------
/** Default color used based on the initial Julia coloring. It's accent color / 1.9 brightness factor that
 * is hardcoded in the updateColorTheme method.
 * @type {PALETTE}
 */
export const DEFAULT_JULIA_THEME_COLOR = hexToRGBArray(JULIA_PALETTES[0].keyColor);
// ---------------------------------------------------------------------------------------------------------------------
/**
 * This is to allow switching between two precisions as the embedded PI constant is too accurate, which is not needed
 * in many cases (rotations etc.)
 * @type {boolean}
 * @default true
 */
const USE_PRECISE_PI = true;
/**
 * PI
 * @type {number|number}
 */
export const PI = USE_PRECISE_PI ? Math.PI : 3.1415926535;
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Rotation constants for easy deg/rad conversion
 * @enum {number} radians
 */
export const DEG = {
    _30: 30 * (PI / 180),
    _90: 90 * (PI / 180),
    _120: 120 * (PI / 180),
    _150: 150 * (PI / 180),
}
// ---------------------------------------------------------------------------------------------------------------------
export const RANDOMIZE_COLOR_BUTTON_DEFAULT_TITLE = 'Randomize Color Palette (T)';