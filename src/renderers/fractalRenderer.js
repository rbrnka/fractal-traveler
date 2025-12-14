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
            alpha: false, // Disable the alpha channel (not needed)
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
        this.MAX_ZOOM = 1e-300;
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
        this.pan = [...this.DEFAULT_PAN];

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

        /** Vertex shader */
        this.vertexShaderSource = `
			precision mediump float;
			attribute vec4 a_position;
			void main() {
				gl_Position = a_position;
			}
		`;

        this.onWebGLContextLost = this.onWebGLContextLost.bind(this);
        this.canvas.addEventListener('webglcontextlost', this.onWebGLContextLost);
    }

    onWebGLContextLost(event) {
        event.preventDefault();
        console.warn(
            `%c ${this.constructor.name}: onWebGLContextLost %c WebGL context lost. Attempting to recover...`,
            `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`,
            'color: #fff'
        );
        this.init();
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
        this.initGLProgram();
        this.draw();
    }

    /** Updates the canvas size based on the current visual viewport and redraws */
    resizeCanvas() {
        console.groupCollapsed(`%c ${this.constructor.name}: resizeCanvas`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        this.gl.useProgram(this.program);

        // 1) Compute the current center fractal coordinate BEFORE resizing (canvas-local center)
        const oldRect = this.canvas.getBoundingClientRect();
        const oldCenterX = oldRect.width / 2;
        const oldCenterY = oldRect.height / 2;
        const [centerFx, centerFy] = this.screenToFractal(oldCenterX, oldCenterY);

        // 2) Resize drawing buffer to match CSS size * DPR
        const dpr = window.devicePixelRatio || 1;

        // IMPORTANT: use the canvas element’s CSS size (rect), not visualViewport
        const cssW = oldRect.width;
        const cssH = oldRect.height;

        this.canvas.width = Math.floor(cssW * dpr);
        this.canvas.height = Math.floor(cssH * dpr);

        // 3) Update viewport + resolution uniform
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        if (this.resolutionLoc) {
            this.gl.uniform2f(this.resolutionLoc, this.canvas.width, this.canvas.height);
        }

        // 4) Recompute pan so that the same center fractal coord stays at screen center AFTER resizing
        const newRect = this.canvas.getBoundingClientRect();
        const newCenterX = newRect.width / 2;
        const newCenterY = newRect.height / 2;

        const [vx, vy] = this.screenToViewVector(newCenterX, newCenterY); // view vector (rotated/aspect corrected)
        this.pan[0] = centerFx - vx * this.zoom;
        this.pan[1] = centerFy - vy * this.zoom;

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
     * Compiles shader code
     * @param {string} source
     * @param {GLenum} type
     * @return {WebGLShader|null}
     */
    compileShader(source, type) {
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}: compileShader`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        if (DEBUG_MODE) console.log(`Shader GLenum type: ${type}`);
        if (DEBUG_MODE) console.log(`Shader code: ${source}`);

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
     * Initializes WebGL program, shaders, quad, and uniform caches.
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

        // Cache common uniform locations once
        this.updateUniforms();

        // Allow subclasses to set up extra GL resources (textures, extra uniforms, etc.)
        if (typeof this.onProgramCreated === 'function') {
            this.onProgramCreated();
        }

        if (DEBUG_MODE) console.groupEnd();
    }

    /**
     * Cache common uniforms used by many renderers
     */
    updateUniforms() {
        this.gl.useProgram(this.program);
        this.panLoc = this.gl.getUniformLocation(this.program, 'u_pan');
        this.zoomLoc = this.gl.getUniformLocation(this.program, 'u_zoom');
        this.iterLoc = this.gl.getUniformLocation(this.program, 'u_iterations');
        this.colorLoc = this.gl.getUniformLocation(this.program, 'u_colorPalette');
        this.rotationLoc = this.gl.getUniformLocation(this.program, 'u_rotation');
        this.resolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
    }

    /**
     * Draws the fractal and sets basic uniforms.
     * Subclasses can override draw() but must call super.draw() for viewport+common uniforms+draw call.
     */
    draw() {
        this.gl.useProgram(this.program);

        const w = this.canvas.width;
        const h = this.canvas.height;

        // Update the viewport.
        this.gl.viewport(0, 0, w, h);

        if (this.resolutionLoc) this.gl.uniform2f(this.resolutionLoc, w, h);

        // TODO Only set if shader actually uses them
        if (this.panLoc) this.gl.uniform2fv(this.panLoc, this.pan);
        if (this.zoomLoc) this.gl.uniform1f(this.zoomLoc, this.zoom);
        if (this.rotationLoc) this.gl.uniform1f(this.rotationLoc, this.rotation);
        if (this.iterLoc) this.gl.uniform1f(this.iterLoc, this.iterations);
        if (this.colorLoc) this.gl.uniform3fv(this.colorLoc, this.colorPalette);

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
     * Screen point -> fractal coordinates (float64 JS side; fine for UI)
     * @param {number} screenX
     * @param {number} screenY
     * @returns {COMPLEX}
     */
    screenToFractal(screenX, screenY) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width * dpr;
        const h = rect.height * dpr;

        const bufferX = screenX * dpr;
        const bufferY = screenY * dpr;

        const normX = bufferX / w;
        const normY = bufferY / h;

        let stX = normX - 0.5;
        let stY = (1 - normY) - 0.5;

        const aspect = w / h;
        stX *= aspect;

        const cosR = Math.cos(this.rotation);
        const sinR = Math.sin(this.rotation);
        const rotatedX = cosR * stX - sinR * stY;
        const rotatedY = sinR * stX + cosR * stY;

        const fx = rotatedX * this.zoom + this.pan[0];
        const fy = rotatedY * this.zoom + this.pan[1];

        return [fx, fy];
    }

    /**
     * Convert a screen point to the rotated, aspect-corrected "view vector" (no pan/zoom applied).
     * This is exactly what your shader calls `rotated`.
     *
     * @param {number} screenX CSS pixels relative to canvas (like your handlers use)
     * @param {number} screenY CSS pixels relative to canvas
     * @returns {[number, number]} view-space rotated vector
     */
    screenToViewVector(screenX, screenY) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width * dpr;
        const h = rect.height * dpr;

        const bufferX = screenX * dpr;
        const bufferY = screenY * dpr;

        const normX = bufferX / w;
        const normY = bufferY / h;

        let stX = normX - 0.5;
        let stY = (1 - normY) - 0.5;

        const aspect = w / h;
        stX *= aspect;

        const cosR = Math.cos(this.rotation);
        const sinR = Math.sin(this.rotation);

        const rotatedX = cosR * stX - sinR * stY;
        const rotatedY = sinR * stX + cosR * stY;

        return [rotatedX, rotatedY];
    }

    /**
     * Compute CSS-space center of the canvas (for default anchored zoom).
     * @returns {[number, number]}
     */
    getCanvasCssCenter() {
        const rect = this.canvas.getBoundingClientRect();
        return [rect.width / 2, rect.height / 2];
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
        setTimeout(() => updateInfo(), 50);
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
     * @param {Function} [coloringCallback]
     * @return {Promise<void>}
     */
    async animateFullColorSpaceCycle(duration = 15000, coloringCallback = null) {
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

                if (coloringCallback) coloringCallback();

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
     * Animates zoom while keeping the fractal point under an anchor screen coordinate fixed.
     *
     * @param {number} targetZoom
     * @param {number} [duration]
     * @param {EASE_TYPE|Function} easeFunction
     * @param {number|null} [anchorX] CSS px relative to canvas; defaults to canvas center
     * @param {number|null} [anchorY] CSS px relative to canvas; defaults to canvas center
     */
    async animateZoomTo(targetZoom, duration = 500, easeFunction = EASE_TYPE.NONE, anchorX = null, anchorY = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoomTo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentZoomAnimation();

        // TODO 12 digits enough?
        if (this.zoom.toFixed(12) === targetZoom.toFixed(12)) {
            console.log(`Already at the target zoom. Skipping.`);
            console.groupEnd();
            return;
        }

        // Default anchor = canvas center (stable, predictable)
        if (anchorX === null || anchorY === null) {
            const [cx, cy] = this.getCanvasCssCenter();
            anchorX = cx;
            anchorY = cy;
        }

        // The fractal point we must keep fixed (computed once)
        const [fxAnchor, fyAnchor] = this.screenToFractal(anchorX, anchorY);

        // The view vector corresponding to that same screen point (depends on rotation/aspect, not pan/zoom)
        const [vx, vy] = this.screenToViewVector(anchorX, anchorY);

        const startZoom = this.zoom;

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const t = Math.min((timestamp - startTime) / duration, 1);

                let k = t;
                if (easeFunction !== EASE_TYPE.NONE) k = easeFunction(t);

                // Exponential zoom feels best; keep your original behavior
                const newZoom = (easeFunction !== EASE_TYPE.NONE)
                    ? (startZoom + (targetZoom - startZoom) * k)
                    : (startZoom * Math.pow(targetZoom / startZoom, t));

                this.zoom = newZoom;

                // IMPORTANT: adjust pan so that anchor fractal point stays under (anchorX, anchorY)
                this.pan[0] = fxAnchor - vx * this.zoom;
                this.pan[1] = fyAnchor - vy * this.zoom;

                this.draw();

                updateInfo(true);

                if (t < 1) {
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

    async animateZoomToNoPan(targetZoom, duration = 500, easeFunction = EASE_TYPE.NONE) {
        this.stopCurrentZoomAnimation();

        if (this.zoom.toFixed(12) === targetZoom.toFixed(12)) return;

        const startZoom = this.zoom;

        await new Promise(resolve => {
            let startTime = null;
            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const t = Math.min((timestamp - startTime) / duration, 1);

                if (easeFunction !== EASE_TYPE.NONE) {
                    const k = easeFunction(t);
                    this.zoom = startZoom + (targetZoom - startZoom) * k;
                } else {
                    this.zoom = startZoom * Math.pow(targetZoom / startZoom, t);
                }

                this.draw();
                updateInfo(true);

                if (t < 1) {
                    this.currentZoomAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentZoomAnimation();
                    this.onAnimationFinished();
                    resolve();
                }
            };
            this.currentZoomAnimationFrame = requestAnimationFrame(step);
        });
    }

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
            this.animateZoomToNoPan(targetZoom, duration, easeFunction) // travel zoom: pan driven separately
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
            this.animateZoomToNoPan(targetZoom, duration, easeFunction),
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