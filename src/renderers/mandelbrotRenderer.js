import FractalRenderer from "./fractalRenderer";
import {asyncDelay, ddSubDD, hexToRGBArray, lerp, normalizeRotation, splitFloat} from "../global/utils";
import {CONSOLE_GROUP_STYLE, EASE_TYPE, log, PI} from "../global/constants";
import presetsData from '../data/mandelbrot.json';
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

        // Reference state with DD precision
        this.refPan = [...this.DEFAULT_PAN];
        this.refPanDD = {
            x: { hi: this.DEFAULT_PAN[0], lo: 0 },
            y: { hi: this.DEFAULT_PAN[1], lo: 0 }
        };
        this.orbitDirty = true;

        /** IMPORTANT: MAX_ITER must remain constant after shader compilation + orbit buffer allocation. */
        this.MAX_ITER = 5000;

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
        this.PRESETS = presetsData.views;

        /**
         * @type {Array.<PALETTE>}
         * @description Palettes loaded from JSON (empty = random only)
         */
        this.PALETTES = presetsData.palettes || [];
        this.currentPaletteIndex = 0; // Start with Default palette

        // Default color parameters matching original hardcoded values
        this.DEFAULT_FREQUENCY = [3.1415, 6.2830, 1.7200];
        this.DEFAULT_PHASE = [0, 0, 0];
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];

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

    createFragmentShaderSource() {
        return fragmentShaderRaw.replace('__MAX_ITER__', this.MAX_ITER).toString();
    }

    updateUniforms() {
        super.updateUniforms();

        // delta pan hi/lo (viewPan - refPan, computed on JS side for precision)
        this.deltaPanHLoc = this.gl.getUniformLocation(this.program, 'u_delta_pan_h');
        this.deltaPanLLoc = this.gl.getUniformLocation(this.program, 'u_delta_pan_l');

        // zoom hi/lo
        this.zoomHLoc = this.gl.getUniformLocation(this.program, 'u_zoom_h');
        this.zoomLLoc = this.gl.getUniformLocation(this.program, 'u_zoom_l');

        // orbit texture uniforms
        this.orbitTexLoc = this.gl.getUniformLocation(this.program, 'u_orbitTex');
        this.orbitWLoc = this.gl.getUniformLocation(this.program, 'u_orbitW');

        // color parameters
        this.frequencyLoc = this.gl.getUniformLocation(this.program, 'u_frequency');
        this.phaseLoc = this.gl.getUniformLocation(this.program, 'u_phase');
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
        // Copy DD components to preserve deep zoom precision
        if (useViewCenter) {
            this.refPan[0] = this.pan[0];
            this.refPan[1] = this.pan[1];
            this.refPanDD.x.hi = this.panDD.x.hi;
            this.refPanDD.x.lo = this.panDD.x.lo;
            this.refPanDD.y.hi = this.panDD.y.hi;
            this.refPanDD.y.lo = this.panDD.y.lo;
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
            // New reference point from grid search - no DD precision accumulated yet
            this.refPanDD.x.hi = bestCx;
            this.refPanDD.x.lo = 0;
            this.refPanDD.y.hi = bestCy;
            this.refPanDD.y.lo = 0;
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
        const log2Depth = Math.log2(this.DEFAULT_ZOOM / safe);
        const baseIters = Math.floor(200 + 50 * log2Depth);
        this.iterations = Math.max(50, Math.min(this.MAX_ITER, baseIters + this.extraIterations));

        const mustRebaseNow = this.needsRebase();
        const canRebaseNow = !this.interactionActive || mustRebaseNow;

        if (this.orbitDirty && canRebaseNow) {
            this.pickReferenceNearViewCenter();
            this.computeReferenceOrbit();
            this.orbitDirty = false;
        }

        // Compute deltaPan = panDD - refPanDD on JS side (float64) for precision
        // This avoids float32 precision loss when the shader subtracts viewPan - refPan
        const deltaPanX = ddSubDD(this.panDD.x, this.refPanDD.x);
        const deltaPanY = ddSubDD(this.panDD.y, this.refPanDD.y);

        // Upload deltaPan hi/lo
        if (this.deltaPanHLoc) this.gl.uniform2f(this.deltaPanHLoc, deltaPanX.hi, deltaPanY.hi);
        if (this.deltaPanLLoc) this.gl.uniform2f(this.deltaPanLLoc, deltaPanX.lo, deltaPanY.lo);

        // Upload zoom hi/lo
        const z = splitFloat(this.zoom);
        if (this.zoomHLoc) this.gl.uniform1f(this.zoomHLoc, z.high);
        if (this.zoomLLoc) this.gl.uniform1f(this.zoomLLoc, z.low);

        // Upload color parameters
        if (this.frequencyLoc) this.gl.uniform3fv(this.frequencyLoc, this.frequency);
        if (this.phaseLoc) this.gl.uniform3fv(this.phaseLoc, this.phase);

        super.draw();
    }

    needsRebase() {
        const dx = this.pan[0] - this.refPan[0];
        const dy = this.pan[1] - this.refPan[1];

        // Rebase threshold is proportional to zoom (view scale).
        // 0.75 is consistent with the Julia policy.
        return Math.hypot(dx, dy) > this.zoom * 0.75;
    }

    /**
     * Resets renderer to default state including frequency and phase.
     * @override
     */
    reset() {
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];
        this.currentPaletteIndex = 0;
        this.orbitDirty = true;
        super.reset();
    }

    // region > ANIMATION METHODS

    /**
     * Applies a specific palette by index.
     * @param {number} index - Palette index (-1 for random)
     * @param {number} [duration=250] - Transition duration in ms
     * @param {Function} [coloringCallback] - Callback when done
     * @return {Promise<void>}
     */
    async applyPaletteByIndex(index, duration = 250, coloringCallback = null) {
        this.currentPaletteIndex = index;

        if (index >= 0 && index < this.PALETTES.length) {
            const palette = this.PALETTES[index];
            // Wrap callback to use keyColor for UI instead of theme
            const wrappedCallback = coloringCallback && palette.keyColor
                ? () => coloringCallback(hexToRGBArray(palette.keyColor, 255))
                : coloringCallback;
            await this.animateColorPaletteTransition({
                theme: palette.theme,
                frequency: palette.frequency || this.DEFAULT_FREQUENCY,
                phase: palette.phase || this.DEFAULT_PHASE
            }, duration, wrappedCallback);
        } else {
            // Random palette (index -1 or out of range)
            await this.animateColorPaletteTransition(null, duration, coloringCallback);
        }
    }

    /**
     * Generates a random palette with theme, frequency, and phase.
     * Creates visually distinct palettes by varying all three parameters.
     * @returns {{theme: number[], frequency: number[], phase: number[]}}
     */
    generateRandomPalette() {
        // Random hue with high saturation for theme
        const hue = Math.random();
        const angle = hue * Math.PI * 2;

        // Create base color from hue (simplified HSV to RGB at full saturation)
        const r = Math.max(0, Math.cos(angle));
        const g = Math.max(0, Math.cos(angle - Math.PI * 2 / 3));
        const b = Math.max(0, Math.cos(angle + Math.PI * 2 / 3));

        // Scale to multiplier range (0.8 - 2.2) with some base brightness
        const base = 0.8 + Math.random() * 0.4; // 0.8-1.2
        const scale = 1.0 + Math.random() * 0.8; // 1.0-1.8

        const theme = [
            base + r * scale,
            base + g * scale,
            base + b * scale,
        ];

        // Generate random frequency - controls how fast colors cycle
        // Values 1-10 give nice variety without being too chaotic
        const frequency = [
            1.0 + Math.random() * 9.0,
            1.0 + Math.random() * 9.0,
            1.0 + Math.random() * 9.0,
        ];

        // Generate random phase - shifts the color bands
        // Values 0 to 2*PI cover full phase range
        const phase = [
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
        ];

        return { theme, frequency, phase };
    }

    /**
     * Animates transition to a new palette (theme, frequency, phase).
     * Accepts either:
     * - Object: {theme: [...], frequency: [...], phase: [...]}
     * - Array (legacy): [r, g, b] - uses current frequency/phase
     * - null: generates random palette
     * @param {{theme: number[], frequency: number[], phase: number[]}|number[]|null} newPalette
     * @param {number} duration
     * @param {Function|null} coloringCallback
     */
    async animateColorPaletteTransition(newPalette, duration = 250, coloringCallback = null) {
        // Normalize input to object format
        if (!newPalette) {
            newPalette = this.generateRandomPalette();
        } else if (Array.isArray(newPalette)) {
            // Legacy array format - just theme, keep current frequency/phase
            newPalette = {
                theme: newPalette,
                frequency: [...this.frequency],
                phase: [...this.phase]
            };
        }

        this.stopCurrentColorAnimations();

        const startTheme = [...this.colorPalette];
        const startFrequency = [...this.frequency];
        const startPhase = [...this.phase];

        const targetTheme = newPalette.theme;
        const targetFrequency = newPalette.frequency || this.DEFAULT_FREQUENCY;
        const targetPhase = newPalette.phase || this.DEFAULT_PHASE;

        await new Promise((resolve) => {
            // Store resolve so stopCurrentColorAnimations can call it if interrupted
            this._colorAnimationResolve = resolve;
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Lerp theme (colorPalette)
                this.colorPalette = [
                    lerp(startTheme[0], targetTheme[0], progress),
                    lerp(startTheme[1], targetTheme[1], progress),
                    lerp(startTheme[2], targetTheme[2], progress),
                ];

                // Lerp frequency
                this.frequency = [
                    lerp(startFrequency[0], targetFrequency[0], progress),
                    lerp(startFrequency[1], targetFrequency[1], progress),
                    lerp(startFrequency[2], targetFrequency[2], progress),
                ];

                // Lerp phase
                this.phase = [
                    lerp(startPhase[0], targetPhase[0], progress),
                    lerp(startPhase[1], targetPhase[1], progress),
                    lerp(startPhase[2], targetPhase[2], progress),
                ];

                this.draw();

                if (coloringCallback) coloringCallback();

                if (progress < 1) {
                    this.currentColorAnimationFrame = requestAnimationFrame(step);
                } else {
                    this._colorAnimationResolve = null;
                    this.stopCurrentColorAnimations();
                    resolve();
                }
            };

            this.currentColorAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates travel to a preset. It first zooms out to the default zoom, then rotates, then animates pan and zoom-in.
     * If any of the final params is the same as the target, it won't animate it.
     *
     * @param {MANDELBROT_PRESET} preset An instance-specific object to define exact spot in the fractal
     * @param {number} [zoomOutDuration=2000] Duration (ms) for zoom-out stage
     * @param {number} [panDuration=1000] Duration (ms) for pan stage
     * @param {number} [zoomInDuration=3500] Duration (ms) for zoom-in stage
     * @param {Function} [coloringCallback=null] Optional callback for UI color updates
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, zoomOutDuration = 2000, panDuration = 1000, zoomInDuration = 3500, coloringCallback = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, CONSOLE_GROUP_STYLE);
        log(`Traveling to preset: ${JSON.stringify(preset)}`);

        const presetRotation = normalizeRotation(preset.rotation ?? this.DEFAULT_ROTATION);

        // Determine how far we are from the preset
        // Zoom ratio: how many "zoom levels" away (log scale makes sense for exponential zoom)
        const zoomRatio = Math.abs(Math.log(this.zoom / preset.zoom));
        const atTargetZoom = zoomRatio < 0.01; // Within ~1% zoom
        const nearTargetZoom = zoomRatio < 2.5; // Within ~12x zoom difference

        // Pan distance relative to TARGET view size (what matters at the end)
        const panDist = Math.hypot(this.pan[0] - preset.pan[0], this.pan[1] - preset.pan[1]);
        const targetViewSize = preset.zoom;
        const panRatio = panDist / targetViewSize;
        const atTargetPan = panRatio < 0.1; // Essentially same position at target zoom
        const nearTargetPan = panRatio < 3.0; // Within 3 view-widths at target zoom

        // Palette proximity check
        let targetPaletteIndex = -1;
        let atTargetPalette = true;
        if (preset.paletteId) {
            targetPaletteIndex = this.PALETTES.findIndex(p => p.id === preset.paletteId);
            atTargetPalette = targetPaletteIndex < 0 || targetPaletteIndex === this.currentPaletteIndex;
        }

        const zoomInDurationWithSpeed = zoomInDuration * (preset.speed ?? 1);

        // Readjust duration scales with how far off we are (min 500ms, max panDuration)
        const readjustDuration = Math.max(500, Math.min(panDuration, 300 + panRatio * 200 + zoomRatio * 150));

        if (atTargetZoom && atTargetPan && atTargetPalette) {
            // Already at target - only rotate if needed
            await this.animateRotationTo(presetRotation, zoomOutDuration, EASE_TYPE.QUINT);
        } else if (atTargetZoom && atTargetPan) {
            // At position and zoom, but different palette - rotate with palette transition
            const animations = [
                this.animateRotationTo(presetRotation, zoomOutDuration, EASE_TYPE.QUINT)
            ];
            if (!atTargetPalette) {
                animations.push(this.animatePaletteByIdTransition(preset, zoomOutDuration, coloringCallback));
            }
            await Promise.all(animations);
        } else if (nearTargetZoom && nearTargetPan) {
            // Close to preset - smooth readjustment without cinematic animation
            log(`Near preset, readjusting (zoomRatio=${zoomRatio.toFixed(2)}, panRatio=${panRatio.toFixed(2)})`);
            const animations = [
                this.animatePanAndZoomTo(preset.pan, preset.zoom, readjustDuration, EASE_TYPE.CUBIC),
                this.animateRotationTo(presetRotation, readjustDuration, EASE_TYPE.CUBIC)
            ];
            if (!atTargetPalette) {
                animations.push(this.animatePaletteByIdTransition(preset, readjustDuration, coloringCallback));
            }
            await Promise.all(animations);
        } else if (atTargetZoom) {
            // Same zoom but panned far away - pan back with rotation and palette
            const animations = [
                this.animatePanTo(preset.pan, panDuration, EASE_TYPE.CUBIC),
                this.animateRotationTo(presetRotation, panDuration, EASE_TYPE.CUBIC)
            ];
            if (!atTargetPalette) {
                animations.push(this.animatePaletteByIdTransition(preset, panDuration, coloringCallback));
            }
            await Promise.all(animations);
        } else if (atTargetPan) {
            // Same position, just zoom and rotate with palette
            const animations = [
                this.animateZoomRotationTo(preset.zoom, presetRotation, readjustDuration, EASE_TYPE.QUINT)
            ];
            if (!atTargetPalette) {
                animations.push(this.animatePaletteByIdTransition(preset, readjustDuration, coloringCallback));
            }
            await Promise.all(animations);
        } else {
            // Full 3-stage cinematic animation:

            // Stage 1: Zoom out to default zoom with random rotation (if significantly zoomed in)
            const needsZoomOut = this.zoom < this.DEFAULT_ZOOM * 0.9;
            if (needsZoomOut) {
                const zoomOutRotation = this.rotation + (Math.random() * PI * 2 - PI);
                await this.animateZoomRotationTo(this.DEFAULT_ZOOM, zoomOutRotation, zoomOutDuration, EASE_TYPE.QUINT);
            }

            // Stage 2: Pan to target coordinates
            await this.animatePanTo(preset.pan, panDuration, EASE_TYPE.CUBIC);

            // Stage 3: Zoom in with cinematic rotation AND palette transition in parallel
            // Calculate extra rotations
            const extraFullRotations = Math.floor(Math.random() * 2); // 1 or 2 full rotations
            const rotationDirection = Math.random() > 0.5 ? 1 : -1;

            // Calculate shortest angular path from current to preset rotation
            let deltaAngle = presetRotation - this.rotation;
            while (deltaAngle > PI) deltaAngle -= PI * 2;
            while (deltaAngle < -PI) deltaAngle += PI * 2;

            // Target includes the path to preset plus extra full rotations
            // This will end exactly at presetRotation after normalization
            const targetRotationWithSpins = this.rotation + deltaAngle + (rotationDirection * extraFullRotations * PI * 2);

            const finalAnimations = [
                this.animateZoomRotationTo(preset.zoom, targetRotationWithSpins, zoomInDurationWithSpeed, EASE_TYPE.NONE)
            ];
            if (!atTargetPalette) {
                finalAnimations.push(this.animatePaletteByIdTransition(preset, zoomInDurationWithSpeed, coloringCallback));
            }
            await Promise.all(finalAnimations);
        }

        // Normalize rotation to ensure it's exactly at preset value (handles 2π wrapping)
        this.rotation = normalizeRotation(this.rotation);

        this.currentPresetIndex = preset.index || 0;

        console.log(`Travel complete.`);
        console.groupEnd();
    }

    /**
     * Animates infinite demo loop of traveling to the presets
     * @param {boolean} random Determines whether presets are looped in order from 1-9 or ordered randomly
     * @param {Function} [coloringCallback] Optional callback for UI color updates
     * @param {Function} [onPresetComplete] Optional callback when each preset completes
     * @return {Promise<void>}
     */
    async animateDemo(random = true, coloringCallback = null, onPresetComplete = null) {
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

            await this.animateTravelToPreset(currentPreset, 3000, 1000, 3000, coloringCallback);

            // Call completion callback to update UI state
            if (onPresetComplete) {
                onPresetComplete();
            }

            await asyncDelay(3500);
        }

        console.log(`Demo interrupted.`);
        console.groupEnd();
    }

    // endregion--------------------------------------------------------------------------------------------------------
}

export default MandelbrotRenderer