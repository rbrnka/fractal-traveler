// src/__tests__/fractalRenderer.test.js
import { FractalRenderer } from '../fractalRenderer.js';
import { MandelbrotRenderer } from '../mandelbrotRenderer.js';

// Helper: Create a dummy canvas element
function createDummyCanvas(width = 800, height = 600) {
    const canvas = document.createElement('canvas');
    canvas.id = 'fractalCanvas';
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    return canvas;
}

describe('FractalRenderer (Abstract Class)', () => {
    beforeEach(() => {
        // Clear document body before each test
        document.body.innerHTML = '';
    });

    test("should throw an error if instantiating the abstract class", () => {
        expect(() => new FractalRenderer(createDummyCanvas())).toThrow(
            "Abstract classes can't be instantiated."
        );
    });
});

describe('MandelbrotRenderer', () => {
    let canvas, mandelbrot;
    beforeEach(() => {
        // Mock the getContext method
        HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
            uniform1f: jest.fn(),
            uniform2fv: jest.fn(),
            uniform3fv: jest.fn(),
            useProgram: jest.fn(),
            viewport: jest.fn(),
            clear: jest.fn(),
            clearColor: jest.fn(),
            createShader: jest.fn(() => ({})),
            shaderSource: jest.fn(),
            compileShader: jest.fn(),
            getShaderParameter: jest.fn(() => true),
            createProgram: jest.fn(() => ({})),
            attachShader: jest.fn(),
            linkProgram: jest.fn(),
            getProgramParameter: jest.fn(() => true),
            createBuffer: jest.fn(() => ({})),
            bindBuffer: jest.fn(),
            bufferData: jest.fn(),
            enableVertexAttribArray: jest.fn(),
            vertexAttribPointer: jest.fn(),
            drawArrays: jest.fn(),
            getUniformLocation: jest.fn(() => ({})),
            getAttribLocation: jest.fn(() => ({})),
        }));

        // Set up a dummy canvas in the document
        document.body.innerHTML = ''; // Clear any previous content
        canvas = createDummyCanvas();
        // Instantiate the MandelbrotRenderer
        mandelbrot = new MandelbrotRenderer(canvas);

    });

    afterEach(() => {
        // Clean up by removing the canvas element.
        canvas.remove();
    });

    test('should initialize with default pan, zoom, and presets', () => {
        expect(mandelbrot.pan).toEqual([...mandelbrot.DEFAULT_PAN]);
        expect(mandelbrot.zoom).toEqual(mandelbrot.DEFAULT_ZOOM);
        // Check that presets is defined and is an array.
        expect(Array.isArray(mandelbrot.PRESETS)).toBe(true);
        expect(mandelbrot.PRESETS.length).toBeGreaterThan(0);
    });

    test('reset() should reinitialize pan and zoom to defaults', () => {
        // Change state.
        mandelbrot.pan = [1, 1];
        mandelbrot.zoom = 0.001;
        mandelbrot.reset();
        // Check if pan is equal to DEFAULT_PAN and zoom equals DEFAULT_ZOOM.
        expect(mandelbrot.pan).toEqual([...mandelbrot.DEFAULT_PAN]);
        expect(mandelbrot.zoom).toEqual(mandelbrot.DEFAULT_ZOOM);
    });

});
