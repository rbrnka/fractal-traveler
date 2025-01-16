// src/tests/fractalRenderer.test.js
import { FractalRenderer } from '../fractalRenderer.js';
import { MandelbrotRenderer } from '../mandelbrotRenderer.js';

describe("FractalRenderer (Abstract)", () => {
    beforeEach(() => {
        // Set up the DOM with a canvas element.
        document.body.innerHTML = `<canvas id="fractalCanvas"></canvas>`;
    });

    test("should throw an error if instantiated directly", () => {
        expect(() => new FractalRenderer("fractalCanvas")).toThrow(
            "Abstract classes can't be instantiated."
        );
    });
});

describe("MandelbrotRenderer", () => {
    let canvas, renderer, fakeGL;

    beforeEach(() => {
        // Set window dimensions for consistency.
        window.innerWidth = 800;
        window.innerHeight = 600;

        // Set up a dummy canvas element in the DOM.
        document.body.innerHTML = `<canvas id="fractalCanvas" width="800" height="600"></canvas>`;
        canvas = document.getElementById("fractalCanvas");

        // Create a fake WebGL context.
        fakeGL = {
            viewport: jest.fn(),
            getUniformLocation: jest.fn().mockReturnValue("uniLoc"),
            uniform2fv: jest.fn(),
            uniform1f: jest.fn(),
            uniform3fv: jest.fn(),
            clearColor: jest.fn(),
            clear: jest.fn(),
            drawArrays: jest.fn(),
            createShader: jest.fn().mockReturnValue({}),
            shaderSource: jest.fn(),
            compileShader: jest.fn(),
            getShaderParameter: jest.fn(() => true),
            deleteShader: jest.fn(),
            createProgram: jest.fn().mockReturnValue({}),
            attachShader: jest.fn(),
            linkProgram: jest.fn(),
            getProgramParameter: jest.fn(() => true),
            useProgram: jest.fn(),
            createBuffer: jest.fn().mockReturnValue({}),
            bindBuffer: jest.fn(),
            bufferData: jest.fn(),
            getAttribLocation: jest.fn().mockReturnValue("attribLoc"),
            enableVertexAttribArray: jest.fn(),
            vertexAttribPointer: jest.fn(),
            TRIANGLE_STRIP: "TRIANGLE_STRIP"
        };

        // Override the canvas's getContext to return our fake WebGL context.
        jest.spyOn(canvas, "getContext").mockReturnValue(fakeGL);

        // Instantiate the MandelbrotRenderer.
        renderer = new MandelbrotRenderer("fractalCanvas");
        // Ensure the abstract fix: In your MandelbrotRenderer constructor (via super),
        // the statement `this.zoom = this.DEFAULT_ZOOM;` should be used.
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("should initialize with default pan, zoom, and presets", () => {
        expect(renderer.pan).toEqual([-0.5, 0.0]);
        expect(renderer.zoom).toEqual(renderer.DEFAULT_ZOOM);
        expect(Array.isArray(renderer.PRESETS)).toBe(true);
        // For MandelbrotRenderer, presets should be provided.
        expect(renderer.PRESETS.length).toBeGreaterThan(0);
    });

    test("reset() should restore pan, zoom, extraIterations and call draw()", () => {
        // Change state from defaults.
        renderer.pan = [1, 1];
        renderer.zoom = 0.001;
        renderer.extraIterations = 10;

        renderer.reset();

        // Expect default values after reset.
        expect(renderer.pan).toEqual(renderer.DEFAULT_PAN);
        expect(renderer.zoom).toEqual(renderer.DEFAULT_ZOOM);
        expect(renderer.extraIterations).toBe(0);
        // Check that draw() was called (fakeGL.drawArrays should have been triggered).
        expect(fakeGL.drawArrays).toHaveBeenCalled();
    });

    test("screenToFractal() should convert screen coordinates as expected", () => {
        // Set defaults
        renderer.zoom = 3.0;
        renderer.pan = [-0.5, 0.0];

        /* Calculation for canvas width 800 x height 600 at center (400,300):
           stX = 400 / 800 = 0.5, stY = (600-300)/600 = 0.5.
           Then, stX - 0.5 = 0 and stY - 0.5 = 0.
           Therefore, fx = 0 * zoom + pan[0] = -0.5 and fy = 0 * zoom + pan[1] = 0.
        */
        const [fx, fy] = renderer.screenToFractal(400, 300);
        expect(fx).toBeCloseTo(-0.5, 6);
        expect(fy).toBeCloseTo(0.0, 6);
    });

    test("draw() should update WebGL state and call gl.drawArrays", () => {
        renderer.draw();

        expect(fakeGL.viewport).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
        // Since getUniformLocation is stubbed as "uniLoc", check that uniform setters are called with that string.
        expect(fakeGL.uniform2fv).toHaveBeenCalledWith("uniLoc", renderer.pan);
        expect(fakeGL.uniform1f).toHaveBeenCalledWith("uniLoc", renderer.zoom);
        const baseIters = Math.floor(100 * Math.pow(2, -Math.log2(renderer.zoom)));
        const iters = Math.min(10000, baseIters + renderer.extraIterations);
        expect(fakeGL.uniform1f).toHaveBeenCalledWith("uniLoc", iters);
        expect(fakeGL.uniform3fv).toHaveBeenCalledWith("uniLoc", renderer.colorPalette);
        expect(fakeGL.clearColor).toHaveBeenCalledWith(0, 0, 0, 1);
        expect(fakeGL.clear).toHaveBeenCalled();
        expect(fakeGL.drawArrays).toHaveBeenCalledWith("TRIANGLE_STRIP", 0, 4);
    });
});
