/**
 * @module RosslerControls
 * @description Rossler attractor parameter controls
 * @author Radim Brnka
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {log} from '../global/constants';

let renderer = null;
let controlsContainer = null;

// Slider elements
let aSlider = null;
let bSlider = null;
let cSlider = null;
let freqRSlider = null;
let freqGSlider = null;
let freqBSlider = null;
let iterSlider = null;

// Value display elements
let aValue = null;
let bValue = null;
let cValue = null;
let freqRValue = null;
let freqGValue = null;
let freqBValue = null;
let iterValue = null;

// ─────────────────────────────────────────────────────────────────────────────
// Slider handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleAChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.a = value;
    aValue.textContent = value.toFixed(2);
    renderer.draw();
}

function handleBChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.b = value;
    bValue.textContent = value.toFixed(2);
    renderer.draw();
}

function handleCChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.c = value;
    cValue.textContent = value.toFixed(1);
    renderer.draw();
}

function handleFreqRChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.frequency[0] = value;
    freqRValue.textContent = value.toFixed(2);
    renderer.draw();
}

function handleFreqGChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.frequency[1] = value;
    freqGValue.textContent = value.toFixed(2);
    renderer.draw();
}

function handleFreqBChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.frequency[2] = value;
    freqBValue.textContent = value.toFixed(2);
    renderer.draw();
}

function handleIterChange(e) {
    if (!renderer) return;
    const value = parseInt(e.target.value, 10);
    renderer.iterations = value;
    iterValue.textContent = value.toString();
    renderer.draw();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initializes Rossler controls
 * @param {Object} rosslerRenderer
 */
export function init(rosslerRenderer) {
    renderer = rosslerRenderer;

    // Bind elements
    controlsContainer = document.getElementById('rosslerControls');
    aSlider = document.getElementById('rosslerASlider');
    bSlider = document.getElementById('rosslerBSlider');
    cSlider = document.getElementById('rosslerCSlider');
    freqRSlider = document.getElementById('rosslerFreqRSlider');
    freqGSlider = document.getElementById('rosslerFreqGSlider');
    freqBSlider = document.getElementById('rosslerFreqBSlider');
    iterSlider = document.getElementById('rosslerIterSlider');
    aValue = document.getElementById('rosslerAValue');
    bValue = document.getElementById('rosslerBValue');
    cValue = document.getElementById('rosslerCValue');
    freqRValue = document.getElementById('rosslerFreqRValue');
    freqGValue = document.getElementById('rosslerFreqGValue');
    freqBValue = document.getElementById('rosslerFreqBValue');
    iterValue = document.getElementById('rosslerIterValue');

    if (!controlsContainer) return;

    // Show controls
    controlsContainer.style.display = 'flex';

    // Initialize slider values
    if (aSlider && renderer.a !== undefined) {
        aSlider.value = renderer.a;
        aValue.textContent = renderer.a.toFixed(2);
        aSlider.addEventListener('input', handleAChange);
    }

    if (bSlider && renderer.b !== undefined) {
        bSlider.value = renderer.b;
        bValue.textContent = renderer.b.toFixed(2);
        bSlider.addEventListener('input', handleBChange);
    }

    if (cSlider && renderer.c !== undefined) {
        cSlider.value = renderer.c;
        cValue.textContent = renderer.c.toFixed(1);
        cSlider.addEventListener('input', handleCChange);
    }

    if (freqRSlider && renderer.frequency) {
        freqRSlider.value = renderer.frequency[0];
        freqRValue.textContent = renderer.frequency[0].toFixed(2);
        freqRSlider.addEventListener('input', handleFreqRChange);
    }

    if (freqGSlider && renderer.frequency) {
        freqGSlider.value = renderer.frequency[1];
        freqGValue.textContent = renderer.frequency[1].toFixed(2);
        freqGSlider.addEventListener('input', handleFreqGChange);
    }

    if (freqBSlider && renderer.frequency) {
        freqBSlider.value = renderer.frequency[2];
        freqBValue.textContent = renderer.frequency[2].toFixed(2);
        freqBSlider.addEventListener('input', handleFreqBChange);
    }

    if (iterSlider && renderer.iterations !== undefined) {
        iterSlider.value = renderer.iterations;
        iterValue.textContent = renderer.iterations.toString();
        iterSlider.addEventListener('input', handleIterChange);
    }

    log('Rossler controls initialized');
}

/**
 * Destroys Rossler controls
 */
export function destroy() {
    if (controlsContainer) {
        controlsContainer.style.display = 'none';
    }

    // Remove event listeners
    if (aSlider) aSlider.removeEventListener('input', handleAChange);
    if (bSlider) bSlider.removeEventListener('input', handleBChange);
    if (cSlider) cSlider.removeEventListener('input', handleCChange);
    if (freqRSlider) freqRSlider.removeEventListener('input', handleFreqRChange);
    if (freqGSlider) freqGSlider.removeEventListener('input', handleFreqGChange);
    if (freqBSlider) freqBSlider.removeEventListener('input', handleFreqBChange);
    if (iterSlider) iterSlider.removeEventListener('input', handleIterChange);

    renderer = null;
    log('Rossler controls destroyed');
}

/**
 * Syncs UI controls with renderer state
 */
export function sync() {
    if (!renderer) return;

    if (aSlider && renderer.a !== undefined) {
        aSlider.value = renderer.a;
        aValue.textContent = renderer.a.toFixed(2);
    }

    if (bSlider && renderer.b !== undefined) {
        bSlider.value = renderer.b;
        bValue.textContent = renderer.b.toFixed(2);
    }

    if (cSlider && renderer.c !== undefined) {
        cSlider.value = renderer.c;
        cValue.textContent = renderer.c.toFixed(1);
    }

    if (freqRSlider && renderer.frequency) {
        freqRSlider.value = renderer.frequency[0];
        freqRValue.textContent = renderer.frequency[0].toFixed(2);
    }

    if (freqGSlider && renderer.frequency) {
        freqGSlider.value = renderer.frequency[1];
        freqGValue.textContent = renderer.frequency[1].toFixed(2);
    }

    if (freqBSlider && renderer.frequency) {
        freqBSlider.value = renderer.frequency[2];
        freqBValue.textContent = renderer.frequency[2].toFixed(2);
    }

    if (iterSlider && renderer.iterations !== undefined) {
        iterSlider.value = renderer.iterations;
        iterValue.textContent = renderer.iterations.toString();
    }
}
