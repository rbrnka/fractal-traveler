/**
 * @module Utils
 * @author Radim Brnka
 * @description Contains helper functions for working with URL parameters, colors, etc.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEBUG_MODE, FRACTAL_TYPE, PI} from "./constants";

let urlParamsSet = false;

/**
 * Updates browser URL with params of the selected point and zoom in the fractal
 * @param {FRACTAL_TYPE} mode
 * @param {number} px panX
 * @param {number} py panY
 * @param {number|null} cx Julia only
 * @param {number|null} cy Julia only
 * @param {number} zoom
 * @param {number} rotation
 * @param {string|null} paletteId optional palette ID
 */
export function updateURLParams(mode, px, py, zoom, rotation, cx = null, cy = null, paletteId = null) {
    const formatNumber = (value) => {
        if (value == null) return null;
        // 15–17 digits is where JS double precision is meaningfully preserved.
        // toPrecision also uses scientific notation for very small values (deep zoom).
        return Number(value).toPrecision(17);
    };

    const params = {
        mode: mode != null ? mode.toFixed(0) : FRACTAL_TYPE.MANDELBROT,
        px: formatNumber(px),
        py: formatNumber(py),
        zoom: formatNumber(zoom),
        r: rotation != null ? Number(rotation).toPrecision(17) : 0,
        cx: formatNumber(cx),
        cy: formatNumber(cy),
        palette: paletteId,
    };

    if (DEBUG_MODE) console.log(`%c updateURLParams: %c Setting URL: ${JSON.stringify(params)}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    if ([px, py, zoom, rotation].some(el => el == null)) {
        console.error(`%c updateURLParams: %c Fractal params incomplete, can't generate URL! ${JSON.stringify(params)}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    if (mode === FRACTAL_TYPE.JULIA && [cx, cy].some(el => el == null)) {
        console.error(`%c updateURLParams: %c Julia params incomplete, can't generate URL! ${JSON.stringify(params)}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    // Convert to Base64 for compact representation
    const encodedParams = btoa(JSON.stringify(params));

    // Update the URL with a single "params" field
    const hashPath = mode === FRACTAL_TYPE.JULIA ? '#julia' : '#';
    window.history.pushState({}, '', `${hashPath}?view=${encodedParams}`);

    urlParamsSet = true;
}

/**
 * Fetches and recalculates coords and zoom from URL and sets them to the fractalApp instance
 * @return {URL_PRESET}
 */
export function loadFractalParamsFromURL() {
    if (DEBUG_MODE) console.groupCollapsed(`%c loadFractalParamsFromURL`, CONSOLE_GROUP_STYLE);

    const url = new URL(window.location.href);
    const hash = url.hash; // Get the hash part of the URL (e.g., #julia?view=...)

    if (!hash) {
        if (DEBUG_MODE) console.log(`No hash found in the URL, return default mode.`);
        if (DEBUG_MODE) console.groupEnd();
        return {mode: FRACTAL_TYPE.MANDELBROT}; // Return default if no hash is present
    }

    // Split the hash to separate the mode and parameters
    const [mode, queryString] = hash.slice(1).split('?'); // Remove the '#' and split by '?'

    if (!queryString) {
        if (DEBUG_MODE) console.log(`No query string is found in the URL, returning mode only.`);
        if (DEBUG_MODE) console.groupEnd();
        return {mode: mode === 'julia' ? FRACTAL_TYPE.JULIA : FRACTAL_TYPE.MANDELBROT};
    }

    // Parse the query parameters
    const hashParams = new URLSearchParams(queryString);
    const encodedParams = hashParams.get('view');

    try {
        // Decode the Base64 string and parse the JSON object
        const decodedParams = JSON.parse(atob(encodedParams));
        if (DEBUG_MODE) console.log(`Decoded params: ${JSON.stringify(decodedParams)}`);
        urlParamsSet = true;
        if (DEBUG_MODE) console.groupEnd();
        // Return the parsed parameters
        return {
            mode: mode === 'julia' ? FRACTAL_TYPE.JULIA : FRACTAL_TYPE.MANDELBROT,
            px: decodedParams.px != null ? parseFloat(decodedParams.px) : null,
            py: decodedParams.py != null ? parseFloat(decodedParams.py) : null,
            zoom: decodedParams.zoom != null ? parseFloat(decodedParams.zoom) : null,
            r: decodedParams.r != null ? parseFloat(decodedParams.r) : 0, // Rotation is not necessary to be defined
            cx: decodedParams.cx != null ? parseFloat(decodedParams.cx) : null,
            cy: decodedParams.cy != null ? parseFloat(decodedParams.cy) : null,
            paletteId: decodedParams.palette || null,
        };
    } catch (e) {
        console.error(`%c loadFractalParamsFromURL: %c Error decoding URL parameters: ${e}`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        urlParamsSet = true;
        if (DEBUG_MODE) console.groupEnd();
        return {mode: mode === 'julia' ? FRACTAL_TYPE.JULIA : FRACTAL_TYPE.MANDELBROT}; // Return only the mode if no query string is found
    }
}

/** Clears browser URL, usually when it stops correspond with the position/zoom in the fractal */
export function clearURLParams() {
    if (!urlParamsSet) return;

    if (DEBUG_MODE) console.log(`%c clearURLParams: %c Clearing URL params.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

    const hash = window.location.hash.split('?')[0]; // Keep only the hash part, discard any query parameters
    const newUrl = `${window.location.origin}/${hash}`;
    window.history.pushState({}, '', newUrl);
    urlParamsSet = false;
}

/**
 * Detects touch device
 * @returns {boolean}
 */
export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

/**
 * Detects mobile device
 * @returns {boolean} if the user device is mobile
 */
export function isMobileDevice() {
    const toMatch = [/Android/i, /webOS/i, /iPhone/i, /iPad/i, /iPod/i, /BlackBerry/i, /Windows Phone/i];

    return toMatch.some((toMatchItem) => {
        return navigator.userAgent.match(toMatchItem);
    });
}

/**
 * Generates string in [x, yi] format from the given complex number. Trailing zeroes are trimmed.
 * @param {COMPLEX} c
 * @param {number} precision Decimal point precision
 * @param {boolean} [withI] Append "i" to the imaginary member? Ignored if zero.
 * @return {string} [x, yi]|[x, 0]|[?, ?]
 */
export function expandComplexToString(c, precision = 6, withI = true) {
    if (DEBUG_MODE) console.groupCollapsed(`%c expandComplexToString`, CONSOLE_GROUP_STYLE);

    const invalidValues = [NaN, undefined, null, ''];
    const isNumber = (value) => typeof value === 'number' && isFinite(value);

    let expanded = `[`;

    if (invalidValues.some(value => value === c[0]) || invalidValues.some(value => value === c[1]) || !isNumber(c[0]) || !isNumber(c[1])) {
        expanded += `?, ?]`;
        console.warn(`%c expandComplexToString: %c Invalid complex number: ${c}`, CONSOLE_GROUP_STYLE);
        console.groupEnd();
        return expanded;
    } else {
        const trimmedReal = parseFloat(c[0].toFixed(precision)).toString();
        const trimmedImag = parseFloat(c[1].toFixed(precision)).toString();
        expanded += `${trimmedReal}, ${trimmedImag}`;
    }

    if (DEBUG_MODE) console.groupEnd();
    return expanded + ((withI && c[1] !== 0) ? 'i]' : ']');
}

// region > Double helpers ---------------------------------------------------------------------------------------------

/**
 * @enum
 * @type {{VELTKAMP_DEKKER: string, GPU_EMULATED_DOUBLE: string}}
 */
export const SPLIT_FLOAT_METHOD = {
    VELTKAMP_DEKKER: 'vd', // Default
    GPU_EMULATED_DOUBLE: 'ed',
}

/**
 * Splits a 64-bit floating point number into two 32-bit parts
 * @param {number} value A standard JavaScript 64-bit number.
 * @param value
 * @param method
 * @returns {{high: number, low: number}}
 */
export const splitFloat = (value, method = SPLIT_FLOAT_METHOD.VELTKAMP_DEKKER) =>
    (method === SPLIT_FLOAT_METHOD.GPU_EMULATED_DOUBLE) ? splitFloatED(value) : splitFloatVD(value);

/**
 * Veltkamp-Dekker splitting constant: 2^27 + 1 = 134217729
 * Pre-computed to avoid Math.pow() on every splitFloat call (called 4000+ times per orbit rebuild).
 * This is a common splitting point for 53-bit mantissa (JS number).
 */
const VELTKAMP_DEKKER_K = 134217729;

/**
 * The Veltkamp-Dekker Split: This implementation is the classic Veltkamp-Dekker algorithm. It is designed to split
 * a 64-bit double into two "half-precision" doubles so that their product can be calculated without losing precision.
 * @param {number} value A standard JavaScript 64-bit number.
 * @returns {{high: number, low: number}}
 */
function splitFloatVD(value) {
    const temp = value * VELTKAMP_DEKKER_K;
    const high = temp - (temp - value);
    const low = value - high;

    return {high, low};
}

/**
 * GPU Emulated Double. This is the standard approach for rendering high-precision or astronomical visualizations).
 * @param value
 * @returns {{high: number, low: number}}
 */
function splitFloatED(value) {
    // Force the high part to be *exactly* what will be stored in GPU float32.
    const high = Math.fround(value);
    // Residual in double, then quantize to float32 as well (matches GPU storage).
    const low = Math.fround(value - high);

    return {high, low};
}

/**
 * Creates a double-double precision number object with high and low parts.
 * Used for extended precision arithmetic beyond standard 64-bit floating point.
 *
 * @param {number} [hi=0] - The high-order (primary) part of the number.
 * @param {number} [lo=0] - The low-order (error correction) part of the number.
 * @returns {{hi: number, lo: number}} A double-double precision number object.
 */
export function ddMake(hi = 0, lo = 0) {
    return {hi, lo};
}

/**
 * Computes the error-free sum of two floating-point numbers using Knuth's two-sum algorithm.
 * Returns both the sum and the rounding error, enabling extended precision arithmetic.
 *
 * @param {number} a - The first number to sum.
 * @param {number} b - The second number to sum.
 * @returns {{s: number, err: number}} An object containing the sum (s) and the rounding error (err).
 */
export function twoSum(a, b) {
    const s = a + b;
    const bb = s - a;
    const err = (a - (s - bb)) + (b - bb);
    return {s, err};
}

/**
 * Computes the error-free sum of two floating-point numbers where |a| >= |b|.
 * This is a faster variant of twoSum that assumes the first argument has greater magnitude.
 *
 * @param {number} a - The larger magnitude number (must satisfy |a| >= |b|).
 * @param {number} b - The smaller magnitude number to add.
 * @returns {{s: number, err: number}} An object containing the sum (s) and the rounding error (err).
 */
export function quickTwoSum(a, b) {
    const s = a + b;
    const err = b - (s - a);
    return {s, err};
}

/**
 * Adds a standard floating-point number to a double-double precision number.
 * This function mutates the input double-double object and maintains extended precision.
 *
 * @param {{hi: number, lo: number}} dd - The double-double number to modify (mutated in place).
 * @param {number} n - The standard floating-point number to add.
 * @returns {{hi: number, lo: number}} The mutated double-double object with the sum.
 */
export function ddAdd(dd, n) {
    const t = twoSum(dd.hi, n);
    const lo = dd.lo + t.err;
    const r = quickTwoSum(t.s, lo);
    dd.hi = r.s;
    dd.lo = r.err;
    return dd;
}

/**
 * Sets the value of a double-double precision object from a standard number.
 * This effectively resets the high-precision value to a single 64-bit float,
 * clearing any existing low-precision error bits.
 *
 * @param {{hi: number, lo: number}} dd - The double-double object to modify.
 * @param {number} n - The number to assign to the high part.
 * @returns {{hi: number, lo: number}} The mutated double-double object.
 */
export function ddSet(dd, n) {
    dd.hi = n;
    dd.lo = 0;
    return dd;
}

/**
 * Returns the standard 64-bit floating-point approximation of a double-double number.
 * This combines the high and low parts to reconstruct the full precision value.
 *
 * @param {{hi: number, lo: number}} dd The double-double number object with high and low precision parts.
 * @returns {number} The combined floating-point value.
 */
export function ddValue(dd) {
    return dd.hi + dd.lo;
}

/**
 * Adds two double-double precision numbers and returns a new DD result.
 * Uses the Knuth two-sum algorithm for error-free addition.
 *
 * @param {{hi: number, lo: number}} a - First double-double number.
 * @param {{hi: number, lo: number}} b - Second double-double number.
 * @returns {{hi: number, lo: number}} The sum as a new double-double number.
 */
export function ddAddDD(a, b) {
    const t = twoSum(a.hi, b.hi);
    const lo = a.lo + b.lo + t.err;
    const r = quickTwoSum(t.s, lo);
    return {hi: r.s, lo: r.err};
}

/**
 * Subtracts two double-double precision numbers (a - b) and returns a new DD result.
 *
 * @param {{hi: number, lo: number}} a - The minuend (number to subtract from).
 * @param {{hi: number, lo: number}} b - The subtrahend (number to subtract).
 * @returns {{hi: number, lo: number}} The difference (a - b) as a new double-double number.
 */
export function ddSubDD(a, b) {
    return ddAddDD(a, {hi: -b.hi, lo: -b.lo});
}

// endregion---------------------------------------------------------------------------------------

/**
 * Escapes HTML special characters in a string to prevent XSS attacks and rendering issues.
 * Converts &, <, and > to their HTML entity equivalents.
 *
 * @param {*} s - The input value to escape (will be converted to string)
 * @returns {string} The escaped string with HTML entities
 */
export const esc = (s) =>
    String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

/**
 * Compares two complex numbers / arrays of two numbers with given precision
 * @param {COMPLEX} c1
 * @param {COMPLEX}c2
 * @param {number} [precision]
 * @return {boolean} true if numbers are equal, false if not
 */
export function compareComplex(c1, c2, precision = 12) {
    return c1[0].toFixed(precision) === c2[0].toFixed(precision) && c1[1].toFixed(precision) === c2[1].toFixed(precision);
}

/**
 * Compares two palettes / arrays of three numbers with given precision (transitively uses the compareComplex)
 * @param {PALETTE} p1
 * @param {PALETTE} p2
 * @param {number} [precision]
 * @return {boolean} true if palettes are equal, false if not
 */
export function comparePalettes(p1, p2, precision = 6) {
    return p1[0].toFixed(precision) === p2[0].toFixed(precision) &&
        p1[1].toFixed(precision) === p2[1].toFixed(precision) &&
        p1[2].toFixed(precision) === p2[2].toFixed(precision);
}

/**
 * HSB to RGB conversion helper function
 * @param h Hue
 * @param s Saturation
 * @param b Brightness
 * @returns {PALETTE} rgb
 */
export function hsbToRgb(h, s, b) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = b * (1 - s);
    const q = b * (1 - f * s);
    const t = b * (1 - (1 - f) * s);

    let r, g, bl;
    // @formatter:off
    switch (i % 6) {
        case 0: r = b; g = t; bl = p; break;
        case 1: r = q; g = b; bl = p; break;
        case 2: r = p; g = b; bl = t; break;
        case 3: r = p; g = q; bl = b; break;
        case 4: r = t; g = p; bl = b; break;
        case 5: r = b; g = p; bl = q; break;
    }
    // @formatter:on
    return [r, g, bl];
}

/**
 * Convert HSL (h in [0,1], s in [0,1], l in [0,1]) to RGB (each channel in [0,1])
 * @param {number} h Hue
 * @param {number} s Saturation
 * @param {number} l Lightness
 * @return {PALETTE} [r, g ,b]
 */
export function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

/**
 * Converts RGB (each in [0,1]) to HSL (h in [0,1], s in [0,1], l in [0,1])
 * @param {number} r Red
 * @param {number} g Green
 * @param {number} b Blue
 * @return {Array<number, number, number>} [h, s, l]
 */
export function rgbToHsl(r, g, b) {
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0; // achromatic
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) {
            h = (g - b) / d + (g < b ? 6 : 0);
        } else if (max === g) {
            h = (b - r) / d + 2;
        } else {
            h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return [h, s, l];
}

/**
 * Converts HTML hex color notation to rgb object
 * @param {string} hex HTML hex color
 * @param {number} [normalize] interval to normalize onto
 * @return {{r: number, g: number, b: number}|null}
 */
export function hexToRGB(hex, normalize = 255) {
    // Ensure it's a string and remove any leading #
    hex = hex.toLowerCase().replace(/^#/, "");

    // Convert shorthand "#abc" → "aabbcc"
    if (hex.length === 3) {
        hex = hex.split("").map(char => char + char).join("");
    }

    // Validate format
    if (!/^([\da-f]{6})$/i.test(hex)) {
        return null;
    }

    // Convert HEX to RGB (0-255)
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Normalize to 0-1 range
    return {
        r: r / normalize,
        g: g / normalize,
        b: b / normalize
    };
}

/**
 * Converts HTML hex color notation to rgb array
 * @param {string} hex HTML hex color
 * @param {number} [normalize] interval to normalize onto
 * @return {number[]|null} [r, g, b]
 */
export function hexToRGBArray(hex, normalize = 255) {
    const rgb = hexToRGB(hex, normalize);
    return [rgb.r, rgb.g, rgb.b];
}

/**
 * Helper function for ease-in-out timing. This function accelerates in the first half (using 2*t²) and decelerates in
 * the second half.
 * @param {number} time A value between 0 and 1 representing the progress.
 * @return {number} The eased value.
 */
export function easeInOut(time) {
    return time < 0.5 ? 2 * time * time : -1 + (4 - 2 * time) * time;
}

/**
 * Helper function for ease-in-out timing. The cubic version tends to have a smoother acceleration at the beginning and
 * a gentler deceleration at the end, to start more gradually and then slow down more smoothly toward the end.
 * @param {number} time A value between 0 and 1 representing the progress.
 * @return {number} The eased value.
 */
export function easeInOutCubic(time) {
    return time < 0.5
        ? 4 * time * time * time
        : 1 - Math.pow(-2 * time + 2, 3) / 2;
}

/**
 * Helper function for ease-in-out timing using a quintic curve.
 * This function starts gradually, accelerates, then decelerates more gently near the end.
 * @param {number} time A value between 0 and 1 representing the progress.
 * @return {number} The eased value.
 */
export function easeInOutQuint(time) {
    return time < 0.5
        ? 16 * Math.pow(time, 5)
        : 1 - Math.pow(-2 * time + 2, 5) / 2;
}

/**
 * Helper function for linear interpolation
 * @param {number} start
 * @param {number} end
 * @param {number} time A value between 0 and 1 representing the progress.
 * @return {number}
 */
export function lerp(start, end, time) {
    return start + (end - start) * time;
}

/**
 * Converts degrees from JSON to Radians for GLSL uniforms
 * @param {number} degrees
 * @returns {number} radians
 */
export function degToRad(degrees) {
    return degrees * (PI / 180);
}

/**
 * Normalizes rotation into into [0, 2*PI] interval
 * @param {number} rotation in rad
 * @return {number} rotation in rad
 */
export function normalizeRotation(rotation) {
    const twoPi = 2 * PI;
    return (rotation % twoPi + twoPi) % twoPi;
}

/**
 * Computes a duration based on the travel distance between current and target parameters. Iterates over each property
 * in target (assuming current and target have the same structure)
 * @param {number} seed - A scaling factor to adjust the overall duration.
 * @param {object} current - An object with current values
 * @param {object} target - An object with target values
 * @param {object} [weights] - Optional weights
 * @returns {number} The computed duration.
 */
export function getAnimationDuration(seed, current, target, weights = {}) {
    let compositeDistance = 0;
    for (const key in target) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
            const w = weights[key] !== undefined ? weights[key] : 1.0;
            const currVal = current[key];
            const targVal = target[key];
            let diff = 0;

            // If the property is a number, use absolute difference.
            if (typeof targVal === 'number' && typeof currVal === 'number') {
                diff = Math.abs(targVal - currVal);
            }
            // If the property is an array, compute the Euclidean distance between the two arrays.
            else if (Array.isArray(targVal) && Array.isArray(currVal)) {
                // Assume both arrays have the same length.
                diff = Math.hypot(...targVal.map((v, i) => v - (currVal[i] || 0)));
            }

            compositeDistance += w * diff;
        }
    }
    return Math.round(seed * compositeDistance);
}

/**
 * Helper function that returns a Promise that resolves after timeout.
 * @param {number} timeout in ms
 * @return {Promise<unknown>}
 */
export async function asyncDelay(timeout) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

/**
 * Calculates the change in pan based on the movement delta, the canvas rectangle, current zoom, and rotation.
 *
 * @param {number} currentX The current X coordinate (clientX or touch.clientX).
 * @param {number} currentY The current Y coordinate.
 * @param {number} lastX The previous X coordinate.
 * @param {number} lastY The previous Y coordinate.
 * @param {DOMRect} rect The canvas bounding rectangle.
 * @param {number} rotation The current rotation (in radians).
 * @param {number} zoom The current zoom factor.
 * @returns {Array<number>} An array [deltaPanX, deltaPanY] that should be added to the current pan.
 */
export function calculatePanDelta(currentX, currentY, lastX, lastY, rect, rotation, zoom) {
    const moveX = currentX - lastX;
    const moveY = currentY - lastY;

    const ref = Math.min(rect.width, rect.height);

    // Apply inverse rotation to the movement, so it aligns with fractal pan direction.
    const cosR = Math.cos(-rotation);
    const sinR = Math.sin(-rotation);
    const rotatedMoveX = cosR * moveX - sinR * moveY;
    const rotatedMoveY = sinR * moveX + cosR * moveY;

    // Scale movement relative to canvas size and zoom.
    const deltaPanX = -(rotatedMoveX / ref) * zoom;
    const deltaPanY = +(rotatedMoveY / ref) * zoom;

    return [deltaPanX, deltaPanY];
}

/**
 * Removes array of buttons from the scene and clears it.
 * @param {Array<HTMLButtonElement>} buttons
 */
export function destroyArrayOfButtons(buttons) {
    if (Array.isArray(buttons)) {
        buttons.forEach(btn => {
            if (btn.parentNode) {
                btn.parentNode.removeChild(btn);
            }
        });
        buttons.length = 0;
    }
}

/**
 * Returns the name of the fractal mode.
 * @param {number} type
 */
export function getFractalName(type) {
    return Object.keys(FRACTAL_TYPE).find(key => FRACTAL_TYPE[key] === type) || "UNKNOWN";
}