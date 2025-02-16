/**
 * @module Constants
 * @author Radim Brnka
 * @description Global constants used across the app.
 */

// ---------------------------------------------------------------------------------------------------------------------
// DEBUG MODE
// ---------------------------------------------------------------------------------------------------------------------
import {easeInOut, easeInOutCubic, easeInOutQuint} from "./utils";

/**
 * Debug mode. Set to false for prod deployment!
 * @type {boolean}
 */
export const DEBUG_MODE = true;
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Application name
 * @type {string}
 */
export const APP_NAME = 'Synaptory Fractal Traveler';

/**
 * @description Enum Fractal Types
 * @readonly
 * @enum {number}
 */
export const FRACTAL_TYPE = {
    MANDELBROT: 0,
    JULIA: 1
}

/**
 * @description Ease in-out transition types matching functions in Utils module
 * @readonly
 * @enum {Function}
 */
export const EASE_TYPE = {
    /** No easing (identity function) */
    NONE: (x) => x,

    QUAD: easeInOut,
    CUBIC: easeInOutCubic,
    /** Slowest at the end */
    QUINT: easeInOutQuint
}

/**
 * @enum {number}
 */
export const ROTATION_DIRECTION = {
    /** Counter-clockwise */
    CCW: -1,
    /** Clockwise */
    CW: 1
}

/**
 *
 * @type {string}
 */
export const DEFAULT_ACCENT_COLOR = '#B4FF6A';

/**
 *
 * @type {string}
 */
export const DEFAULT_BG_COLOR = 'rgba(24, 48, 13, 0.2)';

/***
 *
 * @type {string}
 */
export const DEFAULT_CONSOLE_GROUP_COLOR = '#bada55';