/**
 * @module JuliaSlidersController
 * @author Radim Brnka
 * @description Controller of Julia slider elements directly interacting with the c-value of Julia fractal.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE} from "../global/constants";
import {isJuliaMode, resetPresetAndDiveButtonStates, updateInfo} from "./ui";
import {clearURLParams} from "../global/utils";
import {JuliaRenderer} from "../renderers/juliaRenderer";

/**
 * Throttle limit in milliseconds
 * @type {number}
 */
const SLIDER_UPDATE_THROTTLE_LIMIT = 10;

let sliderContainer;
let realSlider;
let imagSlider;
let realSliderValue;
let imagSliderValue;
let lastSliderUpdate = 0; // Tracks the last time the sliders were updated

let fractalApp;

/**
 * Initializes the elements and their event listeners
 * @param {FractalRenderer} app
 */
export function initJuliaSliders(app) {
    if (!(app instanceof JuliaRenderer)) {
        console.error(`%c initJuliaSliders: %c Can only attach to JuliaRenderer, not ${app}!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    fractalApp = app;

    realSlider = document.getElementById('realSlider');
    realSliderValue = document.getElementById('realSliderValue');
    imagSlider = document.getElementById('imagSlider');
    imagSliderValue = document.getElementById('imagSliderValue');

    realSlider.addEventListener('input', onRealSliderChange);
    imagSlider.addEventListener('input', onImagSliderChange);

    sliderContainer = document.getElementById('sliders');
    sliderContainer.style.display = 'flex';

    console.log(`%c initJuliaSliders: %c Initialized.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
}

function onSliderChangeFinished() {
    fractalApp.draw();
    updateInfo();
    clearURLParams();
    resetPresetAndDiveButtonStates();
    fractalApp.demoTime = 0;
}

function onRealSliderChange() {
    fractalApp.c[0] = parseFloat(realSlider.value);
    realSliderValue.innerText = fractalApp.c[0].toFixed(2);
    onSliderChangeFinished();
}

function onImagSliderChange() {
    fractalApp.c[1] = parseFloat(imagSlider.value);
    imagSliderValue.innerText = fractalApp.c[1].toFixed(2) + 'i';
    onSliderChangeFinished();
}

// region > External methods ------------------------------------------------------------------------------------------
/** Destructor. Removes listeners and hides elements. */
export function destroyJuliaSliders() {
    if (realSlider && imagSlider && sliderContainer) {
        realSlider.removeEventListener('input', onRealSliderChange);
        imagSlider.removeEventListener('input', onImagSliderChange);

        sliderContainer.style.display = 'none';

        console.log(`%c destroyJuliaSliders: %c Destroyed.`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
    } else {
        console.warn(`%c destroyJuliaSliders: %c Called on not initialized state!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
    }
}

/** Resets sliders */
export function resetJuliaSliders() {
    if (!isJuliaMode()) {
        console.warn(`%c resetJuliaSliders: %c Not in Julia mode!`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
        return;
    }

    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
    realSliderValue.innerText = realSlider.value;
    imagSliderValue.innerText = imagSlider.value + 'i';
    fractalApp.demoTime = 0;
}

/** Updates the real/imaginary sliders appropriately */
export function updateJuliaSliders() {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastSliderUpdate;

    if (timeSinceLastUpdate < SLIDER_UPDATE_THROTTLE_LIMIT) {
        return; // Skip update if called too soon
    }

    // Update the last update time
    lastSliderUpdate = now;
    realSliderValue.innerText = fractalApp.c[0].toFixed(2);
    imagSliderValue.innerText = fractalApp.c[1].toFixed(2) + 'i';
    realSlider.value = parseFloat(fractalApp.c[0].toFixed(2));
    imagSlider.value = parseFloat(fractalApp.c[1].toFixed(2));
}

/** Disable slider controls */
export function disableJuliaSliders() {
    imagSlider.disabled = true;
    realSlider.disabled = true;

    realSlider.classList.add('thumbDisabled');
    imagSlider.classList.add('thumbDisabled');
}

/** Enable slider controls */
export function enableJuliaSliders() {
    imagSlider.disabled = false;
    realSlider.disabled = false;

    realSlider.classList.remove('thumbDisabled');
    imagSlider.classList.remove('thumbDisabled');
}

// endregion -----------------------------------------------------------------------------------------------------------