/**
 * @module main
 * @author Radim Brnka
 */
import './css/style.css';
import {JuliaRenderer} from "./juliaRenderer";
import {enableJuliaMode, initUI, MODE_JULIA, MODE_MANDELBROT} from "./ui";
import {MandelbrotRenderer} from "./mandelbrotRenderer";
import {loadFractalParamsFromURL} from "./utils";

document.addEventListener('DOMContentLoaded', () => {
        console.log('Basic test: DOMContentLoaded triggered');

        // Create the fractal application instance.
        const canvas = document.getElementById('fractalCanvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        let fractalApp;

        const params = loadFractalParamsFromURL();

        // http://localhost:8080/#julia?view=eyJtb2RlIjoiMS4wIiwicHgiOiItMC4yOTA0MjIiLCJweSI6Ii0wLjE3NzQ5MyIsInpvb20iOiIwLjAwMDAyNiIsInIiOiItMC42NDkyMDQiLCJjeCI6IjAuMzU1MDAwIiwiY3kiOiIwLjUyMDAwMCJ9
        // http://localhost:8080/#?view=eyJtb2RlIjpudWxsLCJweCI6Ii0wLjcyMTYwNCIsInB5IjoiMC4yNTkxMjYiLCJ6b29tIjoiMC4wMDAwMzgiLCJyIjoiNC42NzAwMDAiLCJjeCI6bnVsbCwiY3kiOm51bGx9

        console.log("URL: " + JSON.stringify(params));

        if (params.mode === MODE_JULIA) {
            enableJuliaMode();
            fractalApp = new JuliaRenderer(canvas);
            console.log("Constructing Julia");
        } else {
            console.log("Constructing Mandelbrot");
            fractalApp = new MandelbrotRenderer(canvas);
        }

        fractalApp.init();
        console.log('Fractal initialized');

        // Do we have all the params needed for initial travel?
        const preset = {
            pan: [params.px, params.py],
            zoom: params.zoom,
            c: [params.cx, params.cy],
            rotation: params.r
        };

        console.log("Preset: " + JSON.stringify(preset));

        if (params.mode === MODE_MANDELBROT && params.px && params.py && params.zoom && params.r != null) {
            fractalApp.animatePanZoomRotate(preset.pan, preset.zoom, preset.rotation, 500);
            console.log("Traveling to URL params! M");
        } else if (params.mode === MODE_JULIA && params.px && params.py && params.zoom && params.r && params.cx && params.cy) {
            fractalApp.animateTravelToPreset(preset, 500);
            console.log("Traveling to URL params! J");
        } else {
            //clearURLParams();
            fractalApp.reset();
            console.log("Initialized default fractal (no or invalid URL params) ");
        }

        initUI(fractalApp);
        console.log('Init complete.');
    },
    {
        once: true
    }
)
;