/**
 * @module Main
 * @author Radim Brnka
 * @description The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), initializes the UI and the fractal.
 */

import './css/style.css';
import {JuliaRenderer} from "./renderers/juliaRenderer";
import {MandelbrotRenderer} from "./renderers/mandelbrotRenderer";
import {initUI, resetActivePresetIndex, resetPresetAndDiveButtonStates, updateInfo} from "./ui/ui";
import {asyncDelay, clearURLParams, loadFractalParamsFromURL} from "./global/utils";
import {DEBUG_MODE, DEFAULT_CONSOLE_GROUP_COLOR, FRACTAL_TYPE} from "./global/constants";

/**
 * Initializes the canvas, reads URL params and triggers respective fractal rendering
 */
async function initFractalApp() {
    if (DEBUG_MODE) console.warn(' --- DEBUG MODE ACTIVE! ---');
    console.groupCollapsed(`%c initFractalApp`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

    const canvas = document.getElementById('fractalCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const params = loadFractalParamsFromURL();
    console.log(`URL Params found:  ${JSON.stringify(params)}`);

    // Do we have all the params needed for initial travel?
    const validMandelbrotTravelPreset = params.px != null && params.py != null && params.zoom != null && params.r != null;
    const validJuliaTravelPreset = validMandelbrotTravelPreset && params.cx != null && params.cy != null;
    const preset = {
        pan: [params.px, params.py],
        zoom: params.zoom,
        c: [params.cx, params.cy],
        rotation: params.r
    };

    const onDefault = () => {
        console.log(`Default fractal settings used.`);
        fractalApp.resizeCanvas();
        clearURLParams();
    }

    let fractalApp;

    switch (params.mode) {
        /************
         * JULIA SET
         ************/
        case FRACTAL_TYPE.JULIA:
            console.log(`Constructing Julia.`);
            fractalApp = new JuliaRenderer(canvas);
            break;

        /****************
         * MANDELBROT SET
         ****************/
        case FRACTAL_TYPE.MANDELBROT:
            console.log(`Constructing Mandelbrot.`);
            fractalApp = new MandelbrotRenderer(canvas);
            break;

        default:
            console.error('Unknown fractal mode: ' + params.mode);
            break;
    }

    await asyncDelay(100); // Wait a moment for things to stabilize
    await initUI(fractalApp); // TODO consider initializing after travel

    if (validJuliaTravelPreset) {
        console.log(`Traveling to URL params.`);
        await fractalApp.animateTravelToPreset(preset, 1000);
    } else if (validMandelbrotTravelPreset) {
        console.log(`Traveling to URL params.`);
        await fractalApp.animateTravelToPreset(preset, 100, 1000);
    } else {
        onDefault();
    }

    await asyncDelay(100); // Wait a moment for things to stabilize

    await new Promise(resolve => {
        document.getElementById('headerContainer').classList.add('ready');
        document.getElementById('infoLabel').classList.add('ready');
        resolve();
    });

    // If URL contains a preset, reset buttons
    if (validMandelbrotTravelPreset || validJuliaTravelPreset) {
        resetPresetAndDiveButtonStates();
        resetActivePresetIndex();
    }

    console.groupEnd();
}

document.addEventListener('DOMContentLoaded', async () => {
        if (DEBUG_MODE) console.log('%c DOMContentLoaded: %c Initializing fractal.', `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #ff0');

        await initFractalApp();
        console.log('%c DOMContentLoaded: %c Fractal init complete.', `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #0f0');

        await asyncDelay(2000); // Wait a moment for things to stabilize
        updateInfo();
    },
    {
        once: true
    }
);