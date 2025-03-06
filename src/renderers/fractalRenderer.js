import {updateInfo} from "../ui/ui";
import {compareComplex, comparePalettes, hslToRgb, lerp, normalizeRotation, rgbToHsl} from "../global/utils";
import {DEBUG_MODE, DEFAULT_CONSOLE_GROUP_COLOR, EASE_TYPE, PI} from "../global/constants";

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
        /** @type {COMPLEX} */
        this.DEFAULT_PAN = [0, 0];
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.MAX_ZOOM = 0.000017;
        this.MIN_ZOOM = 40;

        /** Interesting zoom-ins
         *  @type {Array.<PRESET>}
         */
        this.PRESETS = [];

        /**
         * Zoom. Lower number = higher zoom.
         * @type {number}
         */
        this.zoom = this.DEFAULT_ZOOM;

        /** @type {COMPLEX} */
        this.pan = [...this.DEFAULT_PAN]; // Copy

        /**
         * Rotation in rad
         * @type {number}
         */
        this.rotation = this.DEFAULT_ROTATION;

        this.currentPanAnimationFrame = null;
        this.currentZoomAnimationFrame = null;
        this.currentRotationAnimationFrame = null;
        this.currentColorAnimationFrame = null;

        this.demoActive = false;
        this.currentPresetIndex = 0;

        /**
         * Determines the level of fractal rendering detail
         * @type {number}
         */
        this.iterations = 0;
        this.extraIterations = 0;

        /** @type PALETTE */
        this.colorPalette = [...this.DEFAULT_PALETTE];

        /**  Vertex shader initialization snippet */
        this.vertexShaderSource = `
			precision mediump float;
			attribute vec4 a_position;
	   
			void main() {
				gl_Position = a_position;
			}
		`;

        this.canvas.addEventListener('webglcontextlost', this.onWebGLContextLost);
    }

    onWebGLContextLost(event) {
        event.preventDefault();
        console.warn(`%c ${this.constructor.name}: onWebGLContextLost %c WebGL context lost. Attempting to recover...`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        this.init(); // Reinitialize WebGL context
    }

    /** Destructor */
    destroy() {
        console.groupCollapsed(`%c ${this.constructor.name}: %c destroy`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        // Cancel any ongoing animations.
        this.stopAllNonColorAnimations();
        this.stopCurrentColorAnimations();

        // Remove event listeners from the canvas.
        if (this.canvas) {
            this.canvas.removeEventListener('webglcontextlost', this.onWebGLContextLost);
        }

        // Free WebGL resources.
        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
        if (this.vertexShader) {
            this.gl.deleteShader(this.vertexShader);
            this.vertexShader = null;
        }
        if (this.fragmentShader) {
            this.gl.deleteShader(this.fragmentShader);
            this.fragmentShader = null;
        }

        this.canvas = null;
        this.gl = null;

        console.groupEnd();
    }

    //region > CONTROL METHODS -----------------------------------------------------------------------------------------

    generatePresetIDs() {
        this.PRESETS.forEach((preset, index) => {
            preset.id = index;
        });
    }

    /** WebGL init & initial uniforms setting */
    init() {
        this.generatePresetIDs();
        this.initGLProgram();  // Initialize WebGL program and uniforms
        this.draw();
    }

    /** Updates the canvas size based on the current visual viewport and redraws the fractal */
    resizeCanvas() {
        console.groupCollapsed(`%c ${this.constructor.name}: resizeCanvas`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        console.log(`Canvas before resize: ${this.canvas.width}x${this.canvas.height}`);

        this.gl.useProgram(this.program);

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
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}: compileShader`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        if (DEBUG_MODE) console.log(`Shader GLenum type: ${type}`);
        if (DEBUG_MODE) console.log(`Shader code: ${source}`);

        this.gl.useProgram(this.program);

        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            if (DEBUG_MODE) console.groupEnd();
            return null;
        }
        if (DEBUG_MODE) console.groupEnd();

        return shader;
    }

    /**
     * Initializes the WebGL program, shaders and sets initial position
     */
    initGLProgram() {
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}: initGLProgram`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

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
    }

    /**
     * Draws the fractal's and sets basic uniforms. Customize iterations number to determine level of detail.
     */
    draw() {
        this.gl.useProgram(this.program);

        const w = this.canvas.width;
        const h = this.canvas.height;

        // Update the viewport.
        this.gl.viewport(0, 0, w, h);

        if (this.resolutionLoc === undefined) {
            // Cache the resolution location if not already cached.
            this.resolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
        }
        if (this.resolutionLoc) {
            this.gl.uniform2f(this.resolutionLoc, w, h);
        }

        this.gl.uniform2fv(this.panLoc, this.pan);
        this.gl.uniform1f(this.zoomLoc, this.zoom);
        this.gl.uniform1f(this.rotationLoc, this.rotation);
        this.gl.uniform1f(this.iterLoc, this.iterations);
        this.gl.uniform3fv(this.colorLoc, this.colorPalette);

        this.updateUniforms();

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * Resets the fractal to its initial state (default pan, zoom, palette, rotation, etc.), resizes and redraws.
     */
    reset() {
        console.groupCollapsed(`%c ${this.constructor.name}: reset`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        this.stopAllNonColorAnimations();
        this.stopCurrentColorAnimations();

        this.colorPalette = [...this.DEFAULT_PALETTE];
        this.pan = [...this.DEFAULT_PAN];
        this.zoom = this.DEFAULT_ZOOM;
        this.rotation = this.DEFAULT_ROTATION;
        this.extraIterations = 0;
        this.currentPresetIndex = 0;
        this.resizeCanvas();
        this.draw();

        console.groupEnd();
        updateInfo();
    }

    /**
     * Calculates coordinates from screen point [x, y] to the fractal scale [x, yi]
     *
     * @param {number} screenX
     * @param {number} screenY
     * @returns {COMPLEX} fractal plane coords [x, yi]
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

    /** Stops all currently running animations that are not a color transition */
    stopAllNonColorAnimations() {
        console.log(`%c ${this.constructor.name}: %c stopAllNonColorAnimations`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

        this.stopCurrentPanAnimation();
        this.stopCurrentZoomAnimation()
        this.stopCurrentRotationAnimation();
    }

    /** Stops currently running pan animation */
    stopCurrentPanAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentPanAnimation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

        if (this.currentPanAnimationFrame !== null) {
            cancelAnimationFrame(this.currentPanAnimationFrame);
            this.currentPanAnimationFrame = null;
        }
    }

    /** Stops currently running zoom animation */
    stopCurrentZoomAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentZoomAnimation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

        if (this.currentZoomAnimationFrame !== null) {
            cancelAnimationFrame(this.currentZoomAnimationFrame);
            this.currentZoomAnimationFrame = null;
        }
    }

    /** Stops currently running rotation animation */
    stopCurrentRotationAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentRotationAnimation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

        if (this.currentRotationAnimationFrame !== null) {
            cancelAnimationFrame(this.currentRotationAnimationFrame);
            this.currentRotationAnimationFrame = null;
        }
    }

    /** Stops currently running color animation */
    stopCurrentColorAnimations() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentColorAnimation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

        if (this.currentColorAnimationFrame !== null) {
            cancelAnimationFrame(this.currentColorAnimationFrame);
            this.currentColorAnimationFrame = null;
        }
    }

    /** Stops current demo and resets demo variables */
    stopDemo() {
        console.log(`%c ${this.constructor.name}: %c stopDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');
        this.demoActive = false;
        this.currentPresetIndex = 0;
        this.stopAllNonColorAnimations();
    }

    /** Default callback after every animation that requires on-screen info update */
    onAnimationFinished() {
        this.resizeCanvas();

        setTimeout(() => {
            updateInfo();
        }, 50);
    }

    /**
     * Smoothly transitions fractalApp.colorPalette from its current value
     * to the provided newPalette over the specified duration (in milliseconds).
     *
     * @param {PALETTE} newPalette - The target palette as [r, g, b] (each in [0,1]).
     * @param {number} [duration] - Duration of the transition in milliseconds.
     * @param {Function} [coloringCallback] A method called at every animation step
     * @return {Promise<void>}
     */
    async animateColorPaletteTransition(newPalette, duration = 250, coloringCallback = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateColorPaletteTransition`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentColorAnimations();

        if (comparePalettes(this.colorPalette, newPalette)) {
            console.warn(`Identical palette found. Skipping.`);
            return;
        }
        console.log(`Animating to ${newPalette}.`);

        const startPalette = [...this.colorPalette];

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
                    this.stopCurrentColorAnimations();
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
        console.log(`%c ${this.constructor.name}: animateFullColorSpaceCycle`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentColorAnimations();

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
     * @param {COMPLEX} targetPan
     * @param [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animatePanTo(targetPan, duration = 200, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentPanAnimation();

        if (compareComplex(this.pan, targetPan, 6)) {
            console.log(`Already at the target pan. Skipping.`);
            console.groupEnd();
            return;
        }
        console.log(`Panning to ${targetPan}.`);

        const startPan = [...this.pan];

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                const easedProgress = easeFunction(progress);

                this.pan[0] = lerp(startPan[0], targetPan[0], easedProgress);
                this.pan[1] = lerp(startPan[1], targetPan[1], easedProgress);
                this.draw();

                updateInfo(true);

                if (easedProgress < 1) {
                    this.currentPanAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentPanAnimation();
                    this.onAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentPanAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates to target zoom without panning.
     *
     * @param {number} targetZoom
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction If none is provided, it defaults to exponential.
     * @return {Promise<void>}
     */
    async animateZoomTo(targetZoom, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoomTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentZoomAnimation();

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

                if (easeFunction !== EASE_TYPE.NONE) {
                    const easedProgress = easeFunction(progress);
                    this.zoom = lerp(startZoom, targetZoom, easedProgress);
                } else {
                    this.zoom = startZoom * Math.pow(targetZoom / startZoom, progress); // Default to exponential
                }

                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentZoomAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentZoomAnimation();
                    this.onAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentZoomAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates to target rotation. Rotation is normalized into [0, 2*PI] interval
     *
     * @param {number} targetRotation
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animateRotationTo(targetRotation, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateRotationTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentRotationAnimation();

        // Normalize
        targetRotation = normalizeRotation(targetRotation);

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
                const easedProgress = easeFunction(progress);

                this.rotation = lerp(startRotation, targetRotation, easedProgress);
                this.draw();

                updateInfo(true);

                if (progress < 1) {
                    this.currentRotationAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentRotationAnimation();
                    this.onAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentRotationAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates sequential pan and then zooms into the target location.
     *
     * @param {COMPLEX} targetPan
     * @param {number} targetZoom
     * @param {number} panDuration in milliseconds
     * @param {number} zoomDuration in milliseconds
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animatePanThenZoomTo(targetPan, targetZoom, panDuration, zoomDuration, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanThenZoomTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        await this.animatePanTo(targetPan, panDuration, easeFunction);
        await this.animateZoomTo(targetZoom, zoomDuration, easeFunction);

        console.groupEnd();
    }

    /**
     * Animates pan and zoom simultaneously.
     *
     * @param {COMPLEX} targetPan
     * @param {number} targetZoom
     * @param {number} [duration] in milliseconds
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animatePanAndZoomTo(targetPan, targetZoom, duration = 1000, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanAndZoomTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        await Promise.all([
            this.animatePanTo(targetPan, duration, easeFunction),
            this.animateZoomTo(targetZoom, duration, easeFunction)
        ]);

        console.groupEnd();
    }

    /**
     * Animates to target zoom and rotation simultaneously. Rotation is normalized into [0, 2*PI] interval
     *
     * @param {number} targetZoom
     * @param {number} targetRotation
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animateZoomRotationTo(targetZoom, targetRotation, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoomRotationTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        await Promise.all([
            this.animateZoomTo(targetZoom, duration, easeFunction),
            this.animateRotationTo(targetRotation, duration, easeFunction)
        ]);

        console.groupEnd();
    }

    /**
     * Animates pan, zoom and rotation simultaneously
     *
     * @param {COMPLEX} targetPan
     * @param {number} targetZoom
     * @param {number} targetRotation
     * @param {number} [duration] in milliseconds
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animatePanZoomRotationTo(targetPan, targetZoom, targetRotation, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanZoomRotationTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        await Promise.all([
            this.animatePanTo(targetPan, duration, easeFunction),
            this.animateZoomTo(targetZoom, duration, easeFunction),
            this.animateRotationTo(targetRotation, duration, easeFunction)
        ]);

        console.groupEnd();
    }

    /**
     *
     * @param {ROTATION_DIRECTION} direction
     * @param {number} step Speed in rad/frame
     * @return {Promise<void>}
     */
    async animateInfiniteRotation(direction, step = 0.001) {
        console.log(`%c ${this.constructor.name}: animateInfiniteRotation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentRotationAnimation();

        const dir = direction >= 0 ? 1 : -1; // Normalize

        await new Promise(() => {

            const rotationStep = () => {
                this.rotation = normalizeRotation(this.rotation + dir * step + 2 * PI);
                this.draw();

                updateInfo(true);

                this.currentRotationAnimationFrame = requestAnimationFrame(rotationStep);
            };

            this.currentRotationAnimationFrame = requestAnimationFrame(rotationStep);
        });
        console.groupEnd();
    }

    /**
     * Animates travel to preset.
     * @abstract
     * @param {PRESET} preset - Parameters for the animation.
     * @param {number} duration - Parameters for the animation.
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, duration) {
        throw new Error('The animateTravelToPreset method must be implemented in child classes');
    }

    /**
     * Animate travel to a preset with random rotation. This method waits for three stages:
     *   1. Zoom-out with rotation.
     *   2. Pan transition.
     *   3. Zoom-in with rotation.
     *
     * @abstract
     * @param {PRESET} preset - The target preset object with properties: pan, c, zoom, rotation.
     * @param {number} zoomOutDuration - Duration (ms) for the zoom-out stage.
     * @param {number} panDuration - Duration (ms) for the pan stage.
     * @param {number} zoomInDuration - Duration (ms) for the zoom-in stage.
     */
    async animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        throw new Error('The animateTravelToPreset method must be implemented in child classes');
    }

    // endregion--------------------------------------------------------------------------------------------------------
}