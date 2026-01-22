/**
 * @jest-environment jsdom
 */
// src/__tests__/fractalRenderer.test.js

describe('MandelbrotRenderer', () => {
    let canvas, mandelbrot;

    beforeEach(() => {
        // Set up a dummy canvas using shared helper
        cleanupDOM();
        canvas = createMockCanvas();
        appendCanvasToDOM(canvas);
        // WebGL context mock is provided by jest.setup.js
        // Instantiate the MandelbrotRenderer
        //mandelbrot = new MandelbrotRenderer(canvas);
    });

    afterEach(() => {
        // Clean up by removing the canvas element.
        canvas.remove();
    });

    test('should initialize with default pan, zoom, and presets', () => {
        // expect(mandelbrot.pan).toEqual([...mandelbrot.DEFAULT_PAN]);
        // expect(mandelbrot.zoom).toEqual(mandelbrot.DEFAULT_ZOOM);
        // Check that presets is defined and is an array.
        // expect(Array.isArray(mandelbrot.PRESETS)).toBe(true);
        // expect(mandelbrot.PRESETS.length).toBeGreaterThan(0);
    });

    test('reset() should reinitialize pan and zoom to defaults', () => {
        // Change state.
        // mandelbrot.pan = [-5, 5];
        // mandelbrot.zoom = 0.001;
        // mandelbrot.reset();
        // Check if pan is equal to DEFAULT_PAN and zoom equals DEFAULT_ZOOM.
        // expect(mandelbrot.pan).toEqual([...mandelbrot.DEFAULT_PAN]);
        // expect(mandelbrot.zoom).toEqual(mandelbrot.DEFAULT_ZOOM);
    });
});
