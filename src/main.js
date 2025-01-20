/**
 * @module main
 * @author Radim Brnka
 */
import './css/style.css';

import {MandelbrotRenderer} from './mandelbrotRenderer.js';
import {initUI} from './ui.js';
import {clearURLParams, loadFractalParamsFromURL} from "./utils";
import {JuliaRenderer} from "./juliaRenderer";

document.addEventListener('DOMContentLoaded', () => {

    // Create the fractal application instance.
    const canvas = document.getElementById('fractalCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fractalApp = new JuliaRenderer(canvas);
    fractalApp.init();

    // Now that fractalApp is initialized, set up UI and event handlers.
    initUI(fractalApp);
    console.log('UI initialized');

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

    // Get sliders
    const realSlider = document.getElementById('realSlider');
    const imagSlider = document.getElementById('imagSlider');

    // Initial Julia constant
    let c = [parseFloat(realSlider.value), parseFloat(imagSlider.value)];
fractalApp.c = c;
    fractalApp.draw();

    // Update `c` dynamically when sliders are moved
    realSlider.addEventListener('input', () => {
        c[0] = parseFloat(realSlider.value);
        fractalApp.c = c;
        fractalApp.draw(c);
    });

    imagSlider.addEventListener('input', () => {
        c[1] = parseFloat(imagSlider.value);
        fractalApp.c = c;
        fractalApp.draw(c);
    });

    // Kick off the initial render.
    console.log('Init complete.');
}, {once: true});