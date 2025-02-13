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

    /**
     * @param {HTMLCanvasElement} canvas
     */
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
            alert('WebGL is not supported by your browser or crashed.');
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
         * Preset is an object containing properties of specific point in the fractal on the scene.
         * @typedef Preset {Object}
         */
        /** Interesting zoom-ins
         *  @type {Array.<Preset>}
         */
        this.PRESETS = [];

        /**
         * Zoom. Lower number = higher zoom.
         * @type {number}
         */
        this.zoom = this.DEFAULT_ZOOM;

        /**
         * Coordinates in fractal units
         * @typedef {Array.<number>} Pan
         * @property {number} panX
         * @property {number} panY
         */
        /** @type Pan */
        this.pan = this.DEFAULT_PAN.slice(); // Copy

        /**
         * Rotation in rad
         * @type {number}
         */
        this.rotation = this.DEFAULT_ROTATION;

        this.currentAnimationFrame = null;
        this.currentColorAnimationFrame = null;
        this.extraIterations = 0;

        /**
         * Color palette
         * @typedef {Float32List} Palette
         * @property {number} R Red
         * @property {number} G Green
         * @property {number} B Blue
         */
        /** @type Palette */
        this.colorPalette = this.DEFAULT_PALETTE.slice();

        /**  Vertex shader initialization snippet */
        this.vertexShaderSource = `
			precision mediump float;
			attribute vec4 a_position;
	   
			void main() {
				gl_Position = a_position;
			}
		`;

        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn(`%c ${this.constructor.name}: %c WebGL context lost. Attempting to recover...`, 'color: #bada55', 'color: #fff');
            this.init(); // Reinitialize WebGL context
        });
    }

    //region > CONTROL METHODS -----------------------------------------------------------------------------------------

    /** WebGL init & initial uniforms setting */
    init() {
        this.initGLProgram();  // Initialize WebGL program and uniforms
        this.updateUniforms(); // Cache uniform locations
    }

    /** Updates the canvas size based on the current visual viewport and redraws the fractal */
    resizeCanvas() {
        console.groupCollapsed(`%c ${this.constructor.name}: resizeCanvas`, 'color: #bada55');
        console.log(`Canvas before resize: ${this.canvas.width}x${this.canvas.height}`);

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

        console.log(`Canvas after resize: ${this.canvas.width}x${this.canvas.height}`);

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

        console.groupEnd();
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
     * @param {string} source
     * @param {GLenum} type
     * @return {WebGLShader|null}
     */
    compileShader(source, type) {
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}: compileShader`, 'color: #bada55');
        console.log(`Shader GLenum type: ${type}`);
        console.log(`Shader code: ${source}`);

        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        if (DEBUG_MODE) console.groupEnd();

        return shader;
    }

    /**
     * Initializes the WebGL program, shaders and sets initial position
     */
    initGLProgram() {
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}: initGLProgram`, 'color: #bada55');

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

        if (DEBUG_MODE) console.groupEnd();
    }

    /**
     * Updates uniforms (should be done on every redraw)
     */
    updateUniforms() {
        this.gl.useProgram(this.program);

        // Cache the uniform locations.
        this.panLoc = this.gl.getUniformLocation(this.program, 'u_pan');
        this.zoomLoc = this.gl.getUniformLocation(this.program, 'u_zoom');
        this.iterLoc = this.gl.getUniformLocation(this.program, 'u_iterations');
        this.colorLoc = this.gl.getUniformLocation(this.program, 'u_colorPalette');
        this.rotationLoc = this.gl.getUniformLocation(this.program, 'u_rotation');
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
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}: reset`, 'color: #bada55');

        this.stopCurrentNonColorAnimation();
        this.stopCurrentColorAnimation();

        this.colorPalette = this.DEFAULT_PALETTE.slice();
        this.pan = this.DEFAULT_PAN.slice();
        this.zoom = this.DEFAULT_ZOOM;
        this.rotation = this.DEFAULT_ROTATION;
        this.extraIterations = 0;
        this.resizeCanvas();
        this.draw();

        if (DEBUG_MODE) console.groupEnd();
        updateInfo();
    }

    /**
     * Calculates coordinates from screen point [x, y] to the fractal scale [x, yi]
     *
     * @param {number} screenX
     * @param {number} screenY
     * @returns {Pan} fractal plane coords [x, yi]
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

        return [fx, fy];
    }

    // endregion--------------------------------------------------------------------------------------------------------
    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

    /**
     * Stops currently running animation that is not a color transition
     */
    stopCurrentNonColorAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentNonColorAnimation`, 'color: #bada55', 'color: #fff');

        if (this.currentAnimationFrame !== null) {
            cancelAnimationFrame(this.currentAnimationFrame);
            this.currentAnimationFrame = null;
        }
    }

    /**
     * Stops currently running color animation
     */
    stopCurrentColorAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentColorAnimation`, 'color: #bada55', 'color: #fff');

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
        }, 50);
    }

    /**
     * Method that handles gradual color changes
     * @callback coloringCallback
     */
    /**
     * Smoothly transitions fractalApp.colorPalette from its current value
     * to the provided newPalette over the specified duration (in milliseconds).
     *
     * @param {Palette} newPalette - The target palette as [r, g, b] (each in [0,1]).
     * @param {number} [duration] - Duration of the transition in milliseconds.
     * @param {coloringCallback} [coloringCallback] A method called at every animation step
     * @return {Promise<void>}
     */
    async animateColorPaletteTransition(newPalette, duration = 250, coloringCallback = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateColorPaletteTransition`, 'color: #bada55');
        this.stopCurrentColorAnimation();

        if (this.colorPalette[0] === newPalette[0] && this.colorPalette[1] === newPalette[1] && this.colorPalette[2] === newPalette[2]) {
            console.warn(`Identical palette found. Skipping.`);
            return;
        }
        console.log(`Animating to ${newPalette}.`);

        const startPalette = this.colorPalette.slice();

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Interpolate each channel.
                this.colorPalette = [
                    lerp(startPalette[0], newPalette[0], progress),
                    lerp(startPalette[1], newPalette[1], progress),
                    lerp(startPalette[2], newPalette[2], progress)
                ];
                this.draw();

                if (coloringCallback) coloringCallback();

                if (progress < 1) {
                    this.currentColorAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentColorAnimation();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentColorAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates fractalApp.colorPalette by cycling through the entire color space.
     * The palette will continuously change hue from 0 to 360 degrees and starts from the current palette
     *
     * @param {number} [duration] - Duration (in milliseconds) for one full color cycle.
     * @return {Promise<void>}
     */
    async animateFullColorSpaceCycle(duration = 15000) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateFullColorSpaceCycle`, 'color: #bada55');
        this.stopCurrentColorAnimation();

        console.log(`Starting.`);

        const currentRGB = this.colorPalette;
        const hsl = rgbToHsl(currentRGB[0], currentRGB[1], currentRGB[2]);
        const startHue = hsl[0]; // starting hue in [0, 1]
        const fixedS = 1.0;
        const fixedL = 0.6;

        // Return a Promise that never resolves (continuous animation)
        await new Promise(() => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                const newHue = (startHue + progress) % 1;

                this.colorPalette = hslToRgb(newHue, fixedS, fixedL);
                this.draw();
                this.currentColorAnimationFrame = requestAnimationFrame(step);
            };
            this.currentColorAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates pan from current position to the new one
     *
     * @param {Pan} targetPan
     * @param [duration] in ms
     * @return {Promise<void>}
     */
    async animatePan(targetPan, duration = 200) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePan`, 'color: #bada55');
        this.stopCurrentNonColorAnimation();

        if (this.pan[0].toFixed(6) === targetPan[0].toFixed(6) && this.pan[1].toFixed(6) === targetPan[1].toFixed(6)) {
            console.log(`Already at the target pan. Skipping.`);
            console.groupEnd();
            return;
        }
        console.log(`Panning to ${targetPan}.`);

        const startPan = this.pan.slice();

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                this.pan[0] = startPan[0] + (targetPan[0] - startPan[0]) * progress;
                this.pan[1] = startPan[1] + (targetPan[1] - startPan[1]) * progress;
                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentNonColorAnimation();
                    this.updateInfoOnAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates to target zoom without panning.
     *
     * @param {number} targetZoom
     * @param {number} [duration] in ms
     * @return {Promise<void>}
     */
    async animateZoom(targetZoom, duration = 500) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoom`, 'color: #bada55');
        this.stopCurrentNonColorAnimation();

        if (this.zoom.toFixed(6) === targetZoom.toFixed(6)) {
            console.log(`Already at the target zoom. Skipping.`);
            console.groupEnd();
            return;
        }
        console.log(`Zooming from ${this.zoom.toFixed(6)} to ${targetZoom.toFixed(6)}.`);

        const startZoom = this.zoom;

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                this.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentNonColorAnimation();
                    this.updateInfoOnAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates to target rotation. Rotation is normalized into [0, 2*PI] interval
     *
     * @param {number} targetRotation
     * @param {number} [duration] in ms
     * @return {Promise<void>}
     */
    async animateRotation(targetRotation, duration = 500) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateRotation`, 'color: #bada55');
        this.stopCurrentNonColorAnimation();

        // Normalize
        targetRotation = (targetRotation % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI);

        if (this.rotation.toFixed(6) === targetRotation.toFixed(6)) {
            console.log(`Already at the target rotation "${targetRotation}". Skipping.`);
            console.groupEnd();
            return;
        }
        console.log(`Rotating from ${this.rotation.toFixed(6)} to ${targetRotation.toFixed(6)}.`);

        const startRotation = this.rotation;

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                this.rotation = startRotation + (targetRotation - startRotation) * progress;
                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentNonColorAnimation();
                    this.updateInfoOnAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates sequential pan and then zooms into the target location.
     *
     * @param {Pan} targetPan
     * @param {number} targetZoom
     * @param {number} panDuration in milliseconds
     * @param {number} zoomDuration in milliseconds
     * @return {Promise<void>}
     */
    async animatePanThenZoom(targetPan, targetZoom, panDuration, zoomDuration) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanThenZoom`, 'color: #bada55');
        await this.animatePan(targetPan, panDuration);
        await this.animateZoom(targetZoom, zoomDuration);
        console.groupEnd();
    }

    /**
     * Animates pan and zoom simultaneously.
     *
     * @param {Pan} targetPan
     * @param {number} targetZoom
     * @param {number} [duration] in milliseconds
     * @return {Promise<void>}
     */
    async animatePanAndZoomTo(targetPan, targetZoom, duration = 1000) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanAndZoomTo`, 'color: #bada55');
        this.stopCurrentNonColorAnimation();

        if (this.zoom.toFixed(6) === targetZoom.toFixed(6)) {
            console.log(`Already at the target zoom. Panning.`);
            await this.animatePan(targetPan, Math.round(duration / 2));
            console.groupEnd();
            return;
        }

        if (this.pan[0].toFixed(6) === targetPan[0].toFixed(6) && this.pan[1].toFixed(6) === targetPan[1].toFixed(6)) {
            console.log(`Already at the target pan. Zooming.`);
            await this.animateZoom(targetZoom, Math.round(duration / 2));
            console.groupEnd();
            return;
        }

        console.log(`Panning and zooming in parallel.`);

        const startPan = this.pan.slice();
        const startZoom = this.zoom;

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                this.pan[0] = lerp(startPan[0], targetPan[0], progress);
                this.pan[1] = lerp(startPan[1], targetPan[1], progress);
                this.zoom = lerp(startZoom, targetZoom, progress);
                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentNonColorAnimation();
                    this.updateInfoOnAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates pan, zoom and rotation simultaneously
     *
     * @param {Pan} targetPan
     * @param {number} targetZoom
     * @param {number} targetRotation
     * @param {number} [duration] in milliseconds
     * @return {Promise<void>}
     */
    async animatePanZoomRotate(targetPan, targetZoom, targetRotation, duration = 500) {
        this.stopCurrentNonColorAnimation();
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanZoomRotate`, 'color: #bada55');
        console.log(`Panning, zooming and rotating in parallel.`);

        // Simply does the animation without the need for other combinations of animation methods.
        const startPan = this.pan.slice();
        const startZoom = this.zoom;
        const startRotation = this.rotation;

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1)

                this.pan[0] = startPan[0] + (targetPan[0] - startPan[0]) * progress;
                this.pan[1] = startPan[1] + (targetPan[1] - startPan[1]) * progress;
                this.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
                this.rotation = startRotation + (targetRotation - startRotation) * progress;
                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentNonColorAnimation();
                    this.updateInfoOnAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates travel to preset.
     * @abstract
     * @return {Promise<void>}
     */
    async animateTravelToPreset() {
        throw new Error('The animateTravelToPreset method must be implemented in child classes');
    }

    /**
     * Animate travel to a preset with random rotation. This method waits for three stages:
     *   1. Zoom-out with rotation.
     *   2. Pan transition.
     *   3. Zoom-in with rotation.
     *
     * @abstract
     * @param {Preset} preset - The target preset object with properties: pan, c, zoom, rotation.
     * @param {number} zoomOutDuration - Duration (ms) for the zoom-out stage.
     * @param {number} panDuration - Duration (ms) for the pan stage.
     * @param {number} zoomInDuration - Duration (ms) for the zoom-in stage.
     */
    async animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        throw new Error('The animateTravelToPreset method must be implemented in child classes');
    }

    // endregion--------------------------------------------------------------------------------------------------------
}