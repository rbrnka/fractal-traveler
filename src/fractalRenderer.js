import {DEBUG_MODE, updateInfo} from "./ui";
import {hslToRgb, lerp, rgbToHsl} from "./utils";

/**
 * FractalRenderer
 *
 * @author Radim Brnka
 * @description This module defines a fractalRenderer abstract class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes common animation methods.
 * @abstract
 */
export class FractalRenderer {

    constructor(canvas) {
        this.canvas = canvas;
        this.gl = this.canvas.getContext('webgl', {
            antialias: false, // Already disabling anti-aliasing.
            alpha: false, // Disable alpha channel if not needed.
            depth: false, // Disable depth buffer.
            stencil: false, // Disable stencil buffer.
            preserveDrawingBuffer: false, // Do not preserve drawing buffer (faster).
            powerPreference: 'high-performance', // Hint for high-performance GPU.
            //failIfMajorPerformanceCaveat: true // Fail if forced to use software renderer.
        });

        if (!this.gl) {
            alert('WebGL is not supported by your browser.');
            return;
        }

        // Default values:
        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_ZOOM = 3.0;
        this.DEFAULT_PAN = [0, 0];
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.MAX_ZOOM = 0.000017;
        this.MIN_ZOOM = 40;

        /**
         * Interesting zoom-ins
         */
        this.PRESETS = [];

        // Use the setter so that if DEFAULT_ZOOM is out of bounds it’s clamped.
        this.zoom = this.DEFAULT_ZOOM;
        this.pan = this.DEFAULT_PAN.slice(); // Copy
        this.rotation = this.DEFAULT_ROTATION;

        this.currentAnimationFrame = null;
        this.currentColorAnimationFrame = null;
        this.extraIterations = 0;
        this.colorPalette = this.DEFAULT_PALETTE.slice();

        // Initialize shaders
        this.vertexShaderSource = `
			precision mediump float;
			attribute vec4 a_position;
	   
			void main() {
				gl_Position = a_position;
			}
		`;

        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('WebGL context lost. Attempting to recover...');
            this.init(); // Reinitialize WebGL context
        });
    }

    /**
     * WebGL init & initial uniforms setting
     */
    init() {
        // Initialize WebGL program and uniforms
        this.initGLProgram();

        // Cache uniform locations
        this.updateUniforms();
    }

    /**
     * Updates the canvas size based on the current visual viewport
     */
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

        const [fx, fy] = this.screenToFractal(centerX, centerY);
        this.pan[0] = fx;
        this.pan[1] = fy;

        this.draw();
    }

    /**
     * Defines the shader code for rendering the fractal shape
     *
     * @abstract
     */
    createFragmentShaderSource() {
        throw new Error('The draw method must be implemented in child classes');
    }

    /**
     * Compiles the shader code
     *
     * @param source
     * @param type
     * @return {*|{}|WebGLShader|null}
     */
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

    /**
     * Initializes the WebGL program and sets initial position
     */
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
        this.innerStopsLoc = this.gl.getUniformLocation(this.program, 'u_innerStops');
    }

    /**
     * Draws the fractal.
     *
     * @abstract
     */
    draw() {
        throw new Error('The draw method must be implemented in child classes');
    }

    /**
     * Resets the fractal to its initial state (default pan, zoom, palette, rotation, etc.), resizes and redraws.
     */
    reset() {
        this.stopCurrentNonColorAnimation();
        this.stopCurrentColorAnimation();

        this.colorPalette = this.DEFAULT_PALETTE.slice();
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
     *
     * @param screenX
     * @param screenY
     * @returns {number[]} fractal plane coords [x, yi]
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

        if (DEBUG_MODE)
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
     * Stops currently running animation that is not a color transition
     */
    stopCurrentNonColorAnimation() {
        if (this.currentAnimationFrame !== null) {
            cancelAnimationFrame(this.currentAnimationFrame);
            this.currentAnimationFrame = null;
        }
    }

    /**
     * Stops currently running color animation
     */
    stopCurrentColorAnimation() {
        if (this.currentColorAnimationFrame !== null) {
            cancelAnimationFrame(this.currentColorAnimationFrame);
            this.currentColorAnimationFrame = null;
        }
    }

    /**
     * Default callback after every animation that requires on-screen info update
     */
    updateInfoOnAnimationFinished() {
        setTimeout(() => {
            updateInfo();
        }, 200);
    }

    /**
     * Smoothly transitions fractalApp.colorPalette from its current value
     * to the provided newPalette over the specified duration (in milliseconds).
     *
     * @param {Array} newPalette - The target palette as [r, g, b] (each in [0,1]).
     * @param {number} duration - Duration of the transition in milliseconds.
     * @param callback
     */
    animateColorPaletteTransition(newPalette, duration = 250, callback = null) {
        this.stopCurrentColorAnimation();

        // Store the starting palette
        const startPalette = this.colorPalette.slice();
        let startTime = null;
        const self = this;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            // Interpolate each channel.
            const interpPalette = [
                lerp(startPalette[0], newPalette[0], progress),
                lerp(startPalette[1], newPalette[1], progress),
                lerp(startPalette[2], newPalette[2], progress)
            ];

            self.colorPalette = interpPalette;
            self.draw();

            if (progress < 1) {
                self.currentColorAnimationFrame = requestAnimationFrame(step);
            } else {
                self.stopCurrentColorAnimation();
                if (callback) callback();
            }
        }

        this.currentColorAnimationFrame = requestAnimationFrame(step);
    }

    /**
     * Animates fractalApp.colorPalette by cycling through the entire color space.
     * The palette will continuously change hue from 0 to 360 degrees and starts from the current palette
     *
     * @param {number} duration - Duration (in milliseconds) for one full color cycle.
     */
    animateFullColorSpaceCycle(duration) {
        this.stopCurrentColorAnimation();

        let startTime = null;
        const self = this;
        console.log("Starting full color cycle animation from current palette");

        const currentRGB = self.colorPalette;
        const hsl = rgbToHsl(currentRGB[0], currentRGB[1], currentRGB[2]);
        const startHue = hsl[0];  // starting hue in [0,1]
        // Use fixed saturation and lightness for the animation.
        const fixedS = 1.0;
        const fixedL = 0.6;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = ((timestamp - startTime) % duration) / duration;
            const newHue = (startHue + progress) % 1;
            const newPalette = hslToRgb(newHue, fixedS, fixedL);

            self.colorPalette = newPalette;
            self.draw();

            self.currentColorAnimationFrame = requestAnimationFrame(step);
            updateInfo(true);
        }

        self.currentColorAnimationFrame = requestAnimationFrame(step);
    }

    /**
     * Animates pan
     *
     * @param targetPan
     * @param duration
     * @param callback after the animation
     * @param startPan
     */
    animatePan(targetPan, duration = 200, callback = null, startPan = this.pan.slice()) {
        this.stopCurrentNonColorAnimation();

        const self = this;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            self.pan[0] = startPan[0] + (targetPan[0] - startPan[0]) * progress;
            self.pan[1] = startPan[1] + (targetPan[1] - startPan[1]) * progress;
            self.draw();

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(step);
                updateInfo(true);
            } else {
                self.updateInfoOnAnimationFinished();
                self.stopCurrentNonColorAnimation();
                if (callback) callback();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(step);
    }

    /**
     * Animates to target zoom without panning.
     *
     * @param targetZoom
     * @param duration in ms
     * @param callback
     */
    animateZoom(targetZoom, duration, callback = null) {
        this.stopCurrentNonColorAnimation();

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
                self.stopCurrentNonColorAnimation();
                self.updateInfoOnAnimationFinished();
                if (callback) callback();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepZoom);
    }

    /**
     * Animates sequential pan and then zooms into the target location.
     *
     * @param targetPan Array [x, y]
     * @param targetZoom
     * @param panDuration in milliseconds
     * @param zoomDuration in milliseconds
     * @param startPan Defaults to current pan
     * @param callback
     */
    animatePanThenZoom(targetPan, targetZoom, panDuration, zoomDuration, startPan = this.pan.slice(), callback = null) {
        this.stopCurrentNonColorAnimation();

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
                self.animateZoom(targetZoom, zoomDuration, callback);
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepPan);
    }

    /**
     * Animates pan and zoom simultaneously.
     *
     * @param targetPan Array [x, y]
     * @param targetZoom
     * @param duration in milliseconds
     * @param callback Function called when animation is finished
     */
    animatePanAndZoomTo(targetPan, targetZoom, duration = 500, callback = null) {
        this.stopCurrentNonColorAnimation();

        const startPan = this.pan.slice();
        const startZoom = this.zoom;
        const self = this;
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            // In animatePanAndZoomTo or other animations:
            self.pan[0] = lerp(startPan[0], targetPan[0], progress);
            self.pan[1] = lerp(startPan[1], targetPan[1], progress);
            self.zoom = lerp(startZoom, targetZoom, progress);
            self.draw();
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(step);
            } else {
                self.stopCurrentNonColorAnimation();
                self.updateInfoOnAnimationFinished();
                if (callback) callback();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(step);
    }

    /**
     * Animates pan, zoom and rotation simultaneously
     *
     * @param targetPan
     * @param targetZoom
     * @param targetRotation
     * @param duration
     * @param callback
     */
    animatePanZoomRotate(targetPan, targetZoom, targetRotation, duration = 500, callback = null) {
        this.stopCurrentNonColorAnimation();

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
                self.stopCurrentNonColorAnimation();
                self.updateInfoOnAnimationFinished();
                if (callback) callback();
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(step);
    }

    /**
     * Animates travel to a preset. If any of the final params is different from the default, it won't animate it.
     * It first zooms out to the default zoom and then animates pan and zoom otherwise.
     *
     * @param {Object} preset An instance-specific object to define exact spot in the fractal
     *      @param {Array} preset.pan [fx, fy]
     *      @param {number} preset.zoom
     *      @param {number} preset.rotation in rad
     * @param {number} zoomOutDuration in ms
     * @param {number} panDuration in ms
     * @param {number} zoomInDuration in ms
     * @param {function()} callback A callback method executed once the animation is finished
     */
    animateTravelToPreset(preset, zoomOutDuration = 500, panDuration = 500, zoomInDuration = 3500, callback = null) {
        this.stopCurrentNonColorAnimation();

        const self = this;

        if (this.zoom === this.DEFAULT_ZOOM) {
            console.log('Already at default zoom, only pan and then zoom');
            this.animatePanThenZoom(preset.pan, preset.zoom, panDuration, zoomInDuration, this.pan.slice(), callback);
            return;
        }

        if (this.zoom === preset.zoom) {
            console.log('Already at the correct zoom, only pan.');
            this.animatePan(preset.pan, panDuration, callback);
            return;
        }

        if (preset.pan[0].toFixed(6) === self.pan[0].toFixed(6) && preset.pan[1].toFixed(6) === self.pan[1].toFixed(6)) {
            console.log('Already in right pan, zooming only.');
            self.animateZoom(preset.zoom, zoomInDuration, callback);
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
     * Demo loop traveling through presets
     * @param preset
     *      @param {Array} preset.pan [fx, fy]
     *      @param {number} preset.zoom
     *      @param {number} preset.rotation in rad
     * @param zoomOutDuration in ms
     * @param panDuration in ms
     * @param zoomInDuration in ms
     */
    animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        this.stopCurrentNonColorAnimation();

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
                } else {
                    self.stopCurrentNonColorAnimation();
                    if (callback) callback();
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
                    self.updateInfoOnAnimationFinished();
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
