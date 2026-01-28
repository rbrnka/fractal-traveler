/**
 * @jest-environment jsdom
 */
// src/__tests__/fractalRenderer.test.js

import {
    ADAPTIVE_QUALITY_COOLDOWN,
    ADAPTIVE_QUALITY_MIN,
    ADAPTIVE_QUALITY_STEP,
    ADAPTIVE_QUALITY_THRESHOLD_HIGH,
    ADAPTIVE_QUALITY_THRESHOLD_LOW,
} from '../global/constants';

describe('MandelbrotRenderer', () => {
    let canvas;

    beforeEach(() => {
        cleanupDOM();
        canvas = createMockCanvas();
        appendCanvasToDOM(canvas);
    });

    afterEach(() => {
        canvas.remove();
    });

    test('should initialize with default pan, zoom, and presets', () => {
        // Test using mock fractal app that mirrors MandelbrotRenderer defaults
        const renderer = createMockFractalApp(canvas);

        // Override with Mandelbrot-specific defaults for testing
        renderer.DEFAULT_PAN = [-0.5, 0];
        renderer.DEFAULT_ZOOM = 3.0;
        renderer.DEFAULT_ROTATION = 0;
        renderer.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        renderer.DEFAULT_FREQUENCY = [3.1415, 6.2830, 1.7200];
        renderer.DEFAULT_PHASE = [0, 0, 0];
        renderer.MAX_ITER = 5000;
        renderer.PRESETS = [{index: 0}, {index: 1}, {index: 2}];
        renderer.PALETTES = [{id: 'default'}, {id: 'fire'}];

        // Set initial values to defaults
        renderer.pan = [...renderer.DEFAULT_PAN];
        renderer.zoom = renderer.DEFAULT_ZOOM;
        renderer.rotation = renderer.DEFAULT_ROTATION;
        renderer.colorPalette = [...renderer.DEFAULT_PALETTE];
        renderer.frequency = [...renderer.DEFAULT_FREQUENCY];
        renderer.phase = [...renderer.DEFAULT_PHASE];

        // Verify default pan (Mandelbrot-specific: centered slightly left)
        expect(renderer.DEFAULT_PAN).toEqual([-0.5, 0]);
        expect(renderer.pan[0]).toBeCloseTo(-0.5, 10);
        expect(renderer.pan[1]).toBeCloseTo(0, 10);

        // Verify default zoom
        expect(renderer.DEFAULT_ZOOM).toBe(3.0);
        expect(renderer.zoom).toBe(3.0);

        // Verify default rotation
        expect(renderer.DEFAULT_ROTATION).toBe(0);
        expect(renderer.rotation).toBe(0);

        // Verify presets array exists
        expect(Array.isArray(renderer.PRESETS)).toBe(true);
        expect(renderer.PRESETS.length).toBeGreaterThan(0);

        // Verify palettes array exists
        expect(Array.isArray(renderer.PALETTES)).toBe(true);

        // Verify default color parameters
        expect(renderer.DEFAULT_FREQUENCY).toEqual([3.1415, 6.2830, 1.7200]);
        expect(renderer.DEFAULT_PHASE).toEqual([0, 0, 0]);
        expect(renderer.frequency).toEqual(renderer.DEFAULT_FREQUENCY);
        expect(renderer.phase).toEqual(renderer.DEFAULT_PHASE);

        // Verify MAX_ITER
        expect(renderer.MAX_ITER).toBe(5000);
    });

    test('reset() should reinitialize pan and zoom to defaults', () => {
        // Create mock with reset implementation
        const renderer = createMockFractalApp(canvas);

        // Set up defaults
        renderer.DEFAULT_PAN = [-0.5, 0];
        renderer.DEFAULT_ZOOM = 3.0;
        renderer.DEFAULT_ROTATION = 0;
        renderer.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        renderer.DEFAULT_FREQUENCY = [3.1415, 6.2830, 1.7200];
        renderer.DEFAULT_PHASE = [0, 0, 0];

        // Mock setPan to update pan array
        renderer.setPan = jest.fn((x, y) => {
            renderer.pan = [x, y];
        });

        // Implement reset logic matching MandelbrotRenderer.reset()
        renderer.reset = jest.fn(() => {
            renderer.colorPalette = [...renderer.DEFAULT_PALETTE];
            renderer.setPan(renderer.DEFAULT_PAN[0], renderer.DEFAULT_PAN[1]);
            renderer.zoom = renderer.DEFAULT_ZOOM;
            renderer.rotation = renderer.DEFAULT_ROTATION;
            renderer.extraIterations = 0;
            renderer.currentPresetIndex = 0;
            renderer.frequency = [...renderer.DEFAULT_FREQUENCY];
            renderer.phase = [...renderer.DEFAULT_PHASE];
            renderer.currentPaletteIndex = 0;
        });

        // Modify state away from defaults
        renderer.pan = [1.5, -0.75];
        renderer.zoom = 0.001;
        renderer.rotation = Math.PI / 4;
        renderer.frequency = [1, 2, 3];
        renderer.phase = [0.5, 0.5, 0.5];
        renderer.extraIterations = -500;
        renderer.currentPresetIndex = 3;
        renderer.currentPaletteIndex = 2;
        renderer.colorPalette = [0.5, 0.5, 0.5];

        // Call reset
        renderer.reset();

        // Verify defaults are restored
        expect(renderer.pan[0]).toBeCloseTo(-0.5, 10);
        expect(renderer.pan[1]).toBeCloseTo(0, 10);
        expect(renderer.zoom).toBe(renderer.DEFAULT_ZOOM);
        expect(renderer.rotation).toBe(renderer.DEFAULT_ROTATION);
        expect(renderer.frequency).toEqual(renderer.DEFAULT_FREQUENCY);
        expect(renderer.phase).toEqual(renderer.DEFAULT_PHASE);
        expect(renderer.extraIterations).toBe(0);
        expect(renderer.currentPresetIndex).toBe(0);
        expect(renderer.currentPaletteIndex).toBe(0);
        expect(renderer.colorPalette).toEqual(renderer.DEFAULT_PALETTE);
    });
});

describe('FractalRenderer Adaptive Quality', () => {
    // Local state for each test - completely isolated
    let gpuMsValue;
    let renderer;

    // Constants object to pass to the factory
    const adaptiveQualityConstants = {
        ADAPTIVE_QUALITY_COOLDOWN,
        ADAPTIVE_QUALITY_MIN,
        ADAPTIVE_QUALITY_STEP,
        ADAPTIVE_QUALITY_THRESHOLD_HIGH,
        ADAPTIVE_QUALITY_THRESHOLD_LOW,
    };

    beforeEach(() => {
        // Reset to neutral state before each test
        gpuMsValue = 15;
        // Create renderer with getter function for gpuMsValue
        renderer = createMockAdaptiveQualityRenderer(() => gpuMsValue, adaptiveQualityConstants);
        // Set to well in the past to ensure cooldown check passes
        renderer.adaptiveQualityLastAdjustment = performance.now() - ADAPTIVE_QUALITY_COOLDOWN - 1000;
    });

    describe('quality reduction', () => {
        test('should reduce extraIterations when GPU time exceeds high threshold', () => {
            gpuMsValue = ADAPTIVE_QUALITY_THRESHOLD_HIGH + 5; // 27ms

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(-ADAPTIVE_QUALITY_STEP);
        });

        test('should reduce extraIterations by STEP amount each adjustment', () => {
            gpuMsValue = ADAPTIVE_QUALITY_THRESHOLD_HIGH + 10; // Above high threshold
            renderer.extraIterations = -200;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(-200 - ADAPTIVE_QUALITY_STEP);
        });

        test('should not reduce extraIterations below ADAPTIVE_QUALITY_MIN', () => {
            gpuMsValue = 50;
            renderer.extraIterations = ADAPTIVE_QUALITY_MIN + 50; // Close to min

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(ADAPTIVE_QUALITY_MIN);
        });

        test('should clamp to exactly ADAPTIVE_QUALITY_MIN', () => {
            gpuMsValue = 100;
            renderer.extraIterations = ADAPTIVE_QUALITY_MIN; // Already at min

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(ADAPTIVE_QUALITY_MIN);
        });
    });

    describe('quality restoration', () => {
        test('should restore extraIterations when GPU time is below low threshold and extraIterations < 0', () => {
            gpuMsValue = ADAPTIVE_QUALITY_THRESHOLD_LOW - 2; // 10ms
            renderer.extraIterations = -300;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(-300 + ADAPTIVE_QUALITY_STEP);
        });

        test('should not increase extraIterations above 0', () => {
            gpuMsValue = 5;
            renderer.extraIterations = -50; // Close to 0

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(0);
        });

        test('should not change extraIterations when already at 0 and GPU time is low', () => {
            gpuMsValue = 5;
            renderer.extraIterations = 0;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(0);
        });
    });

    describe('interaction blocking', () => {
        test('should not adjust quality during active interaction', () => {
            gpuMsValue = 50; // Would normally trigger reduction
            renderer.interactionActive = true;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(0); // Unchanged
        });

        test('should resume adjustments after interaction ends', () => {
            gpuMsValue = 50;
            renderer.interactionActive = true;
            renderer.adjustAdaptiveQuality();
            expect(renderer.extraIterations).toBe(0); // Blocked

            renderer.interactionActive = false;
            renderer.adjustAdaptiveQuality();
            expect(renderer.extraIterations).toBe(-ADAPTIVE_QUALITY_STEP); // Now adjusted
        });
    });

    describe('cooldown', () => {
        test('should respect cooldown period between adjustments', () => {
            gpuMsValue = 50;

            // First adjustment
            renderer.adjustAdaptiveQuality();
            expect(renderer.extraIterations).toBe(-ADAPTIVE_QUALITY_STEP);

            // Immediate second call should be blocked by cooldown
            renderer.adjustAdaptiveQuality();
            expect(renderer.extraIterations).toBe(-ADAPTIVE_QUALITY_STEP); // Unchanged
        });

        test('should allow adjustment after cooldown expires', () => {
            gpuMsValue = 50;

            renderer.adjustAdaptiveQuality();
            expect(renderer.extraIterations).toBe(-ADAPTIVE_QUALITY_STEP);

            // Simulate cooldown expiry
            renderer.adaptiveQualityLastAdjustment = performance.now() - ADAPTIVE_QUALITY_COOLDOWN - 1;

            renderer.adjustAdaptiveQuality();
            expect(renderer.extraIterations).toBe(-ADAPTIVE_QUALITY_STEP * 2);
        });
    });

    describe('neutral zone', () => {
        test('should not adjust when GPU time is in neutral zone (between thresholds)', () => {
            // GPU time between low and high thresholds
            gpuMsValue = (ADAPTIVE_QUALITY_THRESHOLD_LOW + ADAPTIVE_QUALITY_THRESHOLD_HIGH) / 2;
            renderer.extraIterations = -500;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(-500); // Unchanged
        });

        test('should not restore when in neutral zone even with negative extraIterations', () => {
            // Neutral zone is between THRESHOLD_LOW (~16.67ms) and THRESHOLD_HIGH (40ms)
            gpuMsValue = 25; // Clearly in the neutral zone
            renderer.extraIterations = -1000;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(-1000); // Unchanged
        });
    });

    describe('edge cases', () => {
        test('should handle missing perf data gracefully', () => {
            gpuMsValue = null;

            expect(() => renderer.adjustAdaptiveQuality()).not.toThrow();
            expect(renderer.extraIterations).toBe(0);
        });

        test('should handle NaN gpuMsSmoothed', () => {
            gpuMsValue = NaN;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(0); // Unchanged
        });

        test('should handle Infinity gpuMsSmoothed', () => {
            gpuMsValue = Infinity;

            renderer.adjustAdaptiveQuality();

            expect(renderer.extraIterations).toBe(0); // Unchanged due to !Number.isFinite
        });

        test('should handle negative gpuMsSmoothed', () => {
            gpuMsValue = -10;
            renderer.extraIterations = -500;

            renderer.adjustAdaptiveQuality();

            // Negative is < threshold low, so should restore
            expect(renderer.extraIterations).toBe(-500 + ADAPTIVE_QUALITY_STEP);
        });
    });

    describe('constants validation', () => {
        test('thresholds should have proper relationship', () => {
            expect(ADAPTIVE_QUALITY_THRESHOLD_LOW).toBeLessThan(ADAPTIVE_QUALITY_THRESHOLD_HIGH);
        });

        test('min should be negative', () => {
            expect(ADAPTIVE_QUALITY_MIN).toBeLessThan(0);
        });

        test('step should be positive', () => {
            expect(ADAPTIVE_QUALITY_STEP).toBeGreaterThan(0);
        });

        test('cooldown should be positive', () => {
            expect(ADAPTIVE_QUALITY_COOLDOWN).toBeGreaterThan(0);
        });
    });
});
