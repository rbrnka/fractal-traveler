/**
 * @module main
 * @author Radim Brnka
 */
import './css/style.css';

import {MandelbrotRenderer} from './mandelbrotRenderer.js';
import {initUI} from './ui.js';

// TODO only register events based on the device - if (isMobile())...
import {registerTouchEventHandlers} from './touchEventHandlers.js';
import {registerMouseEventHandlers} from './mouseEventHandlers.js';
import {clearURLParams, loadFractalParamsFromURL} from "./utils";

document.addEventListener('DOMContentLoaded', () => {
    // Create the fractal application instance.
    const canvas = document.getElementById('fractalCanvas');
    // Explicitly set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fractalApp = new MandelbrotRenderer(canvas);

    // Now that fractalApp is initialized, set up UI and event handlers.
    initUI(fractalApp);
    console.log('UI initialized');

    // Register control events
    registerTouchEventHandlers(fractalApp);
    registerMouseEventHandlers(fractalApp);
    console.log('Event handlers registered.');

    // If the URL contains the required parameters, load them.
    const params = new URLSearchParams(window.location.search);
    if (params.has('cx') && params.has('cy') && params.has('zoom')) {
        loadFractalParamsFromURL(fractalApp);
        fractalApp.animatePanAndZoomTo(fractalApp.pan, fractalApp.zoom, 500);
    } else {
        // Otherwise, clear any invalid URL parameters and reset to default.
        clearURLParams();
        fractalApp.reset();
    }

    // Kick off the initial render.
    console.log('Init complete.');
}, {once: true});