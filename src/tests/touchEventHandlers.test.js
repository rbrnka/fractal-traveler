/**
 * @jest-environment jsdom
 */
import {initTouchHandlers, registerTouchEventHandlers} from '../ui/touchEventHandlers.js';

describe('Touch Event Handlers', () => {
    let canvas, fractalApp;

    beforeEach(() => {
        // Create canvas and append to DOM using shared helpers
        cleanupDOM();
        canvas = createMockCanvas();
        appendCanvasToDOM(canvas);

        // Create mock fractalApp using factory
        fractalApp = createMockFractalApp(canvas);

        // Register touch event handlers.
        initTouchHandlers(fractalApp);
        registerTouchEventHandlers();
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

        expect(fractalApp.animatePanTo).toHaveBeenCalled();
    });
});
