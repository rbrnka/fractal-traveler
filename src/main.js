import './css/style.css';
import {JuliaRenderer} from "./renderers/juliaRenderer";
import {MandelbrotRenderer} from "./renderers/mandelbrotRenderer";
import {initUI, MODE_JULIA, MODE_MANDELBROT, resetActivePresetIndex, resetPresetAndDiveButtonStates} from "./ui/ui";
import {clearURLParams, loadFractalParamsFromURL} from "./global/utils";

/**
 * @module Main
 * @author Radim Brnka
 * @description The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), initializes the UI and the fractal.
 */

/**
 * Initializes the canvas, reads URL params and triggers respective fractal rendering
 */
function start() {
    const canvas = document.getElementById('fractalCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const params = loadFractalParamsFromURL();
    console.log(`%c start: %c Reading URL: ${JSON.stringify(params)}`, 'color: #bada55', 'color: #fff');

    // Do we have all the params needed for initial travel?
    const validMandelbrotPreset = params.px != null && params.py != null && params.zoom != null && params.r != null;
    const validJuliaPreset = validMandelbrotPreset && params.cx != null && params.cy != null;
    const preset = {
        pan: [params.px, params.py],
        zoom: params.zoom,
        c: [params.cx, params.cy],
        rotation: params.r
    };

    console.log(`%c start: %c Decoded preset: ${JSON.stringify(preset)}`, 'color: #bada55', 'color: #fff');

    const onDefault = () => {
        fractalApp.reset();
        clearURLParams();
    }

    let fractalApp;

    switch (params.mode) {
        /************
         * JULIA SET
         ************/
        case MODE_JULIA:
            fractalApp = new JuliaRenderer(canvas);
            if (validJuliaPreset) {
                fractalApp.animateTravelToPreset(preset, 500);
                console.log(`%c start: %c Constructing Julia from URL params.`, 'color: #bada55', 'color: #fff');
            } else {
                console.log(`%c start: %c Constructing default Julia.`, 'color: #bada55', 'color: #fff');
                onDefault();
            }
            break;
        /****************
         * MANDELBROT SET
         ****************/
        case MODE_MANDELBROT:
            fractalApp = new MandelbrotRenderer(canvas);
            if (validMandelbrotPreset) {
                fractalApp.animatePanZoomRotate(preset.pan, preset.zoom, preset.rotation, 500);
                console.log(`%c start: %c Constructing Mandelbrot from URL params.`, 'color: #bada55', 'color: #fff');
            } else {
                console.log(`%c start: %c Constructing default Mandelbrot from URL params.`, 'color: #bada55', 'color: #fff');
                onDefault();
            }
            break;

        default:
            console.error('Unknown fractal mode: ' + params.mode);
            break;
    }

    initUI(fractalApp);

    // If URL contains a preset, reset buttons
    if (validMandelbrotPreset || validJuliaPreset) {
        resetPresetAndDiveButtonStates();
        resetActivePresetIndex();
    }
    console.log('Init complete.');
}

document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded triggered');
        start();
    },
    {
        once: true
    }
);