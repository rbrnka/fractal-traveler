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

document.addEventListener('DOMContentLoaded', () => {
    // Create the fractal application instance.
    const fractalApp = new MandelbrotRenderer('fractalCanvas');

    // Register control events
    registerTouchEventHandlers(fractalApp);
    registerMouseEventHandlers(fractalApp);

    // Kick off the initial render.
    fractalApp.draw();

    // Now that fractalApp is initialized, set up UI and event handlers.
    initUI(fractalApp);
});