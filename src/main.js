/**
 * @module main
 * @author Radim Brnka
 */
import './css/style.css';
import {JuliaRenderer} from "./juliaRenderer";
import {enableJuliaMode, initUI, MODE_JULIA} from "./ui";
import {MandelbrotRenderer} from "./mandelbrotRenderer";
import {clearURLParams, loadFractalParamsFromURL} from "./utils";

document.addEventListener('DOMContentLoaded', () => {
    console.log('Basic test: DOMContentLoaded triggered');

    // Create the fractal application instance.
    const canvas = document.getElementById('fractalCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let fractalApp;

    const params = new URLSearchParams(window.location.search);
    if (params.has('mode')) {
        const mode = params.get('mode');

        if (parseInt(mode) === MODE_JULIA) {
            enableJuliaMode();
            fractalApp = new JuliaRenderer(canvas);

            let sliderContainer = document.getElementById('sliders');
            sliderContainer.style.display = 'flex';
        } else {
            fractalApp = new MandelbrotRenderer(canvas);
        }
    } else {
        fractalApp = new MandelbrotRenderer(canvas);
    }

    fractalApp.init();
    console.log('Fractal initialized');

    initUI(fractalApp);
    console.log('UI initialized');

    // If the URL contains the required parameters, load them.
    if (params.has('cx') && params.has('cy') && params.has('zoom')) {
        loadFractalParamsFromURL(fractalApp);
        fractalApp.animatePanAndZoomTo(fractalApp.pan, fractalApp.zoom, 500);
    } else {
        // Otherwise, clear any invalid URL parameters and reset to default.
        clearURLParams();
        fractalApp.reset();
    }

    console.log('Init complete.');
}, {once: true});