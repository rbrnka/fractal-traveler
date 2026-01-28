/**
 * @module Constants
 * @author Radim Brnka
 * @description Global constants used across the app.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {easeInOut, easeInOutCubic, easeInOutQuint, hexToRGBArray} from "./utils";

/**
 * App version shown in the UI. Should match the package.json version.
 * @type {string}
 */
export const VERSION = "2.1";

// region > DEBUG CONSTANTS ////////////////////////////////////////////////////////////////////////////////////////////
/**
 * DEBUG_LEVEL
 * @enum {number}
 */
export const DEBUG_LEVEL = {
    NONE: 0,
    VERBOSE: 1, /** Logs only */
    FULL: 2
}

/**
 * DEBUG MODE - Injected by webpack DefinePlugin at build time.
 * Development builds: DEBUG_LEVEL.FULL
 * Production builds: DEBUG_LEVEL.NONE (debug code tree-shaken away)
 * @type {number}
 */
export const DEBUG_MODE = DEBUG_LEVEL[process.env.DEBUG_MODE] || DEBUG_LEVEL.NONE;

/**
 *
 * @type {{LOG: string, INFO: string, WARN: string, ERROR: string}}
 */
export const LOG_LEVEL = {
    LOG: 'log',
    DEBUG: 'debug',
    WARN: 'warn',
    ERROR: 'error'
}

/**
 * Logs a message with an optional scope and severity level.
 * @param {string} message - The message to log.
 * @param {string} [scope=''] - The scope/context of the message.
 * @param {string} [severity=LOG_LEVEL.LOG] - The severity level from LOG_LEVEL.
 */
export const log = (message, scope = '', severity = LOG_LEVEL.LOG) => {
    const formattedScope = scope ? `[${scope}]` : '';

    console[severity](
        `%c${formattedScope}%c ${message}`,
        CONSOLE_GROUP_STYLE,
        CONSOLE_MESSAGE_STYLE
    );
}
// endregion
// region > FEATURE FLAGS
/** Allows switching between fractal while keeping the params to allow Mandelbrot and Julia to match each other */
export const FF_PERSISTENT_FRACTAL_SWITCHING = true;

/**
 * Feature flag controlling the display of the persistent fractal switching button in the UI.
 * When enabled, users can see a button to toggle between fractal types while maintaining
 * the current parameters for seamless transitions between Mandelbrot and Julia sets.
 *
 * @type {boolean}
 * @since 1.9
 */
export const FF_PERSISTENT_FRACTAL_SWITCHING_BUTTON_DISPLAYED = true;

/**
 * When set to true, demo animation will always start from the beginning rather than continue where it's been interrupted.
 * @type {boolean}
 */
export const FF_DEMO_ALWAYS_RESETS = false;

/**
 * Feature flag for adaptive quality control.
 * When enabled, automatically adjusts iteration count based on GPU performance.
 * @type {boolean}
 */
export const FF_ADAPTIVE_QUALITY = false;

/**
 * GPU time threshold in ms above which quality will be reduced.
 * @default 40 ms (~25 FPS).
 * @type {number}
 */
export const ADAPTIVE_QUALITY_THRESHOLD_HIGH = 1000 / 25;

/**
 * GPU time threshold in ms below which quality will be restored
 * @default 16 ms (~60 FPS).
 * @type {number}
 */
export const ADAPTIVE_QUALITY_THRESHOLD_LOW = 1000 / 60;

/**
 * Iteration adjustment step per quality change.
 * @type {number}
 */
export const ADAPTIVE_QUALITY_STEP = 50;

/**
 * Minimum extraIterations offset (most aggressive quality reduction).
 * @default -1500 for optimal visual quality.
 * @type {number}
 */
export const ADAPTIVE_QUALITY_MIN = DEBUG_MODE === DEBUG_LEVEL.NONE ? -1500 : -3000;

/**
 * Cooldown between quality adjustments in milliseconds.
 * @type {number}
 */
export const ADAPTIVE_QUALITY_COOLDOWN = 500;

// endregion ///////////////////////////////////////////////////////////////////////////////////////////////////////////
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
 * Default main GUI color (Mandelbrot mode)
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
const DEFAULT_CONSOLE_GROUP_COLOR = DEFAULT_ACCENT_COLOR;

const DEFAULT_CONSOLE_MESSAGE_COLOR = '#fff';

export const CONSOLE_GROUP_STYLE = `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`;

export const CONSOLE_MESSAGE_STYLE = `color: ${DEFAULT_CONSOLE_MESSAGE_COLOR}`;
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Default Julia-specific palette.
 * @type {JULIA_PALETTE}
 */
export const DEFAULT_JULIA_PALETTE = {
    id: "Default",
    keyColor: "#4c4cb3",
    theme: [
        0.0, 0.0, 0.0,
        1.0, 0.647, 0.0,
        0.0, 0.0, 0.0,
        1.0, 1.0, 1.0,
        0.0, 0.0, 0.5
    ]
};
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
export const DEFAULT_JULIA_THEME_COLOR = hexToRGBArray(DEFAULT_JULIA_PALETTE.keyColor);
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
 * Defines the compression quality for JPEG screenshots (0-1) in %
 * @type {number}
 */
export const SCREENSHOT_JPEG_COMPRESSION_QUALITY = 0.95;
// ---------------------------------------------------------------------------------------------------------------------