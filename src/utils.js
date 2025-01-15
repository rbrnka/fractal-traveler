// utils.js
let urlParamsSet = false;

export function updateURLParams(cx, cy, zoom) {
    const params = new URLSearchParams(window.location.search);

    params.set('cx', cx.toFixed(6));
    params.set('cy', cy.toFixed(6));
    params.set('zoom', zoom.toFixed(6));

    window.history.pushState({}, '', '?' + params.toString());

    urlParamsSet = true;
}

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

export function clearURLParams() {
    if (!urlParamsSet) return;

    const newURL = window.location.protocol + "//" +
        window.location.host +
        window.location.pathname +
        window.location.hash;
    window.history.replaceState({}, document.title, newURL);

    urlParamsSet = false;
}

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
