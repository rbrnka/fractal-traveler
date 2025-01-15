/**
 * FractalRenderer
 * @author Radim Brnka
 * @
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
        this.PRESETS = [];

        this.zoom = self.DEFAULT_ZOOM;
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
        this.resizeCanvas();
    }

    // set zoom(value) {
    //     if (value < this.MAX_ZOOM && value > this.MIN_ZOOM) {
    //         this.zoom = value;
    //     }
    // }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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

    draw() {
        this.initGLProgram();
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        const panLoc = this.gl.getUniformLocation(this.program, 'u_pan');
        const zoomLoc = this.gl.getUniformLocation(this.program, 'u_zoom');
        const iterLoc = this.gl.getUniformLocation(this.program, 'u_iterations');
        const colorLoc = this.gl.getUniformLocation(this.program, 'u_colorPalette');

        this.gl.uniform2fv(panLoc, this.pan);
        this.gl.uniform1f(zoomLoc, this.zoom);

        const baseIters = Math.floor(100 * Math.pow(2, -Math.log2(this.zoom)));
        const iters = Math.min(10000, baseIters + this.extraIterations);

        this.gl.uniform1f(iterLoc, iters);
        this.gl.uniform3fv(colorLoc, this.colorPalette);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    reset() {
        this.pan = this.DEFAULT_PAN.slice();
        this.zoom = this.DEFAULT_ZOOM;
        this.extraIterations = 0;

        this.draw();
    }

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

        return [fx, fy];
    }

    // ----------------------------------------------------------------------------------------------------------------
    // Animation methods
    // ----------------------------------------------------------------------------------------------------------------
    animatePanThenZoom(targetPan, targetZoom, panDuration, zoomDuration, startPan = this.pan.slice()) {
        const startStatePan = startPan; // current pan
        const self = this;

        let startTime = null;

        function stepPan(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let progress = elapsed / panDuration;
            if (progress > 1) progress = 1;
            self.pan[0] = startStatePan[0] + (targetPan[0] - startStatePan[0]) * progress;
            self.pan[1] = startStatePan[1] + (targetPan[1] - startStatePan[1]) * progress;
            self.draw();
            if (progress < 1) {
                requestAnimationFrame(stepPan);
            } else {
                self.animateZoom(targetZoom, zoomDuration);
            }
        }

        requestAnimationFrame(stepPan);
    }

    animateZoom(targetZoom, duration) {
        const startZoom = this.zoom;
        const self = this;

        let startTime = null;

        function stepZoom(timestamp) {
            if (!startTime) startTime = timestamp;
            let elapsed = timestamp - startTime;
            let progress = elapsed / duration;
            if (progress > 1) progress = 1;

            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.draw();

            if (progress < 1) {
                requestAnimationFrame(stepZoom);
            }
        }

        requestAnimationFrame(stepZoom);
    }

    animatePanAndZoomTo(targetPan, targetZoom, duration = 500) {
        // Capture the starting state.
        const startPan = [this.pan[0], this.pan[1]];
        const startZoom = this.zoom;
        const self = this;

        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let progress = elapsed / duration;
            if (progress > 1) {
                progress = 1;
            }

            // Simultaneously interpolate pan linearly:
            self.pan[0] = startPan[0] + (targetPan[0] - startPan[0]) * progress;
            self.pan[1] = startPan[1] + (targetPan[1] - startPan[1]) * progress;
            // And interpolate zoom exponentially (for a smooth effect):
            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.draw();
            //updateInfo(null, true);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

    /**
     * Zooms to preset by zooming out to default, panning and then zooming in
     * @param preset Array [[panX, panY], zoom]
     * @param zoomOutDuration
     * @param panDuration
     * @param zoomDuration
     */
    animateTravelToPreset(preset, zoomOutDuration, panDuration, zoomDuration) {
        if (this.zoom === this.DEFAULT_ZOOM) {
            this.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomDuration);
            return;
        }

        const startZoom = this.zoom;
        let startTime = null;
        const self = this;

        // Phase 1: Zoom Out
        function stepZoomOut(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let progress = elapsed / zoomOutDuration;
            if (progress > 1) progress = 1;

            // Exponential interpolation for zoom-out:
            self.zoom = startZoom * Math.pow(self.DEFAULT_ZOOM / startZoom, progress);

            self.draw();  // Use self.draw() instead of this.draw()

            // TODO: update info if needed, e.g., updateInfo(null, true);

            if (progress < 1) {
                requestAnimationFrame(stepZoomOut);
            } else {
                // Phase 2: We have zoomed out, animate pan and zoom into the preset.
                self.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomDuration, self.pan.slice());
            }
        }

        requestAnimationFrame(stepZoomOut);
    }
}