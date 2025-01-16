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
 * Detects mobile device
 * @returns {boolean} if the user device is mobile
 */
export function isMobile() {
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
