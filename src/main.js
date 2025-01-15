// main.js
import './css/style.css';

import {MandelbrotRenderer} from './mandelbrotRenderer.js';
import {initUI} from './ui.js';

// TODO device selection - if (isMobile()) {
import {registerTouchEventHandlers} from './touchEventHandlers.js';
import {registerMouseEventHandlers} from './mouseEventHandlers.js';
import {loadFractalParamsFromURL} from "./utils.js";

document.addEventListener('DOMContentLoaded', () => {
    // Create the fractal application instance.
    const fractalApp = new MandelbrotRenderer('fractalCanvas');

    registerTouchEventHandlers(fractalApp);
    registerMouseEventHandlers(fractalApp);

    // Kick off the initial render.
    fractalApp.draw();

    // Now that fractalApp is initialized, set up UI and event handlers.
    initUI(fractalApp);
});