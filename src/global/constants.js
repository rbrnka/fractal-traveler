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
        id: 'default', theme: [
            0.0, 0.0, 0.0,      // Stop 0: Black
            1.0, 0.647, 0.0,    // Stop 1: Orange
            1.0, 1.0, 1.0,      // Stop 2: White
            0.0, 0.0, 1.0,      // Stop 3: Blue
            0.0, 0.0, 0.5       // Stop 4: Dark Blue
        ], keyColorIndex: 3
    },
    {
        id: 'fire', theme: [
            0.0, 0.0, 0.0,      // Stop 0: Black
            0.3, 0.0, 0.0,      // Stop 1: Dark red
            0.7, 0.0, 0.0,      // Stop 2: Red
            1.0, 0.5, 0.0,      // Stop 3: Orange
            1.0, 1.0, 0.0       // Stop 4: Yellow
        ], keyColorIndex: 3
    },
    {
        id: 'ocean', theme: [
            0.0, 0.0, 0.0,      // Stop 0: Black
            0.0, 1.0, 1.0,      // Stop 4: Cyan
            0.0, 0.0, 0.7,      // Stop 2: Blue
            0.0, 0.5, 1.0,      // Stop 3: Light blue
            0.0, 0.0, 0.3,      // Stop 1: Deep blue
        ], keyColorIndex: 3
    },
    {
        id: 'forest', theme: [
            0.7, 1.0, 0.3,      // Stop 4: Yellow-green
            0.0, 0.0, 0.0,      // Stop 0: Black
            0.5, 1.0, 0.5,      // Stop 3: Light green
            0.0, 0.7, 0.0,      // Stop 2: Green
            0.0, 0.3, 0.0,      // Stop 1: Dark green
        ], keyColorIndex: 3
    },
    {
        id: 'cosmos', theme: [
            1.0, 1.0, 1.0,      // Stop 2:
            1.0, 0.647, 0.0,    // Stop 1:
            0.0, 0.0, 0.0,      // Stop 0:
            1.0, 0.347, 0.0,       // Stop 4:
            0.0, 0.0, 0.0      // Stop 3:
        ], keyColorIndex: 3
    },
]