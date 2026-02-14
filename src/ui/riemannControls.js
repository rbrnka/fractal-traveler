/**
 * @module RiemannControls
 * @description Riemann zeta function parameter controls and overlays
 * @author Radim Brnka
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {log} from '../global/constants';
import * as axesOverlay from './axesOverlay';
import * as zetaPathOverlay from './zetaPathOverlay';

let renderer = null;
let controlsContainer = null;

// Toggle elements
let criticalLineToggle = null;
let analyticExtToggle = null;
let axesToggle = null;
let zetaPathToggle = null;

// Dropdown elements
let displayDropdown = null;
let displayToggle = null;
let displayMenu = null;

// Slider elements
let freqRSlider = null;
let freqGSlider = null;
let freqBSlider = null;
let contourSlider = null;
let termsSlider = null;

// Value displays
let freqRValue = null;
let freqGValue = null;
let freqBValue = null;
let contourValue = null;
let termsValue = null;

// ─────────────────────────────────────────────────────────────────────────────
// Toggle handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleCriticalLineToggle() {
    if (!renderer || renderer.showCriticalLine === undefined) return;
    renderer.showCriticalLine = !renderer.showCriticalLine;
    criticalLineToggle?.classList.toggle('active', renderer.showCriticalLine);
    log(`Critical line: ${renderer.showCriticalLine ? 'ON' : 'OFF'}`);
    renderer.draw();
}

function handleAnalyticExtToggle() {
    if (!renderer || renderer.useAnalyticExtension === undefined) return;
    renderer.useAnalyticExtension = !renderer.useAnalyticExtension;
    analyticExtToggle?.classList.toggle('active', renderer.useAnalyticExtension);
    log(`Analytic Extension: ${renderer.useAnalyticExtension ? 'ON' : 'OFF'}`);
    renderer.draw();
}

function handleAxesToggle() {
    const visible = axesOverlay.toggle();
    axesToggle?.classList.toggle('active', visible);
}

function handleZetaPathToggle() {
    const visible = zetaPathOverlay.toggle();
    zetaPathToggle?.classList.toggle('active', visible);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slider handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleFreqRChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.frequency[0] = value;
    freqRValue.textContent = value.toFixed(1);
    renderer.draw();
}

function handleFreqGChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.frequency[1] = value;
    freqGValue.textContent = value.toFixed(1);
    renderer.draw();
}

function handleFreqBChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.frequency[2] = value;
    freqBValue.textContent = value.toFixed(1);
    renderer.draw();
}

function handleContourChange(e) {
    if (!renderer) return;
    const value = parseFloat(e.target.value);
    renderer.contourStrength = value;
    contourValue.textContent = value.toFixed(2);
    renderer.draw();
}

function handleTermsChange(e) {
    if (!renderer) return;
    const value = parseInt(e.target.value, 10);
    renderer.seriesTerms = value;
    termsValue.textContent = value.toString();
    renderer.draw();
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown handlers
// ─────────────────────────────────────────────────────────────────────────────

function toggleDisplayDropdown() {
    if (!displayMenu) return;
    displayMenu.classList.toggle('show');
    const isOpen = displayMenu.classList.contains('show');
    if (displayToggle) {
        displayToggle.textContent = isOpen ? 'Display ▴' : 'Display ▾';
    }
}

/**
 * Closes the display dropdown
 */
export function closeDisplayDropdown() {
    if (displayMenu) {
        displayMenu.classList.remove('show');
    }
    if (displayToggle) {
        displayToggle.textContent = 'Display ▾';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initializes Riemann controls
 * @param {Object} riemannRenderer
 * @param {Function} closeOtherDropdowns - Callback to close other dropdowns
 */
export function init(riemannRenderer, closeOtherDropdowns) {
    renderer = riemannRenderer;

    // Bind elements
    controlsContainer = document.getElementById('riemannControls');
    displayDropdown = document.getElementById('riemann-display-dropdown');
    displayToggle = document.getElementById('riemann-display-toggle');
    displayMenu = document.getElementById('riemann-display-menu');
    criticalLineToggle = document.getElementById('criticalLineToggle');
    analyticExtToggle = document.getElementById('analyticExtToggle');
    axesToggle = document.getElementById('axesToggle');
    zetaPathToggle = document.getElementById('zetaPathToggle');
    freqRSlider = document.getElementById('freqRSlider');
    freqGSlider = document.getElementById('freqGSlider');
    freqBSlider = document.getElementById('freqBSlider');
    contourSlider = document.getElementById('contourSlider');
    termsSlider = document.getElementById('termsSlider');
    freqRValue = document.getElementById('freqRValue');
    freqGValue = document.getElementById('freqGValue');
    freqBValue = document.getElementById('freqBValue');
    contourValue = document.getElementById('contourValue');
    termsValue = document.getElementById('termsValue');

    if (!controlsContainer) return;

    // Show controls
    controlsContainer.style.display = 'flex';

    // Show display dropdown
    if (displayDropdown) {
        displayDropdown.classList.add('visible');
    }

    // Initialize overlays
    const axesCanvas = document.getElementById('axesCanvas');
    const zetaPathCanvas = document.getElementById('zetaPathCanvas');
    axesOverlay.init(axesCanvas, renderer);
    zetaPathOverlay.init(zetaPathCanvas, renderer);

    // Set up draw callback for overlay updates
    renderer.onDrawCallback = () => {
        axesOverlay.update();
        zetaPathOverlay.update();
    };

    // Initialize toggle states
    if (criticalLineToggle) {
        criticalLineToggle.classList.toggle('active', renderer.showCriticalLine);
        criticalLineToggle.addEventListener('click', handleCriticalLineToggle);
    }

    if (analyticExtToggle) {
        analyticExtToggle.classList.toggle('active', renderer.useAnalyticExtension);
        analyticExtToggle.addEventListener('click', handleAnalyticExtToggle);
    }

    if (axesToggle) {
        axesToggle.classList.toggle('active', axesOverlay.isVisible());
        axesToggle.addEventListener('click', handleAxesToggle);
    }

    if (zetaPathToggle) {
        zetaPathToggle.classList.toggle('active', zetaPathOverlay.isVisible());
        zetaPathToggle.addEventListener('click', handleZetaPathToggle);
    }

    // Initialize dropdown
    if (displayToggle && displayMenu) {
        displayToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (closeOtherDropdowns) closeOtherDropdowns();
            toggleDisplayDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!displayDropdown?.contains(e.target)) {
                closeDisplayDropdown();
            }
        });
    }

    // Initialize sliders
    if (freqRSlider && renderer.frequency) {
        freqRSlider.value = renderer.frequency[0];
        freqRValue.textContent = renderer.frequency[0].toFixed(1);
        freqRSlider.addEventListener('input', handleFreqRChange);
    }

    if (freqGSlider && renderer.frequency) {
        freqGSlider.value = renderer.frequency[1];
        freqGValue.textContent = renderer.frequency[1].toFixed(1);
        freqGSlider.addEventListener('input', handleFreqGChange);
    }

    if (freqBSlider && renderer.frequency) {
        freqBSlider.value = renderer.frequency[2];
        freqBValue.textContent = renderer.frequency[2].toFixed(1);
        freqBSlider.addEventListener('input', handleFreqBChange);
    }

    if (contourSlider && renderer.contourStrength !== undefined) {
        contourSlider.value = renderer.contourStrength;
        contourValue.textContent = renderer.contourStrength.toFixed(2);
        contourSlider.addEventListener('input', handleContourChange);
    }

    if (termsSlider && renderer.seriesTerms !== undefined) {
        termsSlider.value = renderer.seriesTerms;
        termsValue.textContent = renderer.seriesTerms.toString();
        termsSlider.addEventListener('input', handleTermsChange);
    }

    // Turn on axes by default
    if (!axesOverlay.isVisible()) {
        axesOverlay.show();
        axesToggle?.classList.add('active');
    }

    log('Riemann controls initialized');
}

/**
 * Destroys Riemann controls
 */
export function destroy() {
    if (controlsContainer) {
        controlsContainer.style.display = 'none';
    }

    // Hide dropdown
    if (displayDropdown) {
        displayDropdown.classList.remove('visible');
    }

    // Clear draw callback
    if (renderer) {
        renderer.onDrawCallback = null;
    }

    // Remove toggle listeners
    if (criticalLineToggle) criticalLineToggle.removeEventListener('click', handleCriticalLineToggle);
    if (analyticExtToggle) analyticExtToggle.removeEventListener('click', handleAnalyticExtToggle);
    if (axesToggle) axesToggle.removeEventListener('click', handleAxesToggle);
    if (zetaPathToggle) zetaPathToggle.removeEventListener('click', handleZetaPathToggle);

    // Remove slider listeners
    if (freqRSlider) freqRSlider.removeEventListener('input', handleFreqRChange);
    if (freqGSlider) freqGSlider.removeEventListener('input', handleFreqGChange);
    if (freqBSlider) freqBSlider.removeEventListener('input', handleFreqBChange);
    if (contourSlider) contourSlider.removeEventListener('input', handleContourChange);
    if (termsSlider) termsSlider.removeEventListener('input', handleTermsChange);

    // Hide overlays
    closeDisplayDropdown();
    axesOverlay.hide();
    zetaPathOverlay.hide();
    axesToggle?.classList.remove('active');
    zetaPathToggle?.classList.remove('active');

    renderer = null;
    log('Riemann controls destroyed');
}

/**
 * Syncs toggle button states with renderer
 */
export function syncToggleStates() {
    if (!renderer) return;

    if (criticalLineToggle && renderer.showCriticalLine !== undefined) {
        criticalLineToggle.classList.toggle('active', renderer.showCriticalLine);
    }

    if (analyticExtToggle && renderer.useAnalyticExtension !== undefined) {
        analyticExtToggle.classList.toggle('active', renderer.useAnalyticExtension);
    }

    if (zetaPathToggle) {
        zetaPathToggle.classList.toggle('active', zetaPathOverlay.isVisible());
    }
}

/**
 * Syncs all UI controls with renderer state
 */
export function sync() {
    syncToggleStates();

    if (!renderer) return;

    if (freqRSlider && renderer.frequency) {
        freqRSlider.value = renderer.frequency[0];
        freqRValue.textContent = renderer.frequency[0].toFixed(1);
    }

    if (freqGSlider && renderer.frequency) {
        freqGSlider.value = renderer.frequency[1];
        freqGValue.textContent = renderer.frequency[1].toFixed(1);
    }

    if (freqBSlider && renderer.frequency) {
        freqBSlider.value = renderer.frequency[2];
        freqBValue.textContent = renderer.frequency[2].toFixed(1);
    }

    if (contourSlider && renderer.contourStrength !== undefined) {
        contourSlider.value = renderer.contourStrength;
        contourValue.textContent = renderer.contourStrength.toFixed(2);
    }

    if (termsSlider && renderer.seriesTerms !== undefined) {
        termsSlider.value = renderer.seriesTerms;
        termsValue.textContent = renderer.seriesTerms.toString();
    }
}

/**
 * Handles window resize for overlays
 */
export function handleResize() {
    axesOverlay.resize();
    zetaPathOverlay.resize();
}

/**
 * Toggles the axes overlay (for hotkey)
 */
export function toggleAxes() {
    handleAxesToggle();
}

/**
 * Toggles the zeta path overlay (for hotkey)
 */
export function toggleZetaPath() {
    handleZetaPathToggle();
}
