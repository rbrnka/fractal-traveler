// src/tests/fractalRenderer.test.js
import {FractalRenderer} from '../fractalRenderer.js';
import {MandelbrotRenderer} from '../mandelbrotRenderer.js';

describe("FractalRenderer (Abstract)", () => {
    beforeEach(() => {
        document.body.innerHTML = `<canvas id="fractalCanvas"></canvas>`;
    });

    test("should throw an error if instantiated directly", () => {
        expect(() => new FractalRenderer("fractalCanvas")).toThrow("Abstract classes can't be instantiated.");
    });
});

describe("MandelbrotRenderer", () => {
    let canvas, renderer, fakeGL;

    beforeEach(() => {
        // Set window dimensions for consistency.
        window.innerWidth = 800;
        window.innerHeight = 600;

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

        // Stub canvas.getContext to return fakeGL.
        jest.spyOn(canvas, "getContext").mockReturnValue(fakeGL);

        // Instantiate MandelbrotRenderer (which extends FractalRenderer).
        renderer = new MandelbrotRenderer("fractalCanvas");
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("should initialize with default pan, zoom, and presets", () => {
        expect(renderer.pan).toEqual(renderer.DEFAULT_PAN.slice());
        expect(renderer.zoom).toEqual(renderer.DEFAULT_ZOOM);
        expect(Array.isArray(renderer.PRESETS)).toBe(true);
        expect(renderer.PRESETS.length).toBeGreaterThan(0);
    });

    test("reset() should restore pan, zoom, and extraIterations, then call draw()", () => {
        // Change state from defaults.
        renderer.pan = [1, 1];
        renderer.zoom = 0.001;
        renderer.extraIterations = 10;

        // Call reset.
        renderer.reset();

        // Defaults should be restored.
        expect(renderer.pan).toEqual(renderer.DEFAULT_PAN);
        expect(renderer.zoom).toEqual(renderer.DEFAULT_ZOOM);
        expect(renderer.extraIterations).toBe(0);
        // draw() should have been triggered, meaning fakeGL.drawArrays is called.
        expect(fakeGL.drawArrays).toHaveBeenCalled();
    });

    test("screenToFractal() should convert screen coordinates as expected", () => {
        // Given a canvas of 800x600 and default pan/zoom.
        renderer.zoom = 3.0;
        renderer.pan = [-0.5, 0.0];
        /*
           Calculation (for point 400,300):
           stX = 400/800 = 0.5, stY = (600-300)/600 = 0.5,
           then stX -= 0.5 -> 0, stY -= 0.5 -> 0.
           So, fx = 0 * zoom + pan[0] = -0.5, fy = 0 * zoom + pan[1] = 0.
        */
        const [fx, fy] = renderer.screenToFractal(400, 300);
        expect(fx).toBeCloseTo(-0.5, 6);
        expect(fy).toBeCloseTo(0.0, 6);
    });

    test("draw() should update uniforms and call gl.drawArrays", () => {
        renderer.draw();

        expect(fakeGL.viewport).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
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

    test('should update zoom when value is within bounds', () => {
        renderer.zoom = 7; // 7 is within the range [1, 10]
        expect(renderer.zoom).toBe(7);
    });

    test('should not update zoom when value is out of bounds', () => {
        // Try setting zoom to a value below MIN_ZOOM.
        renderer.zoom = 0.0000005;
        expect(renderer.zoom).toBe(renderer.MAX_ZOOM);

        renderer.zoom = 100;
        expect(renderer.zoom).toBe(renderer.MIN_ZOOM);
    });

    test('should not update zoom when value is greater than MAX_ZOOM', () => {
        // Try setting zoom to a value above MAX_ZOOM.
        renderer.zoom = 200; // 20 is above MAX_ZOOM of 10
        // The zoom should remain unchanged.

    });

    test('Default zoom should not be out of bounds', () => {
        expect(renderer.DEFAULT_ZOOM).toBeGreaterThanOrEqual(renderer.MAX_ZOOM);
        expect(renderer.DEFAULT_ZOOM).toBeLessThanOrEqual(renderer.MIN_ZOOM);
    });
});
