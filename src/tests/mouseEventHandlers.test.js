// __tests__/mouseEventHandlers.test.js
import {initMouseHandlers, unregisterMouseEventHandlers} from '../ui/mouseEventHandlers';
import {
    mouseLeftDownEvent,
    mouseLeftMoveEvent,
    mouseLeftUpEvent,
    mouseMiddleDownEvent,
    mouseMiddleUpEvent,
    mouseRightDownEvent,
    mouseRightMoveEvent,
    mouseRightUpEvent,
    mouseWheelYEvent
} from "./eventDefaults";
import * as UI from "../ui/ui";

describe('MouseEventHandlers', () => {
    let canvas, fractalApp;

    beforeEach(() => {
        // Clear document body and create a dummy canvas.
        document.body.innerHTML = '';
        canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        canvas.id = 'fractalCanvas';
        document.body.appendChild(canvas);

        // Create a mock fractalApp with required properties and methods.
        fractalApp = {
            canvas,
            MAX_ZOOM: 0.000017,
            MIN_ZOOM: 400,
            pan: [0, 0],
            c: [0, 0],
            rotation: 0,
            zoom: 3.5,
            draw: jest.fn(),
            addPan: jest.fn((x, y) => { fractalApp.pan[0] += x/100; fractalApp.pan[1] += y/100; }),
            updateInfo: jest.fn(),
            updateJuliaSliders: jest.fn(),
            screenToFractal: jest.fn((x, y) => [x / 100, y / 100]),
            screenToViewVector: jest.fn((x, y) => [x / 100, y / 100]),
            stopAllNonColorAnimations: jest.fn(),
            // If needed, other methods can be mocked.
            animatePanTo: jest.fn(() => Promise.resolve()),
            animatePanAndZoomTo: jest.fn(() => Promise.resolve()),
        };

        // Mock UI
        UI.toggleDebugLines = jest.fn();

        // Ensure mouse handlers are not already registered.
        unregisterMouseEventHandlers();
        // Initialize mouse handlers
        initMouseHandlers(fractalApp);

        // Use fake timers to simulate time passage.
        jest.useFakeTimers();
    });

    afterEach(() => {
        // Clean up by removing the canvas.
        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }
        document.body.innerHTML = '';

        jest.useRealTimers();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to mousemove (panning)', async () => {

        canvas.dispatchEvent(mouseLeftDownEvent(100, 100));
        jest.advanceTimersByTime(100);
        canvas.dispatchEvent(mouseLeftMoveEvent(200, 200));
        jest.advanceTimersByTime(100);
        canvas.dispatchEvent(mouseLeftUpEvent(200, 200));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.addPan).toHaveBeenCalled();
        expect(fractalApp.pan).not.toEqual([0, 0]);
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to mousemove (rotating)', async () => {

        canvas.dispatchEvent(mouseRightDownEvent(100, 100));
        jest.advanceTimersByTime(100);
        canvas.dispatchEvent(mouseRightMoveEvent(200, 200));
        jest.advanceTimersByTime(100);
        canvas.dispatchEvent(mouseRightUpEvent(200, 200));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.rotation).not.toEqual(0);
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to single click (pan)', async () => {

        canvas.dispatchEvent(mouseLeftDownEvent());
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.animatePanTo).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to left double click (zoom-in) within bounds', async () => {

        canvas.dispatchEvent(mouseLeftDownEvent());
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.advanceTimersByTime(100);

        canvas.dispatchEvent(mouseLeftDownEvent());
        canvas.dispatchEvent(mouseLeftUpEvent());

        // Advance timers to trigger any pending timeouts.
        jest.runAllTimers();
        // Wait for any pending promises in the event handler.
        await Promise.resolve();

        expect(fractalApp.animatePanAndZoomTo).toHaveBeenCalled();

    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to right double click (zoom-out) within bounds', async () => {

        canvas.dispatchEvent(mouseRightDownEvent());
        canvas.dispatchEvent(mouseRightUpEvent());

        jest.advanceTimersByTime(100);

        canvas.dispatchEvent(mouseRightDownEvent());
        canvas.dispatchEvent(mouseRightUpEvent());

        // Advance timers to trigger any pending timeouts.
        jest.runAllTimers();
        // Wait for any pending promises in the event handler.
        await Promise.resolve();

        expect(fractalApp.animatePanAndZoomTo).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should unregister mouse event handlers and make them not working', async () => {
        // Unregister event handlers.
        unregisterMouseEventHandlers();

        canvas.dispatchEvent(mouseLeftDownEvent());
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.runAllTimers();
        // Wait for any pending promises in the event handler.
        await Promise.resolve();

        // Expect that after unregistration, the handlers are not called.
        expect(fractalApp.animatePanTo).not.toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should handle wheel events for zooming/panning', () => {
        let zoom = fractalApp.zoom.toFixed(12);
        canvas.dispatchEvent(mouseWheelYEvent());
        expect(zoom).not.toEqual(fractalApp.zoom);
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should toggle debug lines on middle click', () => {
        canvas.dispatchEvent(mouseMiddleUpEvent());
        canvas.dispatchEvent(mouseMiddleDownEvent());

        expect(UI.toggleDebugLines).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
});
