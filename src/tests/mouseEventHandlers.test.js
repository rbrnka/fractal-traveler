/**
 * @jest-environment jsdom
 */
// __tests__/mouseEventHandlers.test.js
import {
    clampPanDelta,
    initMouseHandlers,
    MAX_PAN_DISTANCE,
    unregisterMouseEventHandlers
} from '../ui/mouseEventHandlers';
import {
    mouseLeftDownEvent,
    mouseLeftMoveEvent,
    mouseLeftUpEvent,
    mouseRightDownEvent,
    mouseRightMoveEvent,
    mouseRightUpEvent,
    mouseWheelYEvent
} from "./eventDefaults";

describe('MouseEventHandlers', () => {
    let canvas, fractalApp, mockUI;

    beforeEach(() => {
        // Use fake timers BEFORE handlers are registered
        jest.useFakeTimers();

        // Create canvas and append to DOM using shared helpers
        // cleanupDOM();
        canvas = createMockCanvas();

        // Create mock fractalApp using factory
        fractalApp = createMockFractalApp(canvas);

        // Mock UI
        mockUI = createMockUI();

        // Ensure mouse handlers are not already registered.
        unregisterMouseEventHandlers();
        // Initialize mouse handlers
        initMouseHandlers(fractalApp);
    });

    afterEach(() => {
        // if (canvas && canvas.parentNode) {
        //     canvas.parentNode.removeChild(canvas);
        // }
        cleanupDOM();
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

        expect(fractalApp.animatePanBy).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to left double click (zoom-in) within bounds', async () => {
        canvas.dispatchEvent(mouseLeftDownEvent());
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.advanceTimersByTime(100);

        canvas.dispatchEvent(mouseLeftDownEvent());
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.animatePanByAndZoomTo).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should respond to right double click (zoom-out) within bounds', async () => {
        canvas.dispatchEvent(mouseRightDownEvent());
        canvas.dispatchEvent(mouseRightUpEvent());

        jest.advanceTimersByTime(100);

        canvas.dispatchEvent(mouseRightDownEvent());
        canvas.dispatchEvent(mouseRightUpEvent());

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.animatePanByAndZoomTo).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should unregister mouse event handlers and make them not working', async () => {
        unregisterMouseEventHandlers();

        canvas.dispatchEvent(mouseLeftDownEvent());
        canvas.dispatchEvent(mouseLeftUpEvent());

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.animatePanTo).not.toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('should handle wheel events for zooming/panning', () => {
        const before = fractalApp.zoom;
        canvas.dispatchEvent(mouseWheelYEvent());
        // Wheel zoom uses requestAnimationFrame (mocked to setTimeout), so advance timers
        jest.runAllTimers();
        expect(fractalApp.zoom).not.toBe(before);
    });
});

describe('Deep Zoom Panning Precision', () => {
    let canvas, fractalApp;

    beforeEach(() => {
        jest.useFakeTimers();

        cleanupDOM();
        canvas = createMockCanvas();
        appendCanvasToDOM(canvas);

        // Create DD-aware fractalApp using factory
        fractalApp = createMockFractalApp(canvas);

        unregisterMouseEventHandlers();
        initMouseHandlers(fractalApp);
    });

    afterEach(() => {
        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }
        cleanupDOM();
        jest.useRealTimers();
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('DD arithmetic preserves tiny deltas in the total (hi+lo), and lo becomes non-zero for sub-ULP changes', () => {
        const panDDLocal = { hi: -0.5, lo: 0 };
        const tinyDelta = 1e-17;

        // DD arithmetic helpers
        const twoSum = (a, b) => {
            const s = a + b;
            const bb = s - a;
            const err = (a - (s - bb)) + (b - bb);
            return { s, err };
        };
        const quickTwoSum = (a, b) => {
            const s = a + b;
            const err = b - (s - a);
            return { s, err };
        };

        const t = twoSum(panDDLocal.hi, tinyDelta);
        const lo = panDDLocal.lo + t.err;
        const r = quickTwoSum(t.s, lo);
        panDDLocal.hi = r.s;
        panDDLocal.lo = r.err;

        const sum = panDDLocal.hi + panDDLocal.lo;

        expect(panDDLocal.lo).not.toBe(0);
        expect(sum).toBeCloseTo(-0.5 + tinyDelta, 30);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('panning at deep zoom (1e-15) should update panDD lo component', async () => {
        const initialLoX = fractalApp.panDD.x.lo;

        canvas.dispatchEvent(mouseLeftDownEvent(200, 200));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftMoveEvent(250, 200));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftUpEvent(250, 200));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.addPan).toHaveBeenCalled();
        expect(fractalApp.panDD.x.lo).not.toBe(initialLoX);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('horizontal pan should work at deep zoom (regression test for panX precision loss)', async () => {
        const initialLoX = fractalApp.panDD.x.lo;

        canvas.dispatchEvent(mouseLeftDownEvent(200, 300));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftMoveEvent(250, 300));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftUpEvent(250, 300));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.addPan).toHaveBeenCalled();
        expect(fractalApp.panDD.x.lo).not.toBe(initialLoX);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('vertical pan should trigger addPan at deep zoom', async () => {
        canvas.dispatchEvent(mouseLeftDownEvent(400, 200));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftMoveEvent(400, 250));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftUpEvent(400, 250));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.addPan).toHaveBeenCalled();

        const calls = fractalApp.addPan.mock.calls;
        expect(calls.length).toBeGreaterThan(0);

        // Ensure at least one call had a non-zero dy
        const anyNonZeroDy = calls.some(([, dy]) => dy !== 0);
        expect(anyNonZeroDy).toBe(true);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('addPan is called during mouse drag at deep zoom', async () => {
        canvas.dispatchEvent(mouseLeftDownEvent(200, 200));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftMoveEvent(250, 250));
        jest.advanceTimersByTime(50);
        canvas.dispatchEvent(mouseLeftUpEvent(250, 250));

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.addPan).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('multiple small pans should accumulate in panDD lo component', async () => {
        const initialLoX = fractalApp.panDD.x.lo;
        const numPans = 5;

        for (let i = 0; i < numPans; i++) {
            canvas.dispatchEvent(mouseLeftDownEvent(400, 300));
            jest.advanceTimersByTime(20);
            canvas.dispatchEvent(mouseLeftMoveEvent(420, 300));
            jest.advanceTimersByTime(20);
            canvas.dispatchEvent(mouseLeftUpEvent(420, 300));
            jest.advanceTimersByTime(200);
        }

        jest.runAllTimers();
        await Promise.resolve();

        expect(fractalApp.addPan).toHaveBeenCalled();
        expect(fractalApp.panDD.x.lo).not.toBe(initialLoX);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('panDD lo component should capture sub-ulp precision (total sum changes by tinyDelta)', () => {
        const initialSum = fractalApp.panDD.x.hi + fractalApp.panDD.x.lo;

        const tinyDelta = 1e-18;
        fractalApp.addPan(tinyDelta, 0);

        const sum = fractalApp.panDD.x.hi + fractalApp.panDD.x.lo;

        expect(sum).toBeCloseTo(initialSum + tinyDelta, 30);
        expect(fractalApp.panDD.x.lo).not.toBe(0);
    });
});

describe('Pan Bounds Clamping', () => {
    // -----------------------------------------------------------------------------------------------------------------
    test('should not clamp when within bounds', () => {
        const currentPan = [0, 0];
        const deltaPan = [0.5, 0.5];

        const result = clampPanDelta(currentPan, deltaPan);

        expect(result).toEqual(deltaPan);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should clamp when exceeding MAX_PAN_DISTANCE', () => {
        const currentPan = [0, 0];
        const deltaPan = [5, 0]; // Would result in distance 5 > 3.5

        const result = clampPanDelta(currentPan, deltaPan);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        const distance = Math.sqrt(resultingPan[0]**2 + resultingPan[1]**2);

        expect(distance).toBeCloseTo(MAX_PAN_DISTANCE, 5);
        expect(result[0]).toBeLessThan(deltaPan[0]);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should clamp diagonal movement correctly', () => {
        const currentPan = [1, 1];
        const deltaPan = [3, 3]; // Would result in distance ~5.66 > 3.5

        const result = clampPanDelta(currentPan, deltaPan);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        const distance = Math.sqrt(resultingPan[0]**2 + resultingPan[1]**2);

        expect(distance).toBeCloseTo(MAX_PAN_DISTANCE, 5);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should clamp when starting from existing pan position', () => {
        const currentPan = [2, 0];
        const deltaPan = [3, 0]; // Would result in pan [5, 0], distance 5 > 3.5

        const result = clampPanDelta(currentPan, deltaPan);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        const distance = Math.sqrt(resultingPan[0]**2 + resultingPan[1]**2);

        expect(distance).toBeCloseTo(MAX_PAN_DISTANCE, 5);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should handle negative coordinates', () => {
        const currentPan = [-1, -1];
        const deltaPan = [-3, -3]; // Would result in distance ~5.66 > 3.5

        const result = clampPanDelta(currentPan, deltaPan);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        const distance = Math.sqrt(resultingPan[0]**2 + resultingPan[1]**2);

        expect(distance).toBeCloseTo(MAX_PAN_DISTANCE, 5);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should preserve direction when clamping', () => {
        const currentPan = [0, 0];
        const deltaPan = [10, 0]; // Would pan right to [10, 0]

        const result = clampPanDelta(currentPan, deltaPan);

        // Result should still be pointing right (positive X)
        expect(result[0]).toBeGreaterThan(0);
        expect(result[1]).toBe(0);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        expect(resultingPan[0]).toBeCloseTo(MAX_PAN_DISTANCE, 5);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should allow movement at exactly MAX_PAN_DISTANCE boundary', () => {
        const currentPan = [MAX_PAN_DISTANCE, 0];
        const deltaPan = [0, 0.1]; // Small perpendicular movement

        const result = clampPanDelta(currentPan, deltaPan);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        const distance = Math.sqrt(resultingPan[0]**2 + resultingPan[1]**2);

        // Should be clamped to MAX_PAN_DISTANCE
        expect(distance).toBeLessThanOrEqual(MAX_PAN_DISTANCE + 0.001);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should handle zero delta', () => {
        const currentPan = [1, 1];
        const deltaPan = [0, 0];

        const result = clampPanDelta(currentPan, deltaPan);

        expect(result).toEqual([0, 0]);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should clamp click in far corner at default view (real-world scenario)', () => {
        // Default view: zoom = 3, centered at origin
        // Click in far corner would translate to ~1.5 from center
        // After centering, we'd be at [1.5, 1.5] which is within bounds
        const currentPan = [0, 0];
        const deltaPan = [1.5, 1.5]; // Corner click

        const result = clampPanDelta(currentPan, deltaPan);

        // This should pass through without clamping (distance ~2.12 < 3.5)
        expect(result).toEqual(deltaPan);
    });

    // -----------------------------------------------------------------------------------------------------------------
    test('should clamp extreme click at default view', () => {
        // Simulating clicking way outside the canvas bounds
        const currentPan = [0, 0];
        const deltaPan = [5, 5]; // Extreme click, would go to [5, 5], distance ~7.07

        const result = clampPanDelta(currentPan, deltaPan);

        const resultingPan = [currentPan[0] + result[0], currentPan[1] + result[1]];
        const distance = Math.sqrt(resultingPan[0]**2 + resultingPan[1]**2);

        expect(distance).toBeCloseTo(MAX_PAN_DISTANCE, 5);
        // Should maintain diagonal direction (equal x and y)
        expect(Math.abs(resultingPan[0])).toBeCloseTo(Math.abs(resultingPan[1]), 5);
    });
});
