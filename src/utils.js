/**
 * @module utils.js
 * @author Radim Brnka
 * @description Contains helper functions for working with URL parameters, colors, etc.
 */

import {isJuliaMode, MODE_JULIA, MODE_MANDELBROT} from "./ui";

let urlParamsSet = false;

/**
 * Updates browser URL with params of the selected point and zoom in the fractal
 * @param mode number {MODE_JULIA|MODE_MANDELBROT}
 * @param px panX
 * @param py panY
 * @param cx Julia only
 * @param cy Julia only
 * @param zoom
 * @param rotation
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

    console.log("URL: " + JSON.stringify(params));

    if ([px, py, zoom, rotation].some(el => el == null)) {
        console.error("Fractal params incomplete, can't generate URL! " + JSON.stringify(params));
        return;
    }

    if (isJuliaMode() && [cx, cy].some(el => el == null)) {
        console.error("Julia params incomplete, can't generate URL!");
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
 * @return {{mode: number}|{mode: (number), r: (number|number), cx: (number|null), cy: (number|null), px: (number|null), py: (number|null), zoom: (number|null)}|{mode: (number)}}
 */
export function loadFractalParamsFromURL() {
    const url = new URL(window.location.href);
    const hash = url.hash; // Get the hash part of the URL (e.g., #julia?view=...)

    if (!hash) {
        console.log("No hash found in the URL");
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

        urlParamsSet = true;
        // Return the parsed parameters
        return {
            mode: mode === 'julia' ? MODE_JULIA : MODE_MANDELBROT,
            px: parseFloat(decodedParams.px) || null,
            py: parseFloat(decodedParams.py) || null,
            zoom: parseFloat(decodedParams.zoom) || null,
            r: parseFloat(decodedParams.r) || 0, // Rotation is not necessary to be defined
            cx: parseFloat(decodedParams.cx) || null,
            cy: parseFloat(decodedParams.cy) || null,
        };
    } catch (e) {
        console.error('Error decoding URL parameters:', e);
        urlParamsSet = true;
        return {mode: mode === 'julia' ? MODE_JULIA : MODE_MANDELBROT}; // Return only the mode if no query string is found
    }
}

/**
 * Clears browser URL, usually when it stops correspond with the position/zoom in the fractal
 */
export function clearURLParams() {
    if (!urlParamsSet) return;
    console.log("Clearing URL params");
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
 * HSB to RGB conversion helper function
 * @param h
 * @param s
 * @param b
 * @returns {number[]} rgb
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
 * @param h
 * @param s
 * @param l
 * @return {(*)[]}
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
 * @param r
 * @param g
 * @param b
 * @return {(number|number)[]}
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
 * Helper function for ease-in-out timing
 * @param t time step
 * @return {number}
 */
export function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Helper function for linear interpolation
 * @param start
 * @param end
 * @param t
 * @return {*}
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}