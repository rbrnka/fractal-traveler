/**
 * @module Constants
 * @author Radim Brnka
 * @description Global constants used across the app.
 */

import {easeInOut, easeInOutCubic, easeInOutQuint} from "./utils";
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * DEBUG MODE. Set to false for prod deployment!
 * @type {boolean}
 */
export const DEBUG_MODE = false;
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
    JULIA: 1
}
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Ease in-out transition types matching functions in Utils module
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
export const DEFAULT_CONSOLE_GROUP_COLOR = '#bada55';
// ---------------------------------------------------------------------------------------------------------------------
/** Default color used based on the initial Mandelbrot coloring. It's accent color / 1.9 brightness factor that
 * is hardcoded in the updateColorTheme method.
 * @type {PALETTE}
 */
export const DEFAULT_MANDELBROT_THEME_COLOR = [95 / 255, 134 / 255, 56 / 255];
// ---------------------------------------------------------------------------------------------------------------------
/** Default color used based on the initial Julia coloring. It's accent color / 1.9 brightness factor that
 * is hardcoded in the updateColorTheme method.
 * @type {PALETTE}
 */
export const DEFAULT_JULIA_THEME_COLOR = [0.298, 0.298, 0.741];
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
    _90: 90 * (PI / 180),
    _120: 120 * (PI / 180),
    _150: 150 * (PI / 180),
}
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Set of Julia-specific palettes
 */
export const JULIA_PALETTES = [
    {
        /** Default palette. Keep it first! */
        id: 'Default', keyColor: '#4c4cb3', theme: [
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
        id: 'Ocean', keyColor: '#00284d', theme: [
            230/255, 243/255, 255/255,
            49 / 255, 141 / 255, 178 / 255,
            0.0, 13/255, 26/255,
            4 / 255, 105 / 255, 151 / 255,
            0, 40/255, 77/255
        ]
    },
    {
        id: 'Forest', keyColor: '#25591f', theme: [
            129 / 255, 140 / 255, 60 / 255,
            37 / 255, 89 / 255, 31 / 255,
            45 / 255, 22 / 255, 6 / 255,
            25 / 255, 89 / 255, 13 / 255,
            0, 21 / 255, 0,
        ]
    },
    {
        id: 'Cosmos', keyColor: '#eeeeee', theme: [
            0.0, 0.0, 0.0,
            1.0, 0.647, 0.0,
            0.0, 0.0, 0.0,
            1.2, 1.2, 1.0,
            0.1, 0.1, 0.1
        ]
    },
]
// ---------------------------------------------------------------------------------------------------------------------
export const RANDOMIZE_COLOR_BUTTON_DEFAULT_TITLE = 'Randomize Color Palette (T)';