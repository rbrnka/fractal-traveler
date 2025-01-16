import { registerTouchEventHandlers } from '../touchEventHandlers.js';
import { updateURLParams, clearURLParams } from '../utils.js';
import { updateInfo } from '../ui.js';

// Mock utility functions to avoid side effects.
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
        // Mock Touch and TouchEvent for JSDOM.
        global.Touch = class {
            constructor({ identifier, target, clientX, clientY }) {
                this.identifier = identifier;
                this.target = target;
                this.clientX = clientX;
                this.clientY = clientY;
            }
        };

        global.TouchEvent = class extends Event {
            constructor(type, { touches = [], changedTouches = [], bubbles = true, cancelable = true }) {
                super(type, { bubbles, cancelable });
                this.touches = touches;
                this.changedTouches = changedTouches;
            }
        };

        global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
        global.cancelAnimationFrame = jest.fn();
    });

    beforeEach(() => {
        // Set up DOM with a canvas element.
        document.body.innerHTML = `
            <canvas id="fractalCanvas" width="800" height="600"></canvas>
            <div id="infoText">Initial Info</div>
        `;
        canvas = document.getElementById('fractalCanvas');

        // Mock fractalApp with minimum functionality.
        fractalApp = {
            canvas,
            pan: [-0.5, 0.0],
            zoom: 3.0,
            draw: jest.fn(),
            animatePanAndZoomTo: jest.fn(),
            screenToFractal: (x, y) => [x / 100, y / 100],
        };

        // Register touch event handlers.
        registerTouchEventHandlers(fractalApp);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('Single touch action triggers centering on tap', () => {
        jest.useFakeTimers();

        const touch = new Touch({ identifier: 1, target: canvas, clientX: 300, clientY: 300 });
        canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch] }));
        canvas.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch] }));

        jest.advanceTimersByTime(500); // Simulate delay for single tap.

        const [fx, fy] = fractalApp.screenToFractal(300, 300);

        // Validate actions.
        const targetZoom = fractalApp.zoom * 0.05;
        expect(fractalApp.animatePanAndZoomTo).toHaveBeenCalledWith([fx, fy], targetZoom, 1000);
        expect(fractalApp.pan).toEqual([fx, fy]);
        expect(updateURLParams).toHaveBeenCalledWith(fx, fy, fractalApp.zoom);
        expect(updateInfo).toHaveBeenCalled();
    });

    test('Double tap zooms in at the tap location', () => {
        const touch = new Touch({ identifier: 1, target: canvas, clientX: 300, clientY: 300 });

        // First tap.
        canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch] }));
        canvas.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch] }));

        // Second tap within the double-tap threshold.
        canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch] }));
        canvas.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch] }));

        const [fx, fy] = fractalApp.screenToFractal(300, 300);

        // Validate double-tap action.
        expect(fractalApp.animatePanAndZoomTo).toHaveBeenCalledWith([fx, fy], fractalApp.zoom * 0.05, 1000);
        expect(fractalApp.draw).toHaveBeenCalled();
    });

    test('Pinch zoom and pan updates fractalApp properties', () => {
        const originalPan = fractalApp.pan.slice();
        const originalZoom = fractalApp.zoom;

        // Simulate pinch start with two touches.
        const touch1Start = new Touch({ identifier: 1, target: canvas, clientX: 300, clientY: 300 });
        const touch2Start = new Touch({ identifier: 2, target: canvas, clientX: 400, clientY: 400 });
        canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch1Start, touch2Start] }));

        // Simulate pinch move where distance changes.
        const touch1Move = new Touch({ identifier: 1, target: canvas, clientX: 310, clientY: 310 });
        const touch2Move = new Touch({ identifier: 2, target: canvas, clientX: 420, clientY: 420 });
        canvas.dispatchEvent(new TouchEvent('touchmove', { touches: [touch1Move, touch2Move] }));

        // Validate pinch action.
        expect(fractalApp.zoom).not.toEqual(originalZoom);
        expect(fractalApp.pan).not.toEqual(originalPan);
        expect(fractalApp.draw).toHaveBeenCalled();
        expect(updateInfo).toHaveBeenCalled();
    });
});
