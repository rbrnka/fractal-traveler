import {updateInfo} from "./ui";

/**
 * FractalRenderer
 * @author Radim Brnka
 * @abstract
 */
export class FractalRenderer {

    constructor(canvas) {
        this.canvas = canvas;
        this.gl = this.canvas.getContext('webgl', {antialias: true});

        if (!this.gl) {
            alert('WebGL is not supported by your browser.');
            return;
        }

        // Default values:
        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_ZOOM = 3.0;
        this.DEFAULT_PAN = [-0.5, 0.0];
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.MAX_ZOOM = 0.000017;
        this.MIN_ZOOM = 40;
        // Interesting zoom-ins
        this.PRESETS = [];

        // Use the setter so that if DEFAULT_ZOOM is out of bounds it’s clamped.
        this.zoom = this.DEFAULT_ZOOM;
        this.pan = this.DEFAULT_PAN.slice(); // Copy
        this.rotation = this.DEFAULT_ROTATION;

        this.fractalCenter = this.screenToFractal(this.canvas.width / 2, this.canvas.height / 2);
        console.log("Fractal centered to " + this.fractalCenter);

        this.currentAnimationFrame = null;
        this.extraIterations = 0;
        this.colorPalette = this.DEFAULT_PALETTE.slice();

        // Initialize shaders
        this.vertexShaderSource = `
            precision mediump float;
            attribute vec4 a_position;
            uniform float u_rotation;
       
            void main() {
                gl_Position = a_position;
            }
        `;

        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('WebGL context lost. Attempting to recover...');
            this.init(); // Reinitialize WebGL context
        });

        this.init();
    }

    init() {
        // Initialize WebGL program and uniforms
        this.initGLProgram();

        // Cache uniform locations
        this.updateUniforms();
    }

    resizeCanvas() {
        console.log("Resizing canvas");

        // Use visual viewport if available, otherwise fallback to window dimensions.
        const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        // Compute the center based on the visible viewport.
        const centerX = vw / 2;
        const centerY = vh / 2;

        // Get the device pixel ratio.
        const dpr = window.devicePixelRatio || 1;

        // Set the drawing-buffer size to match the visible viewport.
        this.canvas.width = Math.floor(vw * dpr);
        this.canvas.height = Math.floor(vh * dpr);

        // Set the CSS size to match the visible viewport.
        this.canvas.style.width = vw + "px";
        this.canvas.style.height = vh + "px";

        console.log("After resize: canvas.width =", this.canvas.width, "canvas.height =", this.canvas.height);

        // Update the WebGL viewport and the resolution uniform.
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.resolutionLoc) {
            this.gl.uniform2f(this.resolutionLoc, this.canvas.width, this.canvas.height);
        }

        // Now reapply the stored fractal center, if available.
        if (this.fractalCenter) {
            console.log("Reapplying stored center:", this.fractalCenter);
            this.pan[0] = this.fractalCenter[0];
            this.pan[1] = this.fractalCenter[1];
        } else {
            console.warn("No stored centerCoord found; the fractal will recenter based on the computed center.");
            const [fx, fy] = this.screenToFractal(centerX, centerY);
            this.pan[0] = fx;
            this.pan[1] = fy;
        }

        this.draw();
    }

    /**
     * @abstract
     */
    createFragmentShaderSource() {
        throw new Error('The draw method must be implemented in child classes');
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
        this.rotationLoc = this.gl.getUniformLocation(this.program, 'u_rotation'); // Add rotation
        this.resolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
    }

    /**
     * Draws the fractal.
     * @abstract
     */
    draw() {
        throw new Error('The draw method must be implemented in child classes');
    }

    /**
     * Resets the fractal to its initial state (default pan, zoom) and redraws.
     */
    reset() {
        this.stopCurrentAnimation();
        this.pan = this.DEFAULT_PAN.slice();
        this.zoom = this.DEFAULT_ZOOM; // Uses the setter!
        this.rotation = 0; // Reset rotation
        this.extraIterations = 0;
        this.resizeCanvas();
        this.draw();

        updateInfo();
    }

    /**
     * Calculates coordinates from screen to fx/fy in the fractal scale (matches complex number x+yi)
     * @param screenX
     * @param screenY
     * @returns {number[]}
     */
    screenToFractal(screenX, screenY) {
        const dpr = window.devicePixelRatio || 1;
        // Use the canvas's bounding rectangle for CSS dimensions.
        const rect = this.canvas.getBoundingClientRect();
        // Use the actual CSS size of the canvas.
        const w = rect.width * dpr;
        const h = rect.height * dpr;

        // Convert the screen (touch/mouse) coordinate to drawing-buffer pixels.
        const bufferX = screenX * dpr;
        const bufferY = screenY * dpr;

        // Normalize to [0,1]
        const normX = bufferX / w;
        const normY = bufferY / h;

        // In the shader, I subtract 0.5 and flip Y because gl_FragCoord.y starts from the bottom.
        let stX = normX - 0.5;
        let stY = (1 - normY) - 0.5;

        // Adjust x by the aspect ratio.
        const aspect = w / h;
        stX *= aspect;

        // Apply rotation correction (using the current fractalApp.rotation)
        const cosR = Math.cos(this.rotation);
        const sinR = Math.sin(this.rotation);
        const rotatedX = cosR * stX - sinR * stY;
        const rotatedY = sinR * stX + cosR * stY;

        // Map to fractal coordinates (using current zoom and pan)
        const fx = rotatedX * this.zoom + this.pan[0];
        const fy = rotatedY * this.zoom + this.pan[1];

        console.log(
            `screenToFractal - dpr: ${dpr}, CSS input (${screenX}, ${screenY}), ` +
            `buffer coords (${bufferX.toFixed(2)}, ${bufferY.toFixed(2)}), normalized (${stX.toFixed(3)}, ${stY.toFixed(3)}), ` +
            `fractal (${fx}, ${fy})`
        );

        return [fx, fy];
    }


    // -----------------------------------------------------------------------------------------------------------------
    // Animation Methods
    // -----------------------------------------------------------------------------------------------------------------
    /**
     * Stops currently running animation
     */
    stopCurrentAnimation() {
        if (this.currentAnimationFrame !== null) {
            cancelAnimationFrame(this.currentAnimationFrame);
            this.currentAnimationFrame = null;
        }
    }

    /**
     * Default callback after every animation
     */
    onAnimationFinished() {
        setTimeout(() => {
            updateInfo();
        }, 200);
    }

    /**
     * Animates zoom without panning.
     * @param targetZoom
     * @param duration in milliseconds
     */
    animateZoom(targetZoom, duration) {
        this.stopCurrentAnimation();

        const startZoom = this.zoom;
        const self = this;
        let startTime = null;

        function stepZoom(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.draw();

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepZoom);
                updateInfo(true);
            } else {
                self.onAnimationFinished();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepZoom);
    }

    /**
     * Animates sequential pan and then zooms into the target location.
     * @param targetPan Array [x, y]
     * @param targetZoom
     * @param panDuration in milliseconds
     * @param zoomDuration in milliseconds
     * @param startPan Defaults to current pan
     */
    animatePanThenZoom(targetPan, targetZoom, panDuration, zoomDuration, startPan = this.pan.slice()) {
        this.stopCurrentAnimation();

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
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepPan);
            } else {
                self.animateZoom(targetZoom, zoomDuration);
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepPan);
    }

    /**
     * Animates pan and zoom simultaneously.
     * @param targetPan Array [x, y]
     * @param targetZoom
     * @param duration in milliseconds
     * @param callback Function called when animation is finished
     */
    animatePanAndZoomTo(targetPan, targetZoom, duration = 500, callback = null) {
        this.stopCurrentAnimation();

        const startPan = this.pan.slice();
        const startZoom = this.zoom;
        const self = this;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            const lerp = (a, b, t) => a + (b - a) * t;

            // In animatePanAndZoomTo or other animations:
            self.pan[0] = lerp(startPan[0], targetPan[0], progress);
            self.pan[1] = lerp(startPan[1], targetPan[1], progress);
            self.zoom = lerp(startZoom, targetZoom, progress);
            self.draw();
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(step);
            } else {
                self.onAnimationFinished();
                if (callback) callback();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(step);
    }

    /**
     *
     * @param targetPan
     * @param targetZoom
     * @param targetRotation
     * @param duration
     * @param callback
     */
    animatePanZoomRotate(targetPan, targetZoom, targetRotation, duration = 500, callback = null) {
        this.stopCurrentAnimation();

        const startPan = this.pan.slice();
        const startZoom = this.zoom;
        const startRotation = this.rotation;
        const self = this;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            self.pan[0] = startPan[0] + (targetPan[0] - startPan[0]) * progress;
            self.pan[1] = startPan[1] + (targetPan[1] - startPan[1]) * progress;
            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.rotation = startRotation + (targetRotation - startRotation) * progress;
            self.draw();

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(step);
                updateInfo(true);
            } else {
                self.onAnimationFinished();
                if (callback) callback();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(step);
    }

    /**
     * Animates travel to a preset. If the current zoom is different from the default,
     * it first zooms out to the default zoom and then animates pan and zoom.
     * @param preset Object { pan: [x, y], zoom: number }
     * @param zoomOutDuration in milliseconds
     * @param panDuration in milliseconds
     * @param zoomInDuration in milliseconds
     */
    animateTravelToPreset(preset, zoomOutDuration, panDuration, zoomInDuration) {
        this.stopCurrentAnimation();

        const self = this;

        if (this.zoom === this.DEFAULT_ZOOM) {
            this.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomInDuration);
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
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepZoomOut);
            } else {
                self.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomInDuration, self.pan.slice());
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepZoomOut);
    }

    /**
     * Demo traveling through presets
     * @param preset
     * @param zoomOutDuration
     * @param panDuration
     * @param zoomInDuration
     */
    animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        this.stopCurrentAnimation();

        if (this.zoom === this.DEFAULT_ZOOM) {
            this.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomInDuration);
            return;
        }

        const startZoom = this.zoom;
        const startPan = this.pan.slice();
        const startRotation = this.rotation;

        // Adjust rotation ranges for more noticeable and random effects
        const zoomOutRotation = startRotation + (Math.random() * Math.PI * 2 - Math.PI);
        const zoomInRotation = zoomOutRotation + (Math.random() * Math.PI * 2 - Math.PI);

        const self = this;

        function animateZoomOut(callback) {
            let startTime = null;

            function stepZoomOut(timestamp) {
                if (!startTime) startTime = timestamp;
                const progress = Math.min(1, (timestamp - startTime) / zoomOutDuration);

                // Zoom out
                self.zoom = startZoom * Math.pow(self.DEFAULT_ZOOM / startZoom, progress);

                // Rotate during zoom-out
                self.rotation = startRotation + (zoomOutRotation - startRotation) * progress;

                self.draw();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepZoomOut);
                } else if (callback) {
                    callback();
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepZoomOut);
        }

        function animatePan(callback) {
            let startTime = null;

            function stepPan(timestamp) {
                if (!startTime) startTime = timestamp;
                const progress = Math.min(1, (timestamp - startTime) / panDuration);

                // Pan without rotation
                self.pan[0] = startPan[0] + (preset.pan[0] - startPan[0]) * progress;
                self.pan[1] = startPan[1] + (preset.pan[1] - startPan[1]) * progress;

                self.draw();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepPan);
                } else if (callback) {
                    callback();
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepPan);
        }

        function animateZoomInWithRotation() {
            let startTime = null;

            function stepZoomInRotate(timestamp) {
                if (!startTime) startTime = timestamp;
                const progress = Math.min(1, (timestamp - startTime) / zoomInDuration);

                // Zoom in
                self.zoom = self.DEFAULT_ZOOM * Math.pow(preset.zoom / self.DEFAULT_ZOOM, progress);

                // Rotate during zoom-in
                self.rotation = zoomOutRotation + (zoomInRotation - zoomOutRotation) * progress;

                self.draw();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepZoomInRotate);
                } else {
                    self.onAnimationFinished();
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepZoomInRotate);
        }

        // Execute zoom-out, then pan, then zoom-in with rotation
        animateZoomOut(() => {
            animatePan(() => {
                animateZoomInWithRotation();
            });
        });
    }
}
