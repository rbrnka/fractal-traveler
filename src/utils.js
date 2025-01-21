/**
 * @module utils.js
 * @author Radim Brnka
 */

let urlParamsSet = false;

/**
 * Updates browser URL with params of the selected point and zoom in the fractal
 * @param cx
 * @param cy
 * @param zoom
 */
export function updateURLParams(cx, cy, zoom) {
    const params = new URLSearchParams(window.location.search);

    params.set('cx', cx.toFixed(6));
    params.set('cy', cy.toFixed(6));
    params.set('zoom', zoom.toFixed(6));

    window.history.pushState({}, '', '?' + params.toString());

    urlParamsSet = true;
}

/**
 * Fethches and recalculates coords and zoom from URL and sets them to the fractalApp instance
 * @TODO this should be handled differently, without need for referencing the fractalApp
 * @param fractalApp
 */
export function loadFractalParamsFromURL(fractalApp) {
    const params = new URLSearchParams(window.location.search);
    const cx = params.get('cx');
    const cy = params.get('cy');
    const zoom = params.get('zoom');

    if (cx !== null && cy !== null && zoom !== null) {
        urlParamsSet = true;

        fractalApp.pan[0] = parseFloat(cx);
        fractalApp.pan[1] = parseFloat(cy);
        fractalApp.zoom = parseFloat(zoom);

        console.log("Loaded fractal params from URL:", cx, cy, zoom);
    }
}

/**
 * Clears browser URL, usually when it stops correspond with the position/zoom in the fractal
 */
export function clearURLParams() {
    if (!urlParamsSet) return;

    const newURL = window.location.protocol + "//" +
        window.location.host +
        window.location.pathname +
        window.location.hash;
    window.history.replaceState({}, document.title, newURL);

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
 * @returns {number[]}
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

/**
 * Get fractal coordinates after applying rotation
 * @param fractalApp {FractalRenderer}
 * @param mouseX {number} X coordinate on the canvas
 * @param mouseY {number} Y coordinate on the canvas
 * @param rect {DOMRect} Canvas bounding rectangle
 * @returns {[number, number]} Rotated fractal coordinates
 */
export function getRotatedFractalCoords(fractalApp, mouseX, mouseY, rect) {
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const offsetX = mouseX - centerX;
    const offsetY = mouseY - centerY;

    const cosR = Math.cos(-fractalApp.rotation);
    const sinR = Math.sin(-fractalApp.rotation);

    const rotatedX = cosR * offsetX - sinR * offsetY + centerX;
    const rotatedY = sinR * offsetX + cosR * offsetY + centerY;

    return fractalApp.screenToFractal(rotatedX, rotatedY);
}