// src/tests/mouseEventHandlers.test.js

import { registerMouseEventHandlers } from '../mouseEventHandlers.js';
import {clearURLParams} from "../utils";

beforeAll(() => {
    // If clipboard isn't defined, set up a mock implementation.
    if (!navigator.clipboard) {
        navigator.clipboard = {
            writeText: jest.fn().mockResolvedValue(),
        };
    } else {
        // If it is defined, you can spy on it:
        jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    }
});


describe('Mouse Event Handlers', () => {
    let canvas, fractalApp;

    beforeEach(() => {
        // Set up a basic DOM structure.
        document.body.innerHTML = `
      <canvas id="fractalCanvas" width="800" height="600"></canvas>
    `;
        canvas = document.getElementById('fractalCanvas');

        // Create a dummy fractalApp with the minimum properties needed.
        fractalApp = {
            canvas,
            pan: [-0.5, 0.0],
            zoom: 3.0,
            draw: jest.fn(),
            animatePanAndZoomTo: jest.fn(),
            // For testing, a simple screenToFractal that just does a trivial conversion:
            screenToFractal: (x, y) => {
                // For example, map center of canvas (400,300) to the current pan.
                // Here we simply return [x/100, y/100] for testing purposes.
                return [x / 100, y / 100];
            }
        };

        // Ensure that URL parameters are cleared before tests.
        clearURLParams();

        // Register the mouse event handlers on the dummy fractalApp.
        registerMouseEventHandlers(fractalApp);
    });

    afterEach(() => {
        // Clear any timeouts if needed.
        jest.clearAllTimers();
    });

    test('wheel event should update zoom and call draw', () => {
        // Set up an initial zoom value.
        fractalApp.zoom = 3.0;
        fractalApp.pan = [-0.5, 0.0];

        // Create a wheel event with deltaY > 0 (e.g., simulating a zoom out)
        const wheelEvent = new WheelEvent('wheel', {
            deltaY: 100,
            clientX: 400, // center
            clientY: 300, // center
            bubbles: true
        });

        canvas.dispatchEvent(wheelEvent);

        // Check that draw has been called (meaning the event was processed)
        expect(fractalApp.draw).toHaveBeenCalled();

        // Also verify that zoom has been updated (it should not equal the original 3.0).
        expect(fractalApp.zoom).not.toEqual(3.0);
    });

    test('mousedown and mousemove should pan the fractal and call draw', () => {
        // Set up starting positions.
        fractalApp.zoom = 3.0;
        fractalApp.pan = [-0.5, 0.0];

        // Simulate mousedown on the canvas with left button.
        const mousedownEvent = new MouseEvent('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100,
            bubbles: true
        });
        canvas.dispatchEvent(mousedownEvent);

        // Simulate a mousemove that exceeds the drag threshold.
        const mousemoveEvent = new MouseEvent('mousemove', {
            buttons: 1,
            clientX: 200,
            clientY: 200,
            bubbles: true
        });
        canvas.dispatchEvent(mousemoveEvent);

        // Check that draw is called, indicating that panning occurred.
        expect(fractalApp.draw).toHaveBeenCalled();

        // And since panning adjusts values, the pan should be updated.
        expect(fractalApp.pan[0]).not.toEqual(-0.5);
        expect(fractalApp.pan[1]).not.toEqual(0.0);
    });

    test('mouseup without drag triggers click action (single-click center)', (done) => {
        // Simulate a click (no significant movement)
        fractalApp.zoom = 3.0;
        fractalApp.pan = [-0.5, 0.0];

        // Simulate mousedown.
        const mousedownEvent = new MouseEvent('mousedown', {
            button: 0,
            clientX: 300,
            clientY: 300,
            bubbles: true
        });
        canvas.dispatchEvent(mousedownEvent);

        // Immediately simulate mouseup, indicating a click.
        const mouseupEvent = new MouseEvent('mouseup', {
            button: 0,
            clientX: 300,
            clientY: 300,
            bubbles: true
        });
        canvas.dispatchEvent(mouseupEvent);

        // Our mouseup handler uses a timeout for the single click action.
        // Wait a little longer than the doubleClickThreshold (300ms) to let the timeout complete.
        setTimeout(() => {
            // We expect that updateURLParams was called and animatePanAndZoomTo was used to center.
            // Since we cannot directly verify updateURLParams without a spy unless we mock it,
            // we check that animatePanAndZoomTo was called.
            expect(fractalApp.animatePanAndZoomTo).toHaveBeenCalled();
            done();
        }, 350);
    });
});
