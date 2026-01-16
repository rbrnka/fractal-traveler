import FractalRenderer from "./fractalRenderer";
import {asyncDelay, compareComplex, hsbToRgb, normalizeRotation, splitFloat} from "../global/utils";
import {CONSOLE_GROUP_STYLE, EASE_TYPE, log, PI} from "../global/constants";
import presetsData from '../data/mandelbrot.json' with {type: 'json'};
/** @type {string} */
import fragmentShaderRaw from '../shaders/mandelbrot.frag';

/**
 * MandelbrotRenderer (Rebased Perturbation)
 *
 * @author Radim Brnka
 * @description This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.
 * @extends FractalRenderer
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */
class MandelbrotRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_PAN = [-0.5, 0];
        this.setPan(this.DEFAULT_PAN[0], this.DEFAULT_PAN[1]); // sync DD + array

        // Reference state
        this.refPan = [...this.DEFAULT_PAN];
        this.orbitDirty = true;

        /** IMPORTANT: MAX_ITER must remain constant after shader compilation + orbit buffer allocation. */
        this.MAX_ITER = 2000;

        // Reference search parameters (for perturbation rebasing)
        this.REF_SEARCH_GRID = 7;
        this.REF_SEARCH_RADIUS = 0.50;

        // Hysteresis state for rebasing
        this.rebaseArmed = true;

        // WebGL resources
        this.orbitTex = null;
        this.orbitData = null;
        this.floatTexExt = null;

        /** Mandelbrot-specific presets */
        this.PRESETS = presetsData.presets;

        this.init();
    }

    markOrbitDirty = () => this.orbitDirty = true;

    /**
     * Called by FractalRenderer.initGLProgram() after program creation + common uniform cache.
     * Creates float texture, allocates orbit buffer, and binds texture unit.
     */
    onProgramCreated() {
        this.floatTexExt = this.gl.getExtension("OES_texture_float");
        if (!this.floatTexExt) {
            console.error('Missing OES_texture_float. Perturbation orbit texture upload requires it.');
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

        // Shader expects orbit sampler in unit 0
        if (this.orbitTexLoc) this.gl.uniform1i(this.orbitTexLoc, 0);
        if (this.orbitWLoc) this.gl.uniform1f(this.orbitWLoc, this.MAX_ITER);

        this.orbitDirty = true;
    }

    createFragmentShaderSource = () => fragmentShaderRaw.replace('__MAX_ITER__', this.MAX_ITER);

    updateUniforms() {
        super.updateUniforms();

        // view pan hi/lo
        this.viewPanHLoc = this.gl.getUniformLocation(this.program, 'u_view_pan_h');
        this.viewPanLLoc = this.gl.getUniformLocation(this.program, 'u_view_pan_l');

        // ref pan hi/lo
        this.refPanHLoc = this.gl.getUniformLocation(this.program, 'u_ref_pan_h');
        this.refPanLLoc = this.gl.getUniformLocation(this.program, 'u_ref_pan_l');

        // zoom hi/lo
        this.zoomHLoc = this.gl.getUniformLocation(this.program, 'u_zoom_h');
        this.zoomLLoc = this.gl.getUniformLocation(this.program, 'u_zoom_l');

        // orbit texture uniforms
        this.orbitTexLoc = this.gl.getUniformLocation(this.program, 'u_orbitTex');
        this.orbitWLoc = this.gl.getUniformLocation(this.program, 'u_orbitW');
    }

    /** Reference picking + orbit build */
    escapeItersDouble(cx, cy, iters) {
        let zx = 0.0, zy = 0.0;
        for (let i = 0; i < iters; i++) {
            const zx2 = zx * zx - zy * zy + cx;
            const zy2 = 2.0 * zx * zy + cy;
            zx = zx2;
            zy = zy2;
            if (zx * zx + zy * zy > 4.0) return i;
        }
        return iters;
    }

    /**
     * Choose a good refPan near view center:
     * - sample a grid around view center (radius scales with zoom)
     * - pick the point with the highest escape iteration (prefer inside / late escape)
     * - prefer keeping the current reference to avoid jitter unless a significantly better one is found
     * @param {boolean} useViewCenter - If true, skip grid search and use view center directly (for stability during interaction)
     */
    pickReferenceNearViewCenter(useViewCenter = false) {
        // During interaction, use view center directly to prevent jitter from grid search
        if (useViewCenter) {
            this.refPan[0] = this.pan[0];
            this.refPan[1] = this.pan[1];
            return;
        }

        const grid = this.REF_SEARCH_GRID;
        const half = (grid - 1) / 2;
        const step = (2.0 * this.REF_SEARCH_RADIUS) / (grid - 1);

        const base = this.zoom; // scale offsets by current zoom

        const probeIters = Math.min(this.MAX_ITER, Math.max(200, Math.floor(this.iterations)));

        // Evaluate current reference point's score (if we have one within reasonable distance)
        let currentRefScore = -1;
        const currentRefDist = Math.hypot(this.refPan[0] - this.pan[0], this.refPan[1] - this.pan[1]);
        const maxRefDist = base * this.REF_SEARCH_RADIUS * 2.5; // Allow some margin beyond search radius

        if (currentRefDist < maxRefDist) {
            currentRefScore = this.escapeItersDouble(this.refPan[0], this.refPan[1], probeIters);
        }

        // Start with view center as fallback
        let bestCx = this.pan[0];
        let bestCy = this.pan[1];
        let bestScore = this.escapeItersDouble(this.pan[0], this.pan[1], probeIters);

        for (let j = 0; j < grid; j++) {
            for (let i = 0; i < grid; i++) {
                const ox = (i - half) * step;
                const oy = (j - half) * step;
                const cx = this.pan[0] + ox * base;
                const cy = this.pan[1] + oy * base;

                const score = this.escapeItersDouble(cx, cy, probeIters);
                if (score > bestScore) {
                    bestScore = score;
                    bestCx = cx;
                    bestCy = cy;
                }
            }
        }

        // Stability: only switch reference if the new one is significantly better.
        // This prevents jitter from small score differences between frames.
        // Require at least 10% improvement or 50 iterations better to switch.
        const improvementThreshold = Math.max(currentRefScore * 0.10, 50);
        const shouldSwitch = currentRefScore < 0 || (bestScore - currentRefScore) > improvementThreshold;

        if (shouldSwitch) {
            this.refPan[0] = bestCx;
            this.refPan[1] = bestCy;
        }
        // else: keep current refPan for stability

        this.bestScore = bestScore;
        this.probeIters = probeIters;
    }

    computeReferenceOrbit() {
        if (!this.orbitData || !this.orbitTex) return;

        const cx = this.refPan[0];
        const cy = this.refPan[1];

        let zx = 0.0, zy = 0.0;

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
            zx = zx2;
            zy = zy2;

            if (zx * zx + zy * zy > 4.0) {
                // Fill remainder with last value (keeps texture defined)
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

        // Upload 1D orbit texture: width=MAX_ITER, height=1
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
     * @inheritDoc
     * @override
     */
    draw() {
        this.gl.useProgram(this.program);

        // Iteration strategy avoids exploding to infinity at tiny zooms
        // TODO Tune! main point is: clamp to MAX_ITER.
        const safe = Math.max(this.zoom, 1e-300);
        const baseIters = Math.floor(200 + 50 * Math.log10(this.DEFAULT_ZOOM / safe));
        this.iterations = Math.max(50, Math.min(this.MAX_ITER, baseIters + this.extraIterations));

        const mustRebaseNow = this.needsRebase();
        const canRebaseNow = !this.interactionActive || mustRebaseNow;

        if (this.orbitDirty && canRebaseNow) {
            this.pickReferenceNearViewCenter();
            this.computeReferenceOrbit();
            this.orbitDirty = false;
        }

        // Upload viewPan hi/lo
        const vpx = splitFloat(this.pan[0]);
        const vpy = splitFloat(this.pan[1]);
        if (this.viewPanHLoc) this.gl.uniform2f(this.viewPanHLoc, vpx.high, vpy.high);
        if (this.viewPanLLoc) this.gl.uniform2f(this.viewPanLLoc, vpx.low, vpy.low);

        // Upload refPan hi/lo
        const rpx = splitFloat(this.refPan[0]);
        const rpy = splitFloat(this.refPan[1]);
        if (this.refPanHLoc) this.gl.uniform2f(this.refPanHLoc, rpx.high, rpy.high);
        if (this.refPanLLoc) this.gl.uniform2f(this.refPanLLoc, rpx.low, rpy.low);

        // Upload zoom hi/lo
        const z = splitFloat(this.zoom);
        if (this.zoomHLoc) this.gl.uniform1f(this.zoomHLoc, z.high);
        if (this.zoomLLoc) this.gl.uniform1f(this.zoomLLoc, z.low);

        super.draw();
    }

    needsRebase() {
        const dx = this.pan[0] - this.refPan[0];
        const dy = this.pan[1] - this.refPan[1];

        // Rebase threshold is proportional to zoom (view scale).
        // 0.75 is consistent with the Julia policy.
        return Math.hypot(dx, dy) > this.zoom * 0.75;
    }

    // region > ANIMATION METHODS

    async animateColorPaletteTransition(newPalette, duration = 250, coloringCallback = null) {
        const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

        // Robustly normalize whatever hsbToRgb returns:
        // - [r,g,b] or {r,g,b}
        // - either in 0..1 or 0..255
        const normalizeRgb = (c) => {
            let r, g, b;
            if (Array.isArray(c)) [r, g, b] = c;
            else ({r, g, b} = c);

            // If it looks like 0..255, normalize.
            if (r > 1 || g > 1 || b > 1) {
                r /= 255;
                g /= 255;
                b /= 255;
            }
            return [r, g, b];
        };

        // Generate a vivid hue in HSV, but output as a MULTIPLIER palette:
        // values intentionally > 1 to keep results bright after multiplication.
        const randomBrightMultiplierPalette = () => {
            const hue = Math.random();
            const sat = 0.85 + Math.random() * 0.15; // vivid
            const val = 0.90 + Math.random() * 0.10; // bright

            let [r, g, b] = normalizeRgb(hsbToRgb(hue, sat, val));

            // Avoid palettes that are effectively gray multipliers (kills vividness)
            const maxCh = Math.max(r, g, b);
            const minCh = Math.min(r, g, b);
            const chroma = maxCh - minCh;
            if (chroma < 0.25) {
                // force a more saturated hue by nudging channels
                r = clamp(r * 1.15, 0, 1);
                g = clamp(g * 1.15, 0, 1);
                b = clamp(b * 1.15, 0, 1);
            }

            // Convert 0..1 RGB into a "gain" (multiplier) palette.
            // Base gain keeps everything bright; color gain adds hue tint.
            const baseGain = 1.20 + Math.random() * 0.50; // 1.20..1.70
            const colorGain = 0.90 + Math.random() * 1.10; // 0.90..2.00

            // Lift darker channels so no channel is near-zero multiplier (avoids dim output).
            const lift = 0.25;

            return [
                baseGain + (lift + r * (1 - lift)) * colorGain,
                baseGain + (lift + g * (1 - lift)) * colorGain,
                baseGain + (lift + b * (1 - lift)) * colorGain,
            ];
        };

        newPalette ||= randomBrightMultiplierPalette();
        await super.animateColorPaletteTransition(newPalette, duration, coloringCallback);
    }

    /**
     * Animates travel to a preset. It first zooms out to the default zoom, then rotates, then animates pan and zoom-in.
     * If any of the final params is the same as the target, it won't animate it.
     *
     * @param {MANDELBROT_PRESET} preset An instance-specific object to define exact spot in the fractal
     * @param {number} [zoomOutDuration] in ms
     * @param {number} [zoomInDuration] in ms
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, zoomOutDuration = 1000, zoomInDuration = 3500) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, CONSOLE_GROUP_STYLE);
        log(`Traveling to preset: ${JSON.stringify(preset)}`);

        const targetRotation = preset.rotation || 0;

        if (preset.zoom.toFixed(24) === this.zoom.toFixed(24)) {
            await this.animatePanTo(preset.pan, zoomOutDuration);
        } else if (compareComplex(preset.pan, this.pan)) {
            // If only zoom is changed, adjust zoom-in
            // TODO zoom-out could be proportionally fast to the zoom depth. If zoomed in too much, the speed is too fast and the image does not render
            await this.animateZoomTo(preset.zoom, zoomOutDuration);
        } else {
            // Otherwise zoom-out
            await this.animateZoomTo(this.DEFAULT_ZOOM, zoomOutDuration);
        }

        await Promise.all([
            this.animatePanThenZoomTo(preset.pan, preset.zoom, 1000, zoomInDuration * (preset.speed ?? 1)),
            this.animateRotationTo(targetRotation, 1000, EASE_TYPE.QUINT),
        ]);

        this.currentPresetIndex = preset.id || 0;

        console.log(`Travel complete.`);
        console.groupEnd();
    }

    /**
     * Animate travel to a preset with random rotation. This method waits for three stages:
     *   1. Zoom-out to default zoom with rotation.
     *   2. Pan transition.
     *   3. Zoom-in with rotation.
     *
     * @param {MANDELBROT_PRESET} preset The target preset object with properties: pan, c, zoom, rotation.
     * @param {number} zoomOutDuration Duration (ms) for the zoom-out stage.
     * @param {number} panDuration Duration (ms) for the pan stage.
     * @param {number} zoomInDuration Duration (ms) for the zoom-in stage.
     */
    async animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPresetWithRandomRotation`, CONSOLE_GROUP_STYLE);

        // Random rotation during zoom-out for dynamic effect
        const zoomOutRotation = this.rotation + (Math.random() * PI * 2 - PI);
        const presetRotation = normalizeRotation(preset.rotation ?? this.DEFAULT_ROTATION);

        // Add 1-2 full cinematic rotations during zoom-in, ending at preset.rotation
        const extraSpins = (Math.random() > 0.5 ? 1 : -1) * (PI * 2 + Math.random() * PI * 2);
        const cinematicFinalRotation = presetRotation + extraSpins;

        if (this.rotation !== this.DEFAULT_ROTATION) {
            await this.animateZoomRotationTo(this.DEFAULT_ZOOM, zoomOutRotation, zoomOutDuration);
        }

        await this.animatePanTo(preset.pan, panDuration, EASE_TYPE.CUBIC);
        await this.animateZoomRotationTo(preset.zoom, cinematicFinalRotation, zoomInDuration * (preset.speed ?? 1));

        this.currentPresetIndex = preset.id || 0;

        console.groupEnd();
    }

    /**
     * Animates infinite demo loop of traveling to the presets
     * @param {boolean} random Determines whether presets are looped in order from 1-9 or ordered randomly
     * @return {Promise<void>}
     */
    async animateDemo(random = true) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDemo`, CONSOLE_GROUP_STYLE);
        this.stopAllNonColorAnimations();

        if (!this.PRESETS.length) {
            console.warn('No presets defined for Mandelbrot mode ');
            return;
        }

        this.demoActive = true;

        const getNextPresetIndex = (random) => {
            if (random) {
                let index;
                do {
                    index = Math.floor(Math.random() * this.PRESETS.length);
                } while (index === this.currentPresetIndex || index === 0);
                return index;
            } else {
                // Sequential: increment index, but if it wraps to 0, skip to 1.
                const nextIdx = (this.currentPresetIndex + 1) % this.PRESETS.length;
                return nextIdx === 0 ? 1 : nextIdx;
            }
        };

        // Continue cycling through presets while demo is active.
        while (this.demoActive) {
            this.currentPresetIndex = getNextPresetIndex(random);
            const currentPreset = this.PRESETS[this.currentPresetIndex];
            console.log(`Animating to preset ${this.currentPresetIndex}`);

            await this.animateTravelToPresetWithRandomRotation(currentPreset, 2000, 1000, 5000);
            await asyncDelay(3500);
        }

        console.log(`Demo interrupted.`);
        console.groupEnd();
    }

    // endregion--------------------------------------------------------------------------------------------------------
}

export default MandelbrotRenderer