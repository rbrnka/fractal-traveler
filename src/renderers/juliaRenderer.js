import {updateInfo} from "../ui/ui";
import FractalRenderer from "./fractalRenderer";
import {compareComplex, degToRad, hexToRGB, isTouchDevice, lerp, normalizeRotation, splitFloat,} from "../global/utils";
import "../global/types";
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, EASE_TYPE, JULIA_PALETTES,} from "../global/constants";
import {updateJuliaSliders} from "../ui/juliaSlidersController";
import fragmentShaderRaw from '../shaders/julia.frag';
import data from '../data/julia.json' with {type: 'json'};

/**
 * JuliaRenderer (Rebased Perturbation)
 *
 * @author Radim Brnka
 * @description This module defines a JuliaRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Julia set fractal, and sets preset zoom-ins.
 * Reference orbit is for current c and a chosen z0_ref (near the view center).
 * For each pixel:
 *   z0 = pan + zoom * rotated(st)
 *   dz0 = z0 - z0_ref
 *   dz_{n+1} = 2*zref*dz + dz^2 (NO +dc each step for Julia!)
 * @extends FractalRenderer
 * @see MandelbrotRenderer
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */
export class JuliaRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.LEGACY_JULIA_RENDER = true;

        this.DEFAULT_ZOOM = data.presets[0].zoom;
        this.MAX_ZOOM = 1e-17;
        this.zoom = this.DEFAULT_ZOOM;

        this.DEFAULT_ROTATION = data.presets[0].rotation;
        this.rotation = this.DEFAULT_ROTATION;

        // TODO Use less detailed initial set for less performant devices
        /** @type COMPLEX */
        this.DEFAULT_C = [data.presets[0].c[0], data.presets[0].c[1]];
        /** @type COMPLEX */
        this.c = [...this.DEFAULT_C];

        // IMPORTANT: use setPan (syncs DD + array) – keep this.pan canonical (TODO remove pan completely at some point)
        this.setPan(this.DEFAULT_PAN[0], this.DEFAULT_PAN[1]);

        this.colorPalette = [...this.DEFAULT_PALETTE];

        // --- Perturbation state ---
        this.refZ0 = [0, 0];
        this.refPan = [...this.DEFAULT_PAN];
        this.orbitDirty = true;

        this._prevPan0 = NaN;
        this._prevPan1 = NaN;
        this._prevZoom = NaN;
        this._prevC0 = NaN;
        this._prevC1 = NaN;

        this.MAX_ITER = 2000;
        this.REF_SEARCH_GRID = 7;
        this.REF_SEARCH_RADIUS = 0.50;

        this.orbitTex = null;
        this.orbitData = null;
        this.floatTexExt = null;

        this.rebaseArmed = true;

        /** @type {Array.<JULIA_PRESET>} */
        this.PRESETS = data.presets.map(p => ({
            ...p,
            rotation: degToRad(p.rotation || 0)
        }));

        /** @type {Array.<DIVE>} */
        this.DIVES = data.dives.map(d => ({
            ...d,
            rotation: degToRad(d.rotation || 0)
        }));

        this.currentPaletteIndex = 0;
        this.innerStops = new Float32Array(JULIA_PALETTES[this.currentPaletteIndex].theme);

        this.currentCAnimationFrame = null;
        this.demoTime = 0;

        this.init();
    }

    markOrbitDirty = () => this.orbitDirty = true;

    onProgramCreated() {
        this.floatTexExt = this.gl.getExtension("OES_texture_float");
        if (!this.floatTexExt) {
            console.error("Missing OES_texture_float. Julia deep zoom perturbation requires it.");
            return;
        }

        this.orbitTex = this.gl.createTexture();
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.orbitTex);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.orbitData = new Float32Array(this.MAX_ITER * 4);

        if (this.orbitTexLoc) this.gl.uniform1i(this.orbitTexLoc, 0);
        if (this.orbitWLoc) this.gl.uniform1f(this.orbitWLoc, this.MAX_ITER);

        this.orbitDirty = true;
    }

    createFragmentShaderSource = () => fragmentShaderRaw.replace('__MAX_ITER__', this.MAX_ITER);

    /**
     * @inheritDoc
     * @override
     */
    updateUniforms() {
        super.updateUniforms();

        this.cLoc = this.gl.getUniformLocation(this.program, "u_c");
        this.innerStopsLoc = this.gl.getUniformLocation(this.program, "u_innerStops");

        this.panHLoc = this.gl.getUniformLocation(this.program, "u_pan_h");
        this.panLLoc = this.gl.getUniformLocation(this.program, "u_pan_l");
        this.zoomHLoc = this.gl.getUniformLocation(this.program, "u_zoom_h");
        this.zoomLLoc = this.gl.getUniformLocation(this.program, "u_zoom_l");
        this.refZ0HLoc = this.gl.getUniformLocation(this.program, "u_ref_z0_h");
        this.refZ0LLoc = this.gl.getUniformLocation(this.program, "u_ref_z0_l");

        this.orbitTexLoc = this.gl.getUniformLocation(this.program, "u_orbitTex");
        this.orbitWLoc = this.gl.getUniformLocation(this.program, "u_orbitW");
    }

    // --- Reference orbit building ---

    escapeItersJulia(zx0, zy0, iters) {
        let zx = zx0, zy = zy0;
        const cx = this.c[0], cy = this.c[1];
        for (let i = 0; i < iters; i++) {
            const zx2 = zx * zx - zy * zy + cx;
            const zy2 = 2.0 * zx * zy + cy;
            zx = zx2; zy = zy2;
            if (zx * zx + zy * zy > 4.0) return i;
        }
        return iters;
    }

    /**
     * Choose a good refZ0 near view center:
     * - sample a grid around view center (radius scales with zoom)
     * - pick the point with the highest escape iteration (prefer inside / late escape)
     * - prefer keeping the current reference to avoid jitter unless a significantly better one is found
     * @param {boolean} useViewCenter - If true, skip grid search and use view center directly (for stability during interaction)
     */
    pickReferenceNearViewCenter(useViewCenter = false) {
        // During interaction, use view center directly to prevent jitter from grid search
        if (useViewCenter) {
            this.refZ0[0] = this.pan[0];
            this.refZ0[1] = this.pan[1];
            // Keep refPan in sync for needsRebase() to work correctly
            this.refPan[0] = this.pan[0];
            this.refPan[1] = this.pan[1];
            return;
        }

        const grid = this.REF_SEARCH_GRID;
        const half = (grid - 1) / 2;
        const step = (2.0 * this.REF_SEARCH_RADIUS) / (grid - 1);

        const base = this.zoom;
        const probeIters = Math.min(this.MAX_ITER, Math.max(200, Math.floor(this.iterations)));

        // Evaluate current reference point's score (if we have one within reasonable distance)
        let currentRefScore = -1;
        const currentRefDist = Math.hypot(this.refZ0[0] - this.pan[0], this.refZ0[1] - this.pan[1]);
        const maxRefDist = base * this.REF_SEARCH_RADIUS * 2.5; // Allow some margin beyond search radius

        if (currentRefDist < maxRefDist) {
            currentRefScore = this.escapeItersJulia(this.refZ0[0], this.refZ0[1], probeIters);
        }

        // Start with view center as fallback
        let bestX = this.pan[0];
        let bestY = this.pan[1];
        let bestScore = this.escapeItersJulia(this.pan[0], this.pan[1], probeIters);

        for (let j = 0; j < grid; j++) {
            for (let i = 0; i < grid; i++) {
                const ox = (i - half) * step;
                const oy = (j - half) * step;

                const zx0 = this.pan[0] + ox * base;
                const zy0 = this.pan[1] + oy * base;

                const score = this.escapeItersJulia(zx0, zy0, probeIters);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = zx0;
                    bestY = zy0;
                }
            }
        }

        // Stability: only switch reference if the new one is significantly better.
        // This prevents jitter from small score differences between frames.
        // Require at least 10% improvement or 50 iterations better to switch.
        const improvementThreshold = Math.max(currentRefScore * 0.10, 50);
        const shouldSwitch = currentRefScore < 0 || (bestScore - currentRefScore) > improvementThreshold;

        if (shouldSwitch) {
            this.refZ0[0] = bestX;
            this.refZ0[1] = bestY;
            // Keep refPan in sync for needsRebase() to work correctly
            this.refPan[0] = bestX;
            this.refPan[1] = bestY;
        }
        // else: keep current refZ0 for stability
    }

    computeReferenceOrbit() {
        if (!this.orbitData || !this.orbitTex) return;

        const cx = this.c[0];
        const cy = this.c[1];

        let zx = this.refZ0[0];
        let zy = this.refZ0[1];

        for (let n = 0; n < this.MAX_ITER; n++) {
            const sx = splitFloat(zx);
            const sy = splitFloat(zy);

            const idx = n * 4;
            this.orbitData[idx] = sx.high;
            this.orbitData[idx + 1] = sx.low;
            this.orbitData[idx + 2] = sy.high;
            this.orbitData[idx + 3] = sy.low;

            const zx2 = zx * zx - zy * zy + cx;
            const zy2 = 2.0 * zx * zy + cy;
            zx = zx2; zy = zy2;

            if (zx * zx + zy * zy > 4.0) {
                const fx = splitFloat(zx);
                const fy = splitFloat(zy);
                for (let k = n + 1; k < this.MAX_ITER; k++) {
                    const j = k * 4;
                    this.orbitData[j] = fx.high;
                    this.orbitData[j + 1] = fx.low;
                    this.orbitData[j + 2] = fy.high;
                    this.orbitData[j + 3] = fy.low;
                }
                break;
            }
        }

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.orbitTex);

        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.MAX_ITER,
            1,
            0,
            this.gl.RGBA,
            this.gl.FLOAT,
            this.orbitData
        );

        if (this.orbitTexLoc) this.gl.uniform1i(this.orbitTexLoc, 0);
        if (this.orbitWLoc) this.gl.uniform1f(this.orbitWLoc, this.MAX_ITER);
    }

    /**
     * Julia "needsRebase": keep reference initial condition close to view center.
     * Same intent as Mandelbrot, but for z0 reference.
     */
    needsRebase() {
        const REBASE_ON = 1.75;
        const REBASE_OFF = 0.90;

        if (this.rebaseArmed === undefined) this.rebaseArmed = true;

        if (!this.refPan) return true;
        if (!Number.isFinite(this.zoom)) return false;

        const z = Math.max(this.zoom, 1e-300);

        const dx = this.pan[0] - this.refPan[0];
        const dy = this.pan[1] - this.refPan[1];
        const deltaView = Math.hypot(dx, dy) / z;

        if (!this.rebaseArmed && deltaView < REBASE_OFF) {
            this.rebaseArmed = true;
            return false;
        }

        if (this.rebaseArmed && deltaView > REBASE_ON) {
            this.rebaseArmed = false;
            return true;
        }

        return false;
    }

    draw() {
        this.gl.useProgram(this.program);

        // Iteration strategy avoids exploding to infinity at tiny zooms
        const safe = Math.max(this.zoom, 1e-300);
        const baseIters = Math.floor(200 + 50 * Math.log10(this.DEFAULT_ZOOM / safe));
        this.iterations = Math.max(50, Math.min(this.MAX_ITER, baseIters + this.extraIterations));

        // Detect view changes -> mark orbit dirty (use tolerant checks to avoid noise)
        const panMoved =
            Number.isFinite(this._prevPan0) && Number.isFinite(this._prevPan1)
                ? (Math.abs(this.pan[0] - this._prevPan0) + Math.abs(this.pan[1] - this._prevPan1)) > (this.zoom * 1e-6)
                : true;

        const zoomChanged =
            Number.isFinite(this._prevZoom)
                ? Math.abs(this.zoom - this._prevZoom) > (this.zoom * 1e-8)
                : true;

        const cChanged =
            Number.isFinite(this._prevC0) && Number.isFinite(this._prevC1)
                ? (Math.abs(this.c[0] - this._prevC0) + Math.abs(this.c[1] - this._prevC1)) > 0.0
                : true;

        if (panMoved || zoomChanged || cChanged) {
            this.orbitDirty = true;
            this._prevPan0 = this.pan[0];
            this._prevPan1 = this.pan[1];
            this._prevZoom = this.zoom;
            this._prevC0 = this.c[0];
            this._prevC1 = this.c[1];
        }

        // Rebase policy (same intent as Mandelbrot):
        // - avoid rebuilding orbit every frame during interaction (prevents swim/jitter)
        // - but if c changes, we must rebuild for correctness
        const mustRebaseNow = cChanged || this.needsRebase();
        const canRebaseNow = !this.interactionActive || mustRebaseNow;

        if (this.orbitDirty && canRebaseNow) {
            // During interaction, use view center directly to prevent jitter
            this.pickReferenceNearViewCenter(this.interactionActive);
            this.computeReferenceOrbit();
            this.orbitDirty = false;
        }

        // Upload pan hi/lo
        const px = splitFloat(this.pan[0]);
        const py = splitFloat(this.pan[1]);
        if (this.panHLoc) this.gl.uniform2f(this.panHLoc, px.high, py.high);
        if (this.panLLoc) this.gl.uniform2f(this.panLLoc, px.low, py.low);

        // Upload zoom hi/lo
        const z = splitFloat(this.zoom);
        if (this.zoomHLoc) this.gl.uniform1f(this.zoomHLoc, z.high);
        if (this.zoomLLoc) this.gl.uniform1f(this.zoomLLoc, z.low);

        // Upload ref z0 hi/lo
        const rx = splitFloat(this.refZ0[0]);
        const ry = splitFloat(this.refZ0[1]);
        if (this.refZ0HLoc) this.gl.uniform2f(this.refZ0HLoc, rx.high, ry.high);
        if (this.refZ0LLoc) this.gl.uniform2f(this.refZ0LLoc, rx.low, ry.low);

        if (this.cLoc) this.gl.uniform2fv(this.cLoc, this.c);
        if (this.innerStopsLoc) this.gl.uniform3fv(this.innerStopsLoc, this.innerStops);

        super.draw();
    }

    /**
     * @inheritDoc
     * @override
     */
    reset() {
        this.c = [...this.DEFAULT_C];
        this.innerStops = new Float32Array(JULIA_PALETTES[0].theme);
        this.currentPaletteIndex = 0;

        this.orbitDirty = true;
        this._prevPan0 = NaN;
        this._prevPan1 = NaN;
        this._prevZoom = NaN;
        this._prevC0 = NaN;
        this._prevC1 = NaN;

        super.reset();
    }

    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

    /** Stops currently running pan animation */
    stopCurrentCAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentCAnimation`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.currentCAnimationFrame !== null) {
            cancelAnimationFrame(this.currentCAnimationFrame);
            this.currentCAnimationFrame = null;
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    stopAllNonColorAnimations() {
        this.stopCurrentCAnimation();

        super.stopAllNonColorAnimations();
    }

    /**
     * Returns id/title of the next color theme in the themes array.
     * @return {string}
     */
    getNextColorThemeId() {
        const nextTheme = JULIA_PALETTES[(this.currentPaletteIndex + 1) % JULIA_PALETTES.length];

        return nextTheme.id || 'Random';
    }

    /**
     * Smoothly transitions the inner color stops (used by the shader for inner coloring)
     * from the current value to the provided toPalette over the specified duration.
     * Also updates the colorPalette to match the theme (using the first stop, for example).
     *
     * @param {JULIA_PALETTE} toPalette - The target theme as an array of numbers (e.g., 15 numbers for 5 stops).
     * @param {number} [duration=250] - Duration of the transition in milliseconds.
     * @param {Function} [callback] - A callback invoked when the transition completes.
     * @return {Promise<void>}
     */
    async animateInnerStopsTransition(toPalette, duration = 250, callback = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateInnerStopsTransition`, CONSOLE_GROUP_STYLE);
        this.stopCurrentColorAnimations();

        // Save the starting stops as a plain array.
        const startStops = Array.from(this.innerStops);

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Interpolate each component of the inner stops.
                const interpolated = startStops.map((v, i) => lerp(v, toPalette.theme[i], progress));
                this.innerStops = new Float32Array(interpolated);

                let keyColor;

                if (toPalette.keyColor) {
                    keyColor = hexToRGB(toPalette.keyColor);
                    if (keyColor) this.colorPalette = [keyColor.r, keyColor.g, keyColor.b];
                }

                if (!keyColor) {
                    const stopIndex = 3;
                    this.colorPalette = [
                        toPalette.theme[stopIndex * 3] * 1.5,
                        toPalette.theme[stopIndex * 3 + 1] * 1.5,
                        toPalette.theme[stopIndex * 3 + 2] * 1.5
                    ];
                }

                this.draw();

                if (callback) callback();

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

    /** @inheritDoc */
    async animateColorPaletteTransition(duration = 250, coloringCallback = null) {
        this.currentPaletteIndex = (this.currentPaletteIndex + 1) % JULIA_PALETTES.length;

        await this.animateInnerStopsTransition(JULIA_PALETTES[this.currentPaletteIndex], duration, coloringCallback);
    }

    /** @inheritDoc */
    async animateFullColorSpaceCycle(duration = 15000, coloringCallback = null) {
        await new Promise(() => {
            this.animateColorPaletteTransition(duration, coloringCallback);
        });
    }

    /**
     * Animates Julia from current C to target C
     *
     * @param {COMPLEX} [targetC] Defaults to default C
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animateToC(targetC = [...this.DEFAULT_C], duration = 500, easeFunction = EASE_TYPE.QUINT) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateToC`, CONSOLE_GROUP_STYLE);
        this.stopCurrentCAnimation();

        if (compareComplex(this.c, targetC)) {
            console.log(`Already at the target c. Skipping.`);
            console.groupEnd();
            return;
        }

        console.log(`Animating c from ${this.c} to ${targetC}.`);

        const startC = [...this.c];

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Interpolate `c` smoothly
                const easedProgress = easeFunction(progress);
                this.c[0] = lerp(startC[0], targetC[0], easedProgress);
                this.c[1] = lerp(startC[1], targetC[1], easedProgress);

                // c changes require orbit rebuild for correctness (but keep same gating in draw()).
                this.markOrbitDirty();

                this.draw();

                updateInfo(true);
                updateJuliaSliders();

                if (progress < 1) {
                    this.currentCAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentCAnimation();
                    this.onAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentCAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates Julia from current C and zoom to target C and zoom
     *
     * @param {number} [targetZoom] Target zoom
     * @param {COMPLEX} [targetC] Defaults to default C
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animateToZoomAndC(targetZoom, targetC = [...this.DEFAULT_C], duration = 500, easeFunction = EASE_TYPE.QUINT) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateToZoomAndC`, CONSOLE_GROUP_STYLE);
        this.stopCurrentCAnimation();

        await Promise.all([
            this.animateZoomTo(targetZoom, duration, easeFunction),
            this.animateToC(targetC, duration, easeFunction)
        ]);
        console.groupEnd();
    }

    /**
     * Animates travel to a preset.
     * @param {JULIA_PRESET} preset
     * @param {number} [duration] in ms
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, duration = 500) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, CONSOLE_GROUP_STYLE);
        this.stopAllNonColorAnimations();

        // Phase 1: Setting default params.
        await this.animatePanAndZoomTo(this.DEFAULT_PAN, this.DEFAULT_ZOOM, 1000);

        // Phase 2: Animating to preset.
        await Promise.all([
            this.animateZoomTo(preset.zoom, duration, EASE_TYPE.QUINT),
            this.animateToC(preset.c, duration),
            this.animateRotationTo(preset.rotation, duration, EASE_TYPE.QUINT),
            this.animatePanTo(preset.pan, duration, EASE_TYPE.QUINT)
        ]);

        this.currentPresetIndex = preset.id || 0;

        console.groupEnd();
    }

    /**
     * Infinite animation of the dive (c-param interpolations)
     * @param {DIVE} dive
     * @return {Promise<void>}
     */
    async animateDive(dive) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDive`, CONSOLE_GROUP_STYLE);
        this.stopCurrentCAnimation();

        console.log(`Diving to ${dive}.`);

        // Return a Promise that never resolves (continuous animation)
        await new Promise(() => {
            // Ensure phases are defined
            dive.phases ||= [1, 2, 3, 4];
            let phase = dive.phases[0];

            const diveStep = () => {
                const step = dive.step;
                // Phase 1: Animate cx (real part) toward endC[0]
                if (phase === 1) {
                    this.c[0] += dive.cxDirection * step;
                    if ((dive.cxDirection < 0 && this.c[0] <= dive.endC[0]) || (dive.cxDirection > 0 && this.c[0] >= dive.endC[0])) {
                        this.c[0] = dive.endC[0];
                        phase = 2;
                    }
                }
                // Phase 2: Animate cy (imaginary part) toward endC[1]
                else if (phase === 2) {
                    this.c[1] += dive.cyDirection * step;
                    if ((dive.cyDirection < 0 && this.c[1] <= dive.endC[1]) || (dive.cyDirection > 0 && this.c[1] >= dive.endC[1])) {
                        this.c[1] = dive.endC[1];
                        phase = 3;
                    }
                }
                // Phase 3: Animate cx back toward startC[0]
                else if (phase === 3) {
                    this.c[0] -= dive.cxDirection * step;
                    if ((dive.cxDirection < 0 && this.c[0] >= dive.startC[0]) || (dive.cxDirection > 0 && this.c[0] <= dive.startC[0])) {
                        this.c[0] = dive.startC[0];
                        phase = 4;
                    }
                }
                // Phase 4: Animate cy back toward startC[1]
                else if (phase === 4) {
                    this.c[1] -= dive.cyDirection * step;
                    if ((dive.cyDirection < 0 && this.c[1] >= dive.startC[1]) || (dive.cyDirection > 0 && this.c[1] <= dive.startC[1])) {
                        this.c[1] = dive.startC[1];
                        phase = 1; // Loop back to start phase.
                    }
                }

                this.markOrbitDirty();

                this.draw();
                updateInfo(true);
                updateJuliaSliders();

                this.currentCAnimationFrame = requestAnimationFrame(diveStep);
            };
            this.currentCAnimationFrame = requestAnimationFrame(diveStep);
        });
    }

    /**
     * Animates infinite demo loop with oscillating c between predefined values
     * @return {Promise<void>}
     */
    async animateDemo() {
        console.log(`%c ${this.constructor.name}: animateDemo`, CONSOLE_GROUP_STYLE);
        this.stopAllNonColorAnimations();

        this.demoActive = true; // Not used in Julia but the demo is active

        // Return a Promise that never resolves (continuous animation)
        await new Promise(() => {
            const step = () => {
                this.c = [
                    ((Math.sin(this.demoTime) + 1) / 2) * 1.5 - 1,   // Oscillates between -1 and 0.5
                    ((Math.cos(this.demoTime) + 1) / 2) * 1.4 - 0.7  // Oscillates between -0.7 and 0.7
                ];
                this.rotation = normalizeRotation(this.rotation - 0.001);
                this.demoTime += 0.0005; // Speed

                this.markOrbitDirty();

                this.draw();
                updateInfo(true);
                updateJuliaSliders();

                this.currentCAnimationFrame = requestAnimationFrame(step);
            };
            this.currentCAnimationFrame = requestAnimationFrame(step);
        });
    }

    // endregion--------------------------------------------------------------------------------------------------------
}