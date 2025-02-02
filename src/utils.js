/**
 * @module utils.js
 * @author Radim Brnka
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
    switch (i % 6) {
        case 0: r = b; g = t; bl = p; break;
        case 1: r = q; g = b; bl = p; break;
        case 2: r = p; g = b; bl = t; break;
        case 3: r = p; g = q; bl = b; break;
        case 4: r = t; g = p; bl = b; break;
        case 5: r = b; g = p; bl = q; break;
    }

    return [r, g, bl];
}
