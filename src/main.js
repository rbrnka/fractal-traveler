/**
 * @module Main
 * @author Radim Brnka
 * @description The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), initializes the UI and the fractal.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import './css/style.css';
import './css/debugPanel.css';
import {JuliaRenderer} from "./renderers/juliaRenderer";
import MandelbrotRenderer from "./renderers/mandelbrotRenderer";
import RiemannRenderer from "./renderers/riemannRenderer";
import {RosslerRenderer} from "./renderers/rosslerRenderer";
import {initUI, resetActivePresetIndex, resetPresetAndDiveButtonStates, updateInfo} from "./ui/ui";
import {asyncDelay, clearURLParams, loadFractalParamsFromURL} from "./global/utils";
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEBUG_LEVEL, DEBUG_MODE, FRACTAL_TYPE} from "./global/constants";

/**
 * Initializes the canvas, reads URL params and triggers respective fractal rendering
 */
async function initFractalApp() {
    if (DEBUG_MODE > DEBUG_LEVEL.VERBOSE) console.warn(' --- FULL DEBUG MODE ACTIVE! ---');
    console.groupCollapsed(`%c initFractalApp`, CONSOLE_GROUP_STYLE);

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
        rotation: params.r,
        paletteId: params.paletteId
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

        /****************
         * RIEMANN ZETA
         ****************/
        case FRACTAL_TYPE.RIEMANN:
            console.log(`Constructing Riemann Zeta.`);
            fractalApp = new RiemannRenderer(canvas);
            break;

        /****************
         * ROSSLER ATTRACTOR
         ****************/
        case FRACTAL_TYPE.ROSSLER:
            console.log(`Constructing Rossler.`);
            fractalApp = new RosslerRenderer(canvas);
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
        await fractalApp.animateTravelToPreset(preset, 100, 400, 1000);
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
        if (DEBUG_MODE) console.log('%c DOMContentLoaded: %c Initializing fractal.', CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        await initFractalApp();
        console.log('%c DOMContentLoaded: %c Fractal init complete.', CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        await asyncDelay(2000); // Wait a moment for things to stabilize
        updateInfo();
    }, {
        once: true
    }
);