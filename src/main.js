/**
 * @module main
 * @author Radim Brnka
 */
import './css/style.css';
import {JuliaRenderer} from "./juliaRenderer";
import {MandelbrotRenderer} from "./mandelbrotRenderer";
import {enableJuliaMode, initUI, MODE_JULIA, MODE_MANDELBROT} from "./ui";
import {clearURLParams, loadFractalParamsFromURL} from "./utils";

document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded triggered');

        // Create the fractal application instance.
        const canvas = document.getElementById('fractalCanvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const params = loadFractalParamsFromURL();
        console.log("URL: " + JSON.stringify(params));

        // Do we have all the params needed for initial travel?
        const validMandelbrotPreset = params.px != null && params.py != null && params.zoom != null && params.r != null;
        const validJuliaPreset = validMandelbrotPreset && params.cx != null && params.cy != null;
        const preset = {
            pan: [params.px, params.py],
            zoom: params.zoom,
            c: [params.cx, params.cy],
            rotation: params.r
        };

        console.log("Preset: " + JSON.stringify(preset));

        const onDefault = () => {
            fractalApp.reset();
            clearURLParams();
        }

        let fractalApp;

        switch (params.mode) {
            case MODE_JULIA:
                enableJuliaMode();
                fractalApp = new JuliaRenderer(canvas);
                fractalApp.init();
                if (validMandelbrotPreset) {
                    fractalApp.animateTravelToPreset(preset, 500);
                    console.log("Constructing Julia from URL params");
                } else {
                    console.log("Constructing default Julia");
                    onDefault();
                }
                break;

            case MODE_MANDELBROT:
                fractalApp = new MandelbrotRenderer(canvas);
                fractalApp.init();
                if (validJuliaPreset) {
                    fractalApp.animatePanZoomRotate(preset.pan, preset.zoom, preset.rotation, 500);
                    console.log("Constructing Mandelbrot from URL params");
                } else {
                    console.log("Constructing default Mandelbrot");
                    onDefault();
                }
                break;

            default:
                console.error('Unknown fractal mode: ' + params.mode);
                break;
        }

        initUI(fractalApp);
        console.log('Init complete.');
    },
    {
        once: true
    }
);