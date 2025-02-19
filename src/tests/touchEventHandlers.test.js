import {initTouchHandlers, registerTouchEventHandlers} from '../ui/touchEventHandlers.js';

// Mock utility functions to avoid side effects.
// jest.mock('../global/utils.js', () => ({
//     updateURLParams: jest.fn(),
//     clearURLParams: jest.fn(),
// }));

// jest.mock('../ui/ui.js', () => ({
//     updateInfo: jest.fn(),
//     resetAppState: jest.fn()
// }));

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
        document.body.innerHTML = '';
        canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        canvas.id = 'fractalCanvas';
        document.body.appendChild(canvas);

        // Mock fractalApp with minimum functionality.
        fractalApp = {
            canvas,
            MAX_ZOOM: 0.000017,
            MIN_ZOOM: 400,
            pan: [0, 0],
            c: [0, 0],
            rotation: 0,
            zoom: 3.5,
            draw: jest.fn(),
            updateInfo: jest.fn(),
            updateJuliaSliders: jest.fn(),
            screenToFractal: jest.fn((x, y) => [x / 100, y / 100]),
            stopAllNonColorAnimations: jest.fn(),
            // If needed, other methods can be mocked.
            animatePanTo: jest.fn(() => Promise.resolve()),
            animatePanAndZoomTo: jest.fn(() => Promise.resolve()),
        };

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
