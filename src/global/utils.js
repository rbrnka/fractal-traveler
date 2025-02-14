/**
 * @module Utils
 * @author Radim Brnka
 * @description Contains helper functions for working with URL parameters, colors, etc.
 */

import {DEBUG_MODE, isJuliaMode, MODE_JULIA, MODE_MANDELBROT} from "../ui/ui";

let urlParamsSet = false;

/**
 * Updates browser URL with params of the selected point and zoom in the fractal
 * @param {FRACTAL_TYPE} mode
 * @param {number} px panX
 * @param {number} py panY
 * @param {number} cx Julia only
 * @param {number} cy Julia only
 * @param {number} zoom
 * @param {number} rotation
 */
export function updateURLParams(mode, px, py, zoom, rotation, cx, cy) {
    const params = {
        mode: mode != null ? mode.toFixed(0) : MODE_MANDELBROT,
        px: px != null ? px.toFixed(6) : null,
        py: py != null ? py.toFixed(6) : null,
        zoom: zoom != null ? zoom.toFixed(6) : null,
        r: rotation != null ? rotation.toFixed(6) : 0, // Rotation is not necessary to be defined
        cx: cx != null ? cx.toFixed(6) : null,
        cy: cy != null ? cy.toFixed(6) : null,
    };

    if (DEBUG_MODE) console.log(`%c updateURLParams: %c Setting URL: ${JSON.stringify(params)}`, 'color: #bada55', 'color: #fff');

    if ([px, py, zoom, rotation].some(el => el == null)) {
        console.error(`%c updateURLParams: %c Fractal params incomplete, can't generate URL! ${JSON.stringify(params)}`, 'color: #bada55', 'color: #fff');
        return;
    }

    if (isJuliaMode() && [cx, cy].some(el => el == null)) {
        console.error(`%c updateURLParams: %c Julia params incomplete, can't generate URL! ${JSON.stringify(params)}`, 'color: #bada55', 'color: #fff');
        return;
    }

    // Convert to Base64 for compact representation
    const encodedParams = btoa(JSON.stringify(params));

    // Update the URL with a single "params" field
    const hashPath = isJuliaMode() ? '#julia' : '#';
    window.history.pushState({}, '', `${hashPath}?view=${encodedParams}`);

    urlParamsSet = true;
}

/**
 * Fetches and recalculates coords and zoom from URL and sets them to the fractalApp instance
 * @return {URL_PRESET}
 */
export function loadFractalParamsFromURL() {
    const url = new URL(window.location.href);
    const hash = url.hash; // Get the hash part of the URL (e.g., #julia?view=...)

    if (!hash) {
        if (DEBUG_MODE) console.log(`%c loadFractalParamsFromURL: %c No hash found in the URL, return default mode.`, 'color: #bada55', 'color: #fff');

        return {mode: MODE_MANDELBROT}; // Return default if no hash is present
    }

    // Split the hash to separate the mode and parameters
    const [mode, queryString] = hash.slice(1).split('?'); // Remove the '#' and split by '?'

    if (!queryString) {
        return {mode: mode === 'julia' ? MODE_JULIA : MODE_MANDELBROT}; // Return only the mode if no query string is found
    }

    // Parse the query parameters
    const hashParams = new URLSearchParams(queryString);
    const encodedParams = hashParams.get('view');

    try {
        // Decode the Base64 string and parse the JSON object
        const decodedParams = JSON.parse(atob(encodedParams));
        if (DEBUG_MODE) console.log(`%c loadFractalParamsFromURL: %c Decoded params: ${JSON.stringify(decodedParams)}`, 'color: #bada55', 'color: #fff');
        urlParamsSet = true;
        // Return the parsed parameters
        return {
            mode: mode === 'julia' ? MODE_JULIA : MODE_MANDELBROT,
            px: decodedParams.px != null ? parseFloat(decodedParams.px) : null,
            py: decodedParams.py != null ? parseFloat(decodedParams.py) : null,
            zoom: parseFloat(decodedParams.zoom) || null,
            r: parseFloat(decodedParams.r) || 0, // Rotation is not necessary to be defined
            cx: decodedParams.cx != null ? parseFloat(decodedParams.cx) : null,
            cy: decodedParams.cy != null ? parseFloat(decodedParams.cy) : null,
        };
    } catch (e) {
        console.error(`%c loadFractalParamsFromURL: %c Error decoding URL parameters: ${e}`, 'color: #bada55', 'color: #fff');
        urlParamsSet = true;
        return {mode: mode === 'julia' ? MODE_JULIA : MODE_MANDELBROT}; // Return only the mode if no query string is found
    }
}

/** Clears browser URL, usually when it stops correspond with the position/zoom in the fractal */
export function clearURLParams() {
    if (!urlParamsSet) return;

    if (DEBUG_MODE) console.log(`%c clearURLParams: %c Clearing URL params.`, 'color: #bada55', 'color: #fff');

    const hash = window.location.hash.split('?')[0]; // Keep only the hash part, discard any query parameters
    const newUrl = `${window.location.origin}/${hash}`;
    window.history.pushState({}, '', newUrl);
    urlParamsSet = false;
}

/**
 * Detects touch device
 * @returns {boolean}
 */
export function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
}

/**
 * Detects mobile device
 * @returns {boolean} if the user device is mobile
 */
export function isMobileDevice() {
    const toMatch = [
        /Android/i,
        /webOS/i,
        /iPhone/i,
        /iPad/i,
        /iPod/i,
        /BlackBerry/i,
        /Windows Phone/i
    ];

    return toMatch.some((toMatchItem) => {
        return navigator.userAgent.match(toMatchItem);
    });
}

/**
 * Generates string in [x, yi] format from the given complex number.
 * @param {COMPLEX} c
 * @param {number} precision Decimal point precision
 * @param {boolean} [withI] Append "i" to the 2nd member?
 * @return {string}
 */
export function expandComplexToString(c, precision = 6, withI = true) {
    return `[${c[0].toFixed(precision)}, ${c[1].toFixed(precision)}` + (withI ? 'i]' : ']');
}

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
 * @return {[number, number, number]} [h, s, l]
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
 * Helper function for ease-in-out timing. This function accelerates in the first half (using 2*t²) and decelerates in
 * the second half.
 * @param {number} time time step
 * @return {number}
 */
export function easeInOut(time) {
    return time < 0.5 ? 2 * time * time : -1 + (4 - 2 * time) * time;
}

/**
 * Helper function for ease-in-out timing. The cubic version tends to have a smoother acceleration at the beginning and
 * a gentler deceleration at the end, to start more gradually and then slow down more smoothly toward the end.
 * @param {number} time time step
 * @return {number}
 */
export function easeInOutCubic(time) {
    return time < 0.5
        ? 4 * time * time * time
        : 1 - Math.pow(-2 * time + 2, 3) / 2;
}

/**
 * Helper function for linear interpolation
 * @param {number} start
 * @param {number} end
 * @param {number} time
 * @return {number}
 */
export function lerp(start, end, time) {
    return start + (end - start) * time;
}

/**
 * Normalizes rotation into into [0, 2*PI] interval
 * @param {number} rotation in rad
 * @return {number} rotation in rad
 */
export function normalizeRotation(rotation) {
    const twoPi = 2 * Math.PI;
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