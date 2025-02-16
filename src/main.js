/**
 * @module Main
 * @author Radim Brnka
 * @description The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), initializes the UI and the fractal.
 */

import './css/style.css';
import {JuliaRenderer} from "./renderers/juliaRenderer";
import {MandelbrotRenderer} from "./renderers/mandelbrotRenderer";
import {initUI, resetActivePresetIndex, resetPresetAndDiveButtonStates} from "./ui/ui";
import {clearURLParams, loadFractalParamsFromURL} from "./global/utils";
import {DEBUG_MODE, DEFAULT_CONSOLE_GROUP_COLOR, FRACTAL_TYPE} from "./global/constants";

/**
 * Initializes the canvas, reads URL params and triggers respective fractal rendering
 */
async function initFractalApp() {
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
        fractalApp.reset();
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
            if (validJuliaTravelPreset) {
                console.log(`Traveling to URL params.`);
                await fractalApp.animateTravelToPreset(preset, 500);
            } else {
                onDefault();
            }
            break;

        /****************
         * MANDELBROT SET
         ****************/
        case FRACTAL_TYPE.MANDELBROT:
            console.log(`Constructing Mandelbrot.`);
            fractalApp = new MandelbrotRenderer(canvas);
            if (validMandelbrotTravelPreset) {
                console.log(`Traveling to URL params.`);
                await fractalApp.animatePanZoomRotationTo(preset.pan, preset.zoom, preset.rotation, 500);
            } else {
                onDefault();
            }
            break;

        default:
            console.error('Unknown fractal mode: ' + params.mode);
            break;
    }

    await initUI(fractalApp);

    // If URL contains a preset, reset buttons
    if (validMandelbrotTravelPreset || validJuliaTravelPreset) {
        resetPresetAndDiveButtonStates();
        resetActivePresetIndex();
    }
    console.groupEnd();
}

document.addEventListener('DOMContentLoaded', async () => {
        if (DEBUG_MODE) console.log('%c DOMContentLoaded triggered. Initializing fractal.', 'color: #ff0');
        await initFractalApp();
        console.log('%c Fractal init complete.', 'color: #0f0');
    },
    {
        once: true
    }
);