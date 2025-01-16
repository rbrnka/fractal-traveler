// src/tests/touchEventHandlers.test.js

import { registerTouchEventHandlers } from '../touchEventHandlers.js';
import { updateURLParams, clearURLParams } from '../utils.js';
import { updateInfo } from '../ui.js';

// Mock our utility functions to avoid side effects.
jest.mock('../utils.js', () => ({
    updateURLParams: jest.fn(),
    clearURLParams: jest.fn(),
}));

jest.mock('../ui.js', () => ({
    updateInfo: jest.fn(),
}));

describe('Touch Event Handlers', () => {
    let canvas, fractalApp;

    beforeAll(() => {
        // Provide a global requestAnimationFrame so that animations run in tests.
        global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
        global.cancelAnimationFrame = jest.fn();
    });

    beforeEach(() => {
        // Set up a simple DOM with a canvas element.
        document.body.innerHTML = `
      <canvas id="fractalCanvas" width="800" height="600"></canvas>
      <div id="infoText">Initial Info</div>
    `;
        canvas = document.getElementById('fractalCanvas');

        // Create a dummy fractalApp with the minimum required properties and methods.
        fractalApp = {
            canvas,
            pan: [-0.5, 0.0],
            zoom: 3.0,
            draw: jest.fn(),
            animatePanAndZoomTo: jest.fn(),
            // A simple mock conversion function. For instance, for a canvas of width 800,
            // screen coordinate 300 maps to 3.0 if we simply divide by 100.
            screenToFractal: (x, y) => [x / 100, y / 100],
            // For testing presets, we can simply use an empty array or a dummy preset list.
            PRESETS: [
                { pan: [3.0, 3.0], zoom: 0.001 }
            ],
        };

        // Register the touch event handlers.
        registerTouchEventHandlers(fractalApp);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    test('touchstart with a single touch initializes dragging', () => {
        const touch = new Touch({
            identifier: 1,
            target: canvas,
            clientX: 100,
            clientY: 100,
        });
        const event = new TouchEvent('touchstart', {
            touches: [touch],
            bubbles: true,
            cancelable: true,
        });

        canvas.dispatchEvent(event);
        // We can simply assert that no error is thrown and the event handlers run.
        // (No state change is expected immediately.)
        expect(clearURLParams).not.toHaveBeenCalled();
    });

    test('touchmove with a single touch updates pan and calls draw', () => {
        jest.useFakeTimers();
        // Simulate touchstart.
        const touchStart = new Touch({
            identifier: 1,
            target: canvas,
            clientX: 100,
            clientY: 100,
        });
        canvas.dispatchEvent(new TouchEvent('touchstart', {
            touches: [touchStart],
            bubbles: true,
            cancelable: true,
        }));

        // Simulate touchmove that exceeds the drag threshold.
        const touchMove = new Touch({
            identifier: 1,
            target: canvas,
            clientX: 120,
            clientY: 120,
        });
        canvas.dispatchEvent(new TouchEvent('touchmove', {
            touches: [touchMove],
            bubbles: true,
            cancelable: true,
        }));

        // Expect clearURLParams to have been called by the handler.
        expect(clearURLParams).toHaveBeenCalled();

        // Check that draw has been called (indicating panning occurred).
        expect(fractalApp.draw).toHaveBeenCalled();
    });

    test('touchend without dragging triggers single tap centering action', () => {
        jest.useFakeTimers();

        // Set up a touchstart event.
        const touchStart = new Touch({
            identifier: 1,
            target: canvas,
            clientX: 300,
            clientY: 300,
        });
        canvas.dispatchEvent(new TouchEvent('touchstart', {
            touches: [touchStart],
            bubbles: true,
            cancelable: true,
        }));

        // Immediately dispatch touchend (no significant movement).
        const touchEnd = new Touch({
            identifier: 1,
            target: canvas,
            clientX: 300,
            clientY: 300,
        });
        canvas.dispatchEvent(new TouchEvent('touchend', {
            changedTouches: [touchEnd],
            bubbles: true,
            cancelable: true,
        }));

        // Advance the timers past the double-tap threshold.
        jest.advanceTimersByTime(350);

        const [fx, fy] = fractalApp.screenToFractal(300, 300);
        console.log("asdasdaa: " + fx+  fy);
        // Assert that updateURLParams was called with the expected values.
        expect(updateURLParams).toHaveBeenCalledWith(fx, fy, fractalApp.zoom);
        // Also, we expect animatePanAndZoomTo to have been triggered.
        expect(fractalApp.animatePanAndZoomTo).toHaveBeenCalledWith([fx, fy], fractalApp.zoom, 500);
        // And draw should have been called.
        expect(fractalApp.draw).toHaveBeenCalled();
        // And updateInfo should have been called (even if it's mocked).
        expect(updateInfo).toHaveBeenCalled();
    });

    test('touchstart with two touches initializes pinch mode', () => {
        const touch1 = new Touch({
            identifier: 1,
            target: canvas,
            clientX: 100,
            clientY: 100,
        });
        const touch2 = new Touch({
            identifier: 2,
            target: canvas,
            clientX: 200,
            clientY: 200,
        });
        const event = new TouchEvent('touchstart', {
            touches: [touch1, touch2],
            bubbles: true,
            cancelable: true,
        });

        canvas.dispatchEvent(event);
        // Since the code sets isPinching = true on two touches, we can verify that.
        // Although isPinching is a local variable in the module scope, you could modify your
        // implementation to expose it (or test a side-effect).
        // For now, we simply ensure that draw is not called immediately.
        expect(fractalApp.draw).not.toHaveBeenCalled();
    });

    test('touchmove with two touches updates zoom and pan and calls draw and updateInfo', () => {
        jest.useFakeTimers();

        // Simulate touchstart with two touches.
        const touch1Start = new Touch({ identifier: 1, target: canvas, clientX: 300, clientY: 300 });
        const touch2Start = new Touch({ identifier: 2, target: canvas, clientX: 400, clientY: 400 });
        canvas.dispatchEvent(new TouchEvent('touchstart', {
            touches: [touch1Start, touch2Start],
            bubbles: true,
            cancelable: true,
        }));

        // Simulate touchmove where both touches move.
        const touch1Move = new Touch({ identifier: 1, target: canvas, clientX: 310, clientY: 310 });
        const touch2Move = new Touch({ identifier: 2, target: canvas, clientX: 410, clientY: 410 });
        canvas.dispatchEvent(new TouchEvent('touchmove', {
            touches: [touch1Move, touch2Move],
            bubbles: true,
            cancelable: true,
        }));

        // Because our screenToFractal is simple ([x/100, y/100]),
        // if touches at (310,310) and (410,410), then currentCenterScreen is approximately (360,360)
        // and its fractal coordinates are [3.6, 3.6].
        // The test should assert that zoom is updated (we can’t compute an exact expected value without
        // replicating all math, so we use a simple assertion that zoom is not unchanged) and that the draw
        // and updateInfo methods are called.
        expect(fractalApp.zoom).not.toEqual(3.0);
        expect(fractalApp.draw).toHaveBeenCalled();
        expect(updateInfo).toHaveBeenCalled();
    });
});
