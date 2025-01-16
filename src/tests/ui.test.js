// src/tests/ui.test.js
import { initUI, updateInfo } from '../ui.js';

describe('UI Module', () => {
    let fractalApp, canvas, header, infoText, resetButton, randomizeColorsButton;

    beforeEach(() => {
        // Set up a basic DOM structure.
        document.body.innerHTML = `
      <canvas id="fractalCanvas"></canvas>
      <div id="headerContainer"></div>
      <div id="infoText"></div>
      <button id="reset">Reset</button>
      <button id="randomize">Randomize Colors</button>
      <button id="preset1">Preset 1</button>
    `;

        // Create a dummy fractalApp with minimal required properties and methods.
        fractalApp = {
            canvas: document.getElementById('fractalCanvas'),
            pan: [-0.5, 0.0],
            zoom: 3.0,
            headerMinimizeTimeout: null,
            reset: jest.mock((fractalApp) => {fractalApp.pan = [-0.5, 0.0]; fractalApp.zoom = 3.0;}),
            draw: jest.fn(),
            animateTravelToPreset: jest.fn(),
            screenToFractal: (x, y) => {
                // Example conversion; just return an array:
                return [x / 100, y / 100];
            },
            PRESETS: [] // add any dummy presets if needed
        };

        // Now initialize UI
        initUI(fractalApp);

        // Get DOM elements for testing if needed.
        canvas = fractalApp.canvas;
        header = document.getElementById('hweaderContainer');
        infoText = document.getElementById('infoText');
        resetButton = document.getElementById('reset');
        randomizeColorsButton = document.getElementById('randomize');
    });

    test('updateInfo displays default values on reset', () => {
        fractalApp.reset();
        expect(infoText.textContent).toContain('cx=-0.500000');
        expect(infoText.textContent).toContain('cy=-0.000000');
        expect(infoText.textContent).toContain('zoom=3.000000');
    });

    // Additional tests for header toggling, event handling, etc.
});
