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
 * @type {number[]}
 */
export const DEFAULT_MANDELBROT_THEME_COLOR = [95 / 255, 134 / 255, 56 / 255];
// ---------------------------------------------------------------------------------------------------------------------
/** Default color used based on the initial Julia coloring. It's accent color / 1.9 brightness factor that
 * is hardcoded in the updateColorTheme method.
 * @type {number[]}
 */
export const DEFAULT_JULIA_THEME_COLOR = [0.298, 0.298, 0.741];
// ---------------------------------------------------------------------------------------------------------------------