// __tests__/mouseEventHandlers.test.js
import {initMouseHandlers, unregisterMouseEventHandlers} from '../ui/mouseEventHandlers';
import {mouseLeftDownEvent, mouseLeftMoveEvent, mouseLeftUpEvent, mouseWheelYEvent} from "./eventDefaults";

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
            MIN_ZOOM: 40,
            pan: [0, 0],
            c: [0, 0],
            rotation: 0,
            zoom: 3.5,
            draw: jest.fn(),
            updateInfo: jest.fn(),
            updateJuliaSliders: jest.fn(),
            screenToFractal: jest.fn((x, y) => [x / 100, y / 100]),
            stopCurrentNonColorAnimations: jest.fn(),
            // If needed, other methods can be mocked.
            animatePanTo: jest.fn(() => Promise.resolve()),
            animatePanAndZoomTo: jest.fn(() => Promise.resolve()),
        };

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
    test('should register mouse event handlers and respond to mousemove (panning)', async () => {

        canvas.dispatchEvent(mouseLeftDownEvent(100, 100));
        jest.advanceTimersByTime(100);
        canvas.dispatchEvent(mouseLeftMoveEvent(200, 200));
        jest.advanceTimersByTime(100);
        canvas.dispatchEvent(mouseLeftUpEvent(200, 200));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.pan[0]).not.toEqual(0);
        expect(fractalApp.pan[1]).not.toEqual(0);
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should register mouse event handlers and respond to single click (pan)', async () => {

        canvas.dispatchEvent(mouseLeftDownEvent());
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.animatePanTo).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should register mouse event handlers and respond to double click (zoom-in/out)', async () => {

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
    test('should register and then unregister mouse event handlers', async () => {
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
        let zoom = fractalApp.zoom;
        canvas.dispatchEvent(mouseWheelYEvent());
        expect(zoom).not.toEqual(fractalApp.zoom);
    });
    // -----------------------------------------------------------------------------------------------------------------
});
