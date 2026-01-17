import {debugPanel, updateInfo} from "../ui/ui";
import {
    compareComplex,
    comparePalettes,
    ddAdd,
    ddMake,
    ddSet,
    ddValue,
    hslToRgb,
    lerp,
    normalizeRotation,
    rgbToHsl
} from "../global/utils";
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEBUG_MODE, EASE_TYPE, log, PI} from "../global/constants";
import vertexFragmentShaderRaw from '../shaders/vertexShaderInit.vert';

/**
 * FractalRenderer
 *
 * @author Radim Brnka (c) 2025-2026
 * @description This module defines a fractalRenderer abstract class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes common animation methods.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 * @abstract
 */
class FractalRenderer {

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = this.canvas.getContext("webgl", {
            antialias: false,
            alpha: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
        });

        if (!this.gl) {
            alert('WebGL is not supported by your browser or crashed.');
            return;
        }

        // Defaults:
        this.MAX_ITER = 2000;

        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_ZOOM = 3.0;
        /** @type {COMPLEX} */
        this.DEFAULT_PAN = [0, 0];
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.MAX_ZOOM = 1e-80;
        this.MIN_ZOOM = 40;

        /**
         * Interesting points / details / zooms / views
         * @type {Array.<PRESET>}
         */
        this.PRESETS = [];

        /** @type {number} */
        this.zoom = this.DEFAULT_ZOOM;

        /** @type {COMPLEX} */
        this.pan = [...this.DEFAULT_PAN];

        /** DD accumulator mirrors into this.pan */
        this.panDD = {
            x: ddMake(this.pan[0], 0),
            y: ddMake(this.pan[1], 0),
        };

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

        this.interactionActive = false;
        this.interactionTimer = null;

        /** @type {number} */
        this.iterations = 0;
        this.extraIterations = 0;

        this.bestScore = NaN;
        this.probeIters = NaN;


        /** @type PALETTE */
        this.colorPalette = [...this.DEFAULT_PALETTE];

        /** Vertex shader */
        this.vertexShaderSource = vertexFragmentShaderRaw;

        this.onWebGLContextLost = this.onWebGLContextLost.bind(this);
        this.canvas.addEventListener('webglcontextlost', this.onWebGLContextLost);
    }

    /**
     * Hook for perturbation renderers to request orbit rebuild.
     * No-op by default.
     */
    markOrbitDirty() {}

    // --------- Pan API (use these; they keep DD + array in sync) ---------

    /** @returns {number[]} the canonical array */
    getPan() {
        return [this.pan[0], this.pan[1]];
    }

    /**
     * Sets the pan values for the object.
     *
     * @param {number} x - The horizontal pan value.
     * @param {number} y - The vertical pan value.
     * @return {void}
     */
    setPan(x, y) {
        ddSet(this.panDD.x, x);
        ddSet(this.panDD.y, y);
        this.pan[0] = ddValue(this.panDD.x);
        this.pan[1] = ddValue(this.panDD.y);
    }

    /**
     * Adjusts the pan values by adding the specified deltas to the current pan values.
     *
     * @param {number} dx - The change in the x-direction to be added to the pan.
     * @param {number} dy - The change in the y-direction to be added to the pan.
     * @return {void}
     */
    addPan(dx, dy) {
        ddAdd(this.panDD.x, dx);
        ddAdd(this.panDD.y, dy);
        this.pan[0] = ddValue(this.panDD.x);
        this.pan[1] = ddValue(this.panDD.y);
    }

    /**
     * Set pan so that fractal point (fxAnchor,fyAnchor) remains under a screen point
     * whose view vector is (vx,vy).
     */
    setPanFromAnchor(fxAnchor, fyAnchor, vx, vy) {
        const px = fxAnchor - vx * this.zoom;
        const py = fyAnchor - vy * this.zoom;
        this.setPan(px, py);
    }

    /**
     * Sets zoom while keeping the fractal point under a given screen anchor fixed.
     * Uses DD-preserving arithmetic to avoid precision loss at deep zoom.
     *
     * @param {number} targetZoom
     * @param {number} anchorX CSS px relative to canvas
     * @param {number} anchorY CSS px relative to canvas
     */
    setZoomKeepingAnchor(targetZoom, anchorX, anchorY) {
        // View vector (rotated + aspect corrected) is stable because it does not include pan/zoom.
        const [vx, vy] = this.screenToViewVector(anchorX, anchorY);

        // To keep fractal point under cursor fixed:
        // Old: fractalPt = pan + v * oldZoom
        // New: fractalPt = newPan + v * newZoom
        // Therefore: newPan = pan + v * (oldZoom - newZoom)
        // Using addPan preserves DD precision (unlike setPan which resets lo=0)
        const deltaZoom = this.zoom - targetZoom;
        this.addPan(vx * deltaZoom, vy * deltaZoom);

        this.zoom = targetZoom;
    }

    /**
     * Marks the app as "in interaction" (drag/wheel/key-pan) and schedules a settle phase.
     * Perturbation renderers can use this to defer expensive orbit rebuilds until the user stops moving.
     *
     * @param {number} settleMs
     */
    noteInteraction(settleMs = 160) {
        this.interactionActive = true;

        if (this.interactionTimer) {
            clearTimeout(this.interactionTimer);
            this.interactionTimer = null;
        }

        this.interactionTimer = setTimeout(() => {
            this.interactionActive = false;

            // Request a clean rebuild at rest for perturbation renderers (safe no-op otherwise)
            this.markOrbitDirty();

            // One clean redraw at settle time (prevents “swim” and removes lingering error)
            this.draw();
            updateInfo(true);
        }, settleMs);
    }

    onWebGLContextLost(event) {
        event.preventDefault();
        console.warn(
            `%c ${this.constructor.name}: onWebGLContextLost %c WebGL context lost. Attempting to recover...`,
            CONSOLE_GROUP_STYLE,
            CONSOLE_MESSAGE_STYLE
        );
        this.init();
    }

    /** Destructor */
    destroy() {
        console.groupCollapsed(`%c ${this.constructor.name}: %c destroy`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
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

        if (this.interactionTimer) {
            clearTimeout(this.interactionTimer);
            this.interactionTimer = null;
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

    init() {
        this.generatePresetIDs();
        this.initGLProgram();
        this.draw();
    }

    resizeCanvas() {
        log(`resizeCanvas`, this.constructor.name);

        this.gl.useProgram(this.program);

        // Keep the center fixed
        const oldRect = this.canvas.getBoundingClientRect();
        const cx = oldRect.width / 2;
        const cy = oldRect.height / 2;

        const [centerFx, centerFy] = this.screenToFractal(cx, cy);

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(oldRect.width * dpr);
        this.canvas.height = Math.floor(oldRect.height * dpr);

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        if (this.resolutionLoc) this.gl.uniform2f(this.resolutionLoc, this.canvas.width, this.canvas.height);

        const [vx, vy] = this.screenToViewVector(cx, cy);
        this.setPanFromAnchor(centerFx, centerFy, vx, vy);

        // After resizing, request a clean rebuild for perturbation renderers (safe no-op otherwise)
        this.markOrbitDirty();
        this.draw();
    }


    /**
     * Defines the shader code for rendering the fractal shape
     *
     * @abstract
     * @returns {string}
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
        if (DEBUG_MODE) {
            console.groupCollapsed(`%c ${this.constructor.name}: %c compileShader`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
            console.log(`Shader GLenum type: ${type}\nShader code: ${source}`);
        }

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
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}:%c initGLProgram`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

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

        // Full-screen quad
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        const positionLoc = this.gl.getAttribLocation(this.program, "a_position");
        this.gl.enableVertexAttribArray(positionLoc);
        this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);

        this.updateUniforms();

        if (typeof this.onProgramCreated === "function") {
            this.onProgramCreated();
        }

        if (DEBUG_MODE) console.groupEnd();
    }

    /** @abstract */
    onProgramCreated() {
        throw new Error("The onProgramCreated method must be implemented in child classes");
    }

    /**
     * kept for compatibility; perturbation renderers may ignore
     * @abstract
     */
    needsRebase() {
        throw new Error("The needsRebase method must be implemented in child classes");
    }

    /**
     * Cache common uniforms used by all renderers
     */
    updateUniforms() {
        this.gl.useProgram(this.program);
        this.panLoc = this.gl.getUniformLocation(this.program, "u_pan");
        this.zoomLoc = this.gl.getUniformLocation(this.program, "u_zoom");
        this.iterLoc = this.gl.getUniformLocation(this.program, "u_iterations");
        this.colorLoc = this.gl.getUniformLocation(this.program, "u_colorPalette");
        this.rotationLoc = this.gl.getUniformLocation(this.program, "u_rotation");
        this.resolutionLoc = this.gl.getUniformLocation(this.program, "u_resolution");
    }

    /**
     * Draws the fractal and sets basic uniforms.
     * Subclasses can override draw() but must call super.draw() for viewport+common uniforms+draw call.
     */
    draw() {
        this.gl.useProgram(this.program);

        const w = this.canvas.width;
        const h = this.canvas.height;

        this.gl.viewport(0, 0, w, h);

        if (this.resolutionLoc) this.gl.uniform2f(this.resolutionLoc, w, h);
        if (this.panLoc) this.gl.uniform2fv(this.panLoc, this.pan);
        if (this.zoomLoc) this.gl.uniform1f(this.zoomLoc, this.zoom);
        if (this.rotationLoc) this.gl.uniform1f(this.rotationLoc, this.rotation);
        if (this.iterLoc) this.gl.uniform1f(this.iterLoc, this.iterations);
        if (this.colorLoc) this.gl.uniform3fv(this.colorLoc, this.colorPalette);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        debugPanel?.beginGpuTimer();
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        debugPanel?.endGpuTimer();
    }

    /**
     * Resets the fractal to its initial state (default pan, zoom, palette, rotation, etc.), resizes and redraws.
     */
    reset() {
        console.groupCollapsed(`%c ${this.constructor.name}: reset`, CONSOLE_GROUP_STYLE);

        this.stopAllNonColorAnimations();
        this.stopCurrentColorAnimations();

        this.colorPalette = [...this.DEFAULT_PALETTE];
        this.setPan(this.DEFAULT_PAN[0], this.DEFAULT_PAN[1]);
        this.zoom = this.DEFAULT_ZOOM;
        this.rotation = this.DEFAULT_ROTATION;
        this.extraIterations = 0;
        this.currentPresetIndex = 0;

        this.resizeCanvas();

        this.markOrbitDirty();
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

        return [rotatedX * this.zoom + this.pan[0], rotatedY * this.zoom + this.pan[1]];
    }

    /**
     * Convert a screen point to the rotated, aspect-corrected "view vector" (no pan/zoom applied).
     * This is exactly what your shader calls `rotated`.
     *
     * @param {number} screenX CSS pixels relative to canvas (like your handlers use)
     * @param {number} screenY CSS pixels relative to canvas
     * @returns {number[]} view-space rotated vector
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

        return [cosR * stX - sinR * stY, sinR * stX + cosR * stY];
    }

    /**
     * Compute CSS-space center of the canvas (for default anchored zoom).
     * @returns {number[]}
     */
    getCanvasCssCenter() {
        const rect = this.canvas.getBoundingClientRect();
        return [rect.width / 2, rect.height / 2];
    }

    // endregion--------------------------------------------------------------------------------------------------------
    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

    /** Stops all currently running animations that are not a color transition */
    stopAllNonColorAnimations() {
        console.log(`%c ${this.constructor.name}: %c stopAllNonColorAnimations`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        this.stopCurrentPanAnimation();
        this.stopCurrentZoomAnimation();
        this.stopCurrentRotationAnimation();
    }

    /** Stops currently running pan animation */
    stopCurrentPanAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentPanAnimation`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.currentPanAnimationFrame !== null) {
            cancelAnimationFrame(this.currentPanAnimationFrame);
            this.currentPanAnimationFrame = null;
        }
    }

    /** Stops currently running zoom animation */
    stopCurrentZoomAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentZoomAnimation`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.currentZoomAnimationFrame !== null) {
            cancelAnimationFrame(this.currentZoomAnimationFrame);
            this.currentZoomAnimationFrame = null;
        }
    }

    /** Stops currently running rotation animation */
    stopCurrentRotationAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentRotationAnimation`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.currentRotationAnimationFrame !== null) {
            cancelAnimationFrame(this.currentRotationAnimationFrame);
            this.currentRotationAnimationFrame = null;
        }
    }

    /** Stops currently running color animation */
    stopCurrentColorAnimations() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentColorAnimation`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.currentColorAnimationFrame !== null) {
            cancelAnimationFrame(this.currentColorAnimationFrame);
            this.currentColorAnimationFrame = null;
        }
    }

    /** Stops current demo and resets demo variables */
    stopDemo() {
        console.log(`%c ${this.constructor.name}: %c stopDemo`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
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
        console.groupCollapsed(`%c ${this.constructor.name}: animateColorPaletteTransition`, CONSOLE_GROUP_STYLE);
        this.stopCurrentColorAnimations();

        if (comparePalettes(this.colorPalette, newPalette)) {
            console.warn(`Identical palette found. Skipping.`);
            return;
        }
        console.log(`Animating to ${newPalette}.`);

        const startPalette = [...this.colorPalette];

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                this.colorPalette = [
                    lerp(startPalette[0], newPalette[0], progress),
                    lerp(startPalette[1], newPalette[1], progress),
                    lerp(startPalette[2], newPalette[2], progress),
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
        console.log(`%c ${this.constructor.name}: animateFullColorSpaceCycle`, CONSOLE_GROUP_STYLE);
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
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanTo`, CONSOLE_GROUP_STYLE);
        this.stopCurrentPanAnimation();

        this.markOrbitDirty();

        if (compareComplex(this.pan, targetPan, 6)) {
            console.log(`Already at the target pan. Skipping.`);
            console.groupEnd();
            return;
        }
        console.log(`Panning to ${targetPan}.`);

        const startPan = [...this.pan];

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const t = Math.min((timestamp - startTime) / duration, 1);

                const k = easeFunction(t);

                const nx = lerp(startPan[0], targetPan[0], k);
                const ny = lerp(startPan[1], targetPan[1], k);
                this.setPan(nx, ny);

                this.draw();
                updateInfo(true);

                if (t < 1) {
                    this.currentPanAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.markOrbitDirty();
                    this.draw();
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
     * Animates pan by a delta (DD-stable). Unlike animatePanTo, this avoids computing
     * targetPan = startPan + delta in a single float64 operation (which breaks in deep zoom).
     *
     * This method applies incremental DD pan updates based on animation progress.
     *
     * @param {COMPLEX} deltaPan
     * @param [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise}
     */
    async animatePanBy(deltaPan, duration = 200, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanBy`, CONSOLE_GROUP_STYLE);
        this.stopCurrentPanAnimation();

        this.markOrbitDirty();

        if (Math.abs(deltaPan[0]) < 1e-30 && Math.abs(deltaPan[1]) < 1e-30) {
            console.log(`Zero delta pan. Skipping.`);
            console.groupEnd();
            return;
        }

        console.log(`Panning by ${deltaPan}.`);

        await new Promise((resolve) => {
            let startTime = null;
            let prevK = 0;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;

                const t = Math.min((timestamp - startTime) / duration, 1);
                const k = easeFunction(t);

                const dk = k - prevK;
                prevK = k;

                if (dk !== 0) {
                    this.addPan(deltaPan[0] * dk, deltaPan[1] * dk);
                }

                this.draw();
                updateInfo(true);

                if (t < 1) {
                    this.currentPanAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.markOrbitDirty();
                    this.draw();
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
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoomTo`, CONSOLE_GROUP_STYLE);
        this.stopCurrentZoomAnimation();

        if (this.zoom.toFixed(20) === targetZoom.toFixed(20)) {
            console.log(`Already at the target zoom. Skipping.`);
            console.groupEnd();
            return;
        }

        // Default anchor = canvas center (CSS)
        if (anchorX === null || anchorY === null) {
            const [cx, cy] = this.getCanvasCssCenter();
            anchorX = cx;
            anchorY = cy;
        }

        const startZoom = this.zoom;
        const ratio = targetZoom / startZoom;

        // Compute anchor once. During zoom animation, rotation is constant, so view-vector stays valid.
        const [vx, vy] = this.screenToViewVector(anchorX, anchorY);
        const fxAnchor = vx * startZoom + this.pan[0];
        const fyAnchor = vy * startZoom + this.pan[1];

        // orbit boundary policy hook (safe no-op for non-perturbation renderers)
        this.markOrbitDirty();

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;

                const t = Math.min((timestamp - startTime) / duration, 1);

                if (easeFunction !== EASE_TYPE.NONE) {
                    const k = easeFunction(t);
                    this.zoom = startZoom + (targetZoom - startZoom) * k;
                } else {
                    this.zoom = startZoom * Math.pow(ratio, t);
                }

                // Recompute pan from the fixed anchor point (stable in deep zoom)
                this.setPanFromAnchor(fxAnchor, fyAnchor, vx, vy);

                this.markOrbitDirty();
                this.draw();
                updateInfo(true);

                if (t < 1) {
                    this.currentZoomAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.markOrbitDirty();
                    this.draw();
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
     * Animates zoom from current value to target zoom without adjusting pan position.
     * Unlike animateZoomTo, this method does not keep any anchor point fixed during zooming.
     * The fractal will appear to zoom in/out from its current center position.
     *
     * @param {number} targetZoom - The target zoom level to animate to
     * @param {number} [duration=500] - Duration of the animation in milliseconds
     * @param {EASE_TYPE|Function} [easeFunction=EASE_TYPE.NONE] - Easing function to apply; EASE_TYPE.NONE uses exponential interpolation
     * @returns {Promise<void>} Promise that resolves when the animation completes
     */
    async animateZoomToNoPan(targetZoom, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoomToNoPan`, CONSOLE_GROUP_STYLE);

        this.stopCurrentZoomAnimation();

        this.markOrbitDirty();

        if (this.zoom.toFixed(12) === targetZoom.toFixed(12)) return;

        const startZoom = this.zoom;

        await new Promise((resolve) => {
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
                    this.markOrbitDirty();
                    this.draw();
                    this.stopCurrentZoomAnimation();
                    this.onAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentZoomAnimationFrame = requestAnimationFrame(step);
        });
    }

    async animateRotationTo(targetRotation, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateRotationTo`, CONSOLE_GROUP_STYLE);
        this.stopCurrentRotationAnimation();

        targetRotation = normalizeRotation(targetRotation);

        if (this.rotation.toFixed(6) === targetRotation.toFixed(6)) {
            console.log(`Already at the target rotation "${targetRotation}". Skipping.`);
            console.groupEnd();
            return;
        }
        console.log(`Rotating from ${this.rotation.toFixed(6)} to ${targetRotation.toFixed(6)}.`);

        const startRotation = this.rotation;

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const t = Math.min((timestamp - startTime) / duration, 1);

                const k = easeFunction(t);

                this.rotation = lerp(startRotation, targetRotation, k);
                this.draw();
                updateInfo(true);

                if (t < 1) {
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
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanThenZoomTo`, CONSOLE_GROUP_STYLE);

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
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanAndZoomTo`, CONSOLE_GROUP_STYLE);

        await Promise.all([
            this.animatePanTo(targetPan, duration, easeFunction),
            this.animateZoomToNoPan(targetZoom, duration, easeFunction),
        ]);

        console.groupEnd();
    }

    async animateZoomRotationTo(targetZoom, targetRotation, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZoomRotationTo`, CONSOLE_GROUP_STYLE);

        await Promise.all([
            this.animateZoomTo(targetZoom, duration, easeFunction),
            this.animateRotationTo(targetRotation, duration, EASE_TYPE.CUBIC)
        ]);

        console.groupEnd();
    }

    async animatePanZoomRotationTo(targetPan, targetZoom, targetRotation, duration = 500, easeFunction = EASE_TYPE.NONE) {
        console.groupCollapsed(`%c ${this.constructor.name}: animatePanZoomRotationTo`, CONSOLE_GROUP_STYLE);

        await Promise.all([
            this.animatePanTo(targetPan, duration, easeFunction),
            this.animateZoomToNoPan(targetZoom, duration, easeFunction),
            this.animateRotationTo(targetRotation, duration, easeFunction)
        ]);

        console.groupEnd();
    }

    async animateInfiniteRotation(direction, step = 0.001) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateInfiniteRotation`, CONSOLE_GROUP_STYLE);
        this.stopCurrentRotationAnimation();

        const dir = direction >= 0 ? 1 : -1;

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

    // endregion--------------------------------------------------------------------------------------------------------
}

export default FractalRenderer;