import { updateInfo } from "./ui";

/**
 * FractalRenderer
 * @author Radim Brnka
 * @abstract
 */
export class FractalRenderer {
    constructor(canvasId) {
        if (this.constructor === FractalRenderer) {
            throw new Error("Abstract classes can't be instantiated.");
        }

        this.canvas = document.getElementById(canvasId);
        this.gl = this.canvas.getContext('webgl');

        if (!this.gl) {
            alert('WebGL is not supported by your browser.');
            return;
        }

        // Default values:
        this.DEFAULT_ZOOM = 3.0;
        this.DEFAULT_PAN = [-0.5, 0.0];
        this.MAX_ZOOM = 0.000017;
        this.MIN_ZOOM = 40;
        // Interesting zoom-ins
        this.PRESETS = [];

        // Use the setter so that if DEFAULT_ZOOM is out of bounds it’s clamped.
        this.zoom = this.DEFAULT_ZOOM;
        this.pan = this.DEFAULT_PAN.slice(); // Copy

        this.extraIterations = 0;
        this.colorPalette = [1.0, 1.0, 1.0];

        // Initialize shaders
        this.vertexShaderSource = `
            attribute vec4 a_position;
            void main() {
                gl_Position = a_position;
            }
        `;

        // Bind resize event
        window.addEventListener('resize', () => this.resizeCanvas());

        // Initialize WebGL program and uniforms
        this.initGLProgram();

        // Cache uniform locations
        this.updateUniforms();

        this.resizeCanvas();
    }

    // // Zoom getter and setter with clamping.
    // set zoom(value) {
    //     // Clamp the new value between MIN_ZOOM and MAX_ZOOM.
    //     // If value is out of bounds, it will be set to the nearest allowed value.
    //     this._zoom = Math.min(Math.max(value, this.MIN_ZOOM), this.MAX_ZOOM);
    // }
    //
    // get zoom() {
    //     return this._zoom;
    // }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    createFragmentShaderSource() {
        throw new Error("Method not implemented!");
    }

    compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    initGLProgram() {
        if (this.program) this.gl.deleteProgram(this.program);
        if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);

        if (!this.vertexShader) {
            this.vertexShader = this.compileShader(this.vertexShaderSource, this.gl.VERTEX_SHADER);
        }
        this.fragmentShader = this.compileShader(this.createFragmentShaderSource(), this.gl.FRAGMENT_SHADER);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, this.vertexShader);
        this.gl.attachShader(this.program, this.fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(this.program));
        }
        this.gl.useProgram(this.program);

        // Set up a full-screen quad
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(positionLoc);
        this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    /**
     * Updates uniforms (should be done on every redraw)
     */
    updateUniforms() {
        // Make sure the program is active.
        this.gl.useProgram(this.program);

        // Cache the uniform locations.
        this.panLoc = this.gl.getUniformLocation(this.program, 'u_pan');
        this.zoomLoc = this.gl.getUniformLocation(this.program, 'u_zoom');
        this.iterLoc = this.gl.getUniformLocation(this.program, 'u_iterations');
        this.colorLoc = this.gl.getUniformLocation(this.program, 'u_colorPalette');
    }

    /**
     * Draws the fractal.
     */
    draw() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.updateUniforms();

        this.gl.uniform2fv(this.panLoc, this.pan);
        this.gl.uniform1f(this.zoomLoc, this.zoom);

        const baseIters = Math.floor(100 * Math.pow(2, -Math.log2(this.zoom)));
        const iters = Math.min(10000, baseIters + this.extraIterations);

        this.gl.uniform1f(this.iterLoc, iters);
        this.gl.uniform3fv(this.colorLoc, this.colorPalette);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * Resets the fractal to its initial state (default pan, zoom) and redraws.
     */
    reset() {
        this.pan = this.DEFAULT_PAN.slice();
        this.zoom = this.DEFAULT_ZOOM; // Uses the setter!
        this.extraIterations = 0;
        this.draw();
    }

    /**
     * Calculates coordinates from screen to fx/fy in the fractal scale (matches complex number x+yi)
     * @param screenX
     * @param screenY
     * @returns {number[]}
     */
    screenToFractal(screenX, screenY) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const aspect = w / h;

        let stX = screenX / w;
        let stY = (h - screenY) / h;

        stX -= 0.5;
        stY -= 0.5;
        stX *= aspect;

        const fx = stX * this.zoom + this.pan[0];
        const fy = stY * this.zoom + this.pan[1];

        return [fx, fy]; // x+yi
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Animation Methods
    // -----------------------------------------------------------------------------------------------------------------
    /**
     * Animates sequential pan and then zooms into the target location.
     * @param targetPan Array [x, y]
     * @param targetZoom
     * @param panDuration in milliseconds
     * @param zoomDuration in milliseconds
     * @param startPan Defaults to current pan
     */
    animatePanThenZoom(targetPan, targetZoom, panDuration, zoomDuration, startPan = this.pan.slice()) {
        const startStatePan = startPan; // current pan
        const self = this;
        let startTime = null;

        function stepPan(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / panDuration;
            if (progress > 1) progress = 1;

            self.pan[0] = startStatePan[0] + (targetPan[0] - startStatePan[0]) * progress;
            self.pan[1] = startStatePan[1] + (targetPan[1] - startStatePan[1]) * progress;
            self.draw();
            updateInfo(null, true);

            if (progress < 1) {
                requestAnimationFrame(stepPan);
            } else {
                self.animateZoom(targetZoom, zoomDuration);
            }
        }
        requestAnimationFrame(stepPan);
    }

    /**
     * Animates zoom without panning.
     * @param targetZoom
     * @param duration in milliseconds
     */
    animateZoom(targetZoom, duration) {
        const startZoom = this.zoom;
        const self = this;
        let startTime = null;

        function stepZoom(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.draw();
            updateInfo(null, true);

            if (progress < 1) {
                requestAnimationFrame(stepZoom);
            }
        }
        requestAnimationFrame(stepZoom);
    }

    /**
     * Animates pan and zoom simultaneously.
     * @param targetPan Array [x, y]
     * @param targetZoom
     * @param duration in milliseconds
     */
    animatePanAndZoomTo(targetPan, targetZoom, duration = 500) {
        const startPan = this.pan.slice();
        const startZoom = this.zoom;
        const self = this;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            self.pan[0] = startPan[0] + (targetPan[0] - startPan[0]) * progress;
            self.pan[1] = startPan[1] + (targetPan[1] - startPan[1]) * progress;
            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.draw();
            updateInfo(null, true);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    /**
     * Animates travel to a preset. If the current zoom is different from the default,
     * it first zooms out to the default zoom and then animates pan and zoom.
     * @param preset Object { pan: [x, y], zoom: number }
     * @param zoomOutDuration in milliseconds
     * @param panDuration in milliseconds
     * @param zoomDuration in milliseconds
     */
    animateTravelToPreset(preset, zoomOutDuration, panDuration, zoomDuration) {
        const self = this;
        if (this.zoom === this.DEFAULT_ZOOM) {
            this.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomDuration);
            return;
        }

        const startZoom = this.zoom;
        let startTime = null;
        function stepZoomOut(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / zoomOutDuration;
            if (progress > 1) progress = 1;

            self.zoom = startZoom * Math.pow(self.DEFAULT_ZOOM / startZoom, progress);
            self.draw();
            updateInfo(null, true);

            if (progress < 1) {
                requestAnimationFrame(stepZoomOut);
            } else {
                self.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomDuration, self.pan.slice());
            }
        }
        requestAnimationFrame(stepZoomOut);
    }
}
