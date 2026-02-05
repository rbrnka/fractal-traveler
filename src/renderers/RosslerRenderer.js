/**
 * Rossler attractor renderer
 * @author Radim Brnka
 */
import FractalRenderer from "./fractalRenderer";
import {asyncDelay, hexToRGBArray, lerp, normalizeRotation} from "../global/utils";
import {CONSOLE_GROUP_STYLE, EASE_TYPE, log} from "../global/constants";
import {updateInfo} from "../ui/ui";
import presetsData from '../data/rossler.json';
/** @type {string} */
import fragmentShaderRaw from '../shaders/rossler.frag';


export class RosslerRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.MAX_ITER = 10000;

        // Default view parameters.
        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_ZOOM = 30.0;
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        // Default Rossler parameters: a, b, c.
        this.DEFAULT_PARAMS = [0.2, 0.2, 5.7];

        // Default color parameters matching Mandelbrot pattern
        this.DEFAULT_FREQUENCY = [3.1415, 6.2830, 1.7200];
        this.DEFAULT_PHASE = [0, 0, 0];
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];

        this.zoom = this.DEFAULT_ZOOM;
        this.pan = this.DEFAULT_PAN.slice();
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = this.DEFAULT_PALETTE.slice();
        this.params = this.DEFAULT_PARAMS.slice();

        // Pre-allocate typed array for params uniform upload (avoids per-frame allocation)
        this._paramsArray = new Float32Array(3);

        // Presets and palettes from JSON
        this.PRESETS = presetsData.views || [];
        this.PALETTES = presetsData.palettes || [];
        this.currentPaletteIndex = 0;

        this.init();
    }

    createFragmentShaderSource() {
        return fragmentShaderRaw.replace('__MAX_ITER__', this.MAX_ITER).toString();
    }

    onProgramCreated() {
        // No additional resources needed (no orbit texture like Mandelbrot)
    }

    needsRebase() {
        return false; // No perturbation orbit
    }

    updateUniforms() {
        super.updateUniforms();
        this.paramsLoc = this.gl.getUniformLocation(this.program, 'u_params');
        this.frequencyLoc = this.gl.getUniformLocation(this.program, 'u_frequency');
        this.phaseLoc = this.gl.getUniformLocation(this.program, 'u_phase');
    }

    draw() {
        this.gl.useProgram(this.program);

        // Compute dynamic iteration count (base + adaptive quality adjustment)
        this.iterations = Math.max(500, Math.min(this.MAX_ITER, this.MAX_ITER + this.extraIterations));

        // Upload Rossler-specific uniforms
        if (this.paramsLoc) {
            this._paramsArray[0] = this.params[0];
            this._paramsArray[1] = this.params[1];
            this._paramsArray[2] = this.params[2];
            this.gl.uniform3fv(this.paramsLoc, this._paramsArray);
        }
        if (this.frequencyLoc) this.gl.uniform3fv(this.frequencyLoc, this.frequency);
        if (this.phaseLoc) this.gl.uniform3fv(this.phaseLoc, this.phase);

        // Base class handles: viewport, resolution/pan/zoom/rotation/colorPalette uploads,
        // clear, drawArrays, GPU timing, adaptive quality
        super.draw();
    }

    reset() {
        this.params = this.DEFAULT_PARAMS.slice();
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];
        this.currentPaletteIndex = 0;
        super.reset();
    }

    // region > ANIMATION METHODS

    /**
     * Animates travel to a preset. Interpolates params, pan, zoom, rotation, and palette simultaneously.
     * Matches the Mandelbrot-style signature used by the UI's else branch.
     *
     * @param {Object} preset - Preset with params, pan, zoom, rotation, paletteId
     * @param {number} [zoomOutDuration=2000] - Duration (ms) for zoom-out stage
     * @param {number} [panDuration=1000] - Duration (ms) for pan stage
     * @param {number} [zoomInDuration=3500] - Duration (ms) for zoom-in stage
     * @param {Function} [coloringCallback=null] - Optional callback for UI color updates
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, zoomOutDuration = 2000, panDuration = 1000, zoomInDuration = 3500, coloringCallback = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, CONSOLE_GROUP_STYLE);
        log(`Traveling to preset: ${JSON.stringify(preset)}`);

        this.stopAllNonColorAnimations();
        this.stopCurrentColorAnimations();

        const targetParams = preset.params || this.DEFAULT_PARAMS;
        const targetPan = preset.pan || this.DEFAULT_PAN;
        const targetZoom = preset.zoom || this.DEFAULT_ZOOM;
        const targetRotation = normalizeRotation(preset.rotation ?? this.DEFAULT_ROTATION);

        // Capture start values
        const startParams = [...this.params];
        const startPan = [...this.pan];
        const startZoom = this.zoom;
        const startRotation = this.rotation;

        // Resolve target palette
        let targetPalette = null;
        if (preset.paletteId) {
            const paletteIndex = this.PALETTES.findIndex(p => p.id === preset.paletteId);
            if (paletteIndex >= 0) {
                targetPalette = this.PALETTES[paletteIndex];
                this.currentPaletteIndex = paletteIndex;
            }
        }

        const startTheme = [...this.colorPalette];
        const startFrequency = [...this.frequency];
        const startPhase = [...this.phase];

        const targetTheme = targetPalette ? targetPalette.theme : startTheme;
        const targetFrequency = targetPalette ? (targetPalette.frequency || this.DEFAULT_FREQUENCY) : startFrequency;
        const targetPhase = targetPalette ? (targetPalette.phase || this.DEFAULT_PHASE) : startPhase;

        const duration = Math.max(zoomOutDuration, panDuration, zoomInDuration);
        const easeFunc = EASE_TYPE.QUINT;

        await new Promise((resolve) => {
            this._colorAnimationResolve = resolve;
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const t = Math.min((timestamp - startTime) / duration, 1);
                const k = easeFunc(t);

                // Interpolate params
                this.params[0] = lerp(startParams[0], targetParams[0], k);
                this.params[1] = lerp(startParams[1], targetParams[1], k);
                this.params[2] = lerp(startParams[2], targetParams[2], k);

                // Interpolate pan
                this.setPan(
                    lerp(startPan[0], targetPan[0], k),
                    lerp(startPan[1], targetPan[1], k)
                );

                // Interpolate zoom (exponential for smooth feel)
                this.zoom = startZoom * Math.pow(targetZoom / startZoom, k);

                // Interpolate rotation
                this.rotation = lerp(startRotation, targetRotation, k);

                // Interpolate palette
                if (targetPalette) {
                    this.colorPalette = [
                        lerp(startTheme[0], targetTheme[0], k),
                        lerp(startTheme[1], targetTheme[1], k),
                        lerp(startTheme[2], targetTheme[2], k),
                    ];
                    this.frequency = [
                        lerp(startFrequency[0], targetFrequency[0], k),
                        lerp(startFrequency[1], targetFrequency[1], k),
                        lerp(startFrequency[2], targetFrequency[2], k),
                    ];
                    this.phase = [
                        lerp(startPhase[0], targetPhase[0], k),
                        lerp(startPhase[1], targetPhase[1], k),
                        lerp(startPhase[2], targetPhase[2], k),
                    ];
                }

                this.draw();
                updateInfo(true);

                if (coloringCallback) {
                    if (targetPalette && targetPalette.keyColor) {
                        coloringCallback(hexToRGBArray(targetPalette.keyColor, 255));
                    } else {
                        coloringCallback();
                    }
                }

                if (t < 1) {
                    this.currentColorAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.rotation = normalizeRotation(this.rotation);
                    this._colorAnimationResolve = null;
                    this.currentColorAnimationFrame = null;
                    this.currentPresetIndex = preset.index || 0;
                    this.draw();
                    console.groupEnd();
                    resolve();
                }
            };

            this.currentColorAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates infinite demo loop of traveling to the presets.
     * @param {boolean} random - Whether presets are looped randomly or sequentially
     * @param {Function} [coloringCallback] - Optional callback for UI color updates
     * @param {Function} [onPresetComplete] - Optional callback when each preset completes
     * @param {Array} [userPresets] - Optional array of user-saved presets
     * @return {Promise<void>}
     */
    async animateDemo(random = true, coloringCallback = null, onPresetComplete = null, userPresets = []) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDemo`, CONSOLE_GROUP_STYLE);
        this.stopAllNonColorAnimations();

        const allPresets = [...this.PRESETS, ...userPresets];

        if (!allPresets.length) {
            console.warn('No presets defined for Rossler mode');
            console.groupEnd();
            return;
        }

        console.log(`Demo includes ${this.PRESETS.length} built-in + ${userPresets.length} user presets`);
        this.demoActive = true;

        let demoIndex = 0;
        const getNextPresetIndex = (random) => {
            if (allPresets.length <= 1) return 0;
            if (random) {
                let index;
                do {
                    index = Math.floor(Math.random() * allPresets.length);
                } while (index === demoIndex && allPresets.length > 1);
                return index;
            }
            return (demoIndex + 1) % allPresets.length;
        };

        while (this.demoActive) {
            demoIndex = getNextPresetIndex(random);
            const currentPreset = allPresets[demoIndex];

            if (!currentPreset) {
                console.warn(`No preset at index ${demoIndex}, stopping demo`);
                break;
            }

            console.log(`Animating to preset ${demoIndex}/${allPresets.length}: "${currentPreset.id}"`);

            await this.animateTravelToPreset(currentPreset, 3000, 1000, 3000, coloringCallback);

            if (onPresetComplete) onPresetComplete();

            await asyncDelay(3500);
        }

        console.log(`Demo interrupted.`);
        console.groupEnd();
    }

    // endregion

    // region > PALETTE SYSTEM

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
            const wrappedCallback = coloringCallback && palette.keyColor
                ? () => coloringCallback(hexToRGBArray(palette.keyColor, 255))
                : coloringCallback;
            await this.animateColorPaletteTransition({
                theme: palette.theme,
                frequency: palette.frequency || this.DEFAULT_FREQUENCY,
                phase: palette.phase || this.DEFAULT_PHASE
            }, duration, wrappedCallback);
        } else {
            // Random palette
            await this.animateColorPaletteTransition(null, duration, coloringCallback);
        }
    }

    /**
     * Generates a random palette with theme, frequency, and phase.
     * @returns {{theme: number[], frequency: number[], phase: number[]}}
     */
    generateRandomPalette() {
        const hue = Math.random();
        const angle = hue * Math.PI * 2;

        const r = Math.max(0, Math.cos(angle));
        const g = Math.max(0, Math.cos(angle - Math.PI * 2 / 3));
        const b = Math.max(0, Math.cos(angle + Math.PI * 2 / 3));

        const base = 0.8 + Math.random() * 0.4;
        const scale = 1.0 + Math.random() * 0.8;

        const theme = [
            base + r * scale,
            base + g * scale,
            base + b * scale,
        ];

        const frequency = [
            1.0 + Math.random() * 9.0,
            1.0 + Math.random() * 9.0,
            1.0 + Math.random() * 9.0,
        ];

        const phase = [
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
        ];

        return { theme, frequency, phase };
    }

    /**
     * Animates transition to a new palette (theme, frequency, phase).
     * @param {{theme: number[], frequency: number[], phase: number[]}|number[]|null} newPalette
     * @param {number} duration
     * @param {Function|null} coloringCallback
     */
    async animateColorPaletteTransition(newPalette, duration = 250, coloringCallback = null) {
        if (!newPalette) {
            newPalette = this.generateRandomPalette();
        } else if (Array.isArray(newPalette)) {
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
            this._colorAnimationResolve = resolve;
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                this.colorPalette = [
                    lerp(startTheme[0], targetTheme[0], progress),
                    lerp(startTheme[1], targetTheme[1], progress),
                    lerp(startTheme[2], targetTheme[2], progress),
                ];

                this.frequency = [
                    lerp(startFrequency[0], targetFrequency[0], progress),
                    lerp(startFrequency[1], targetFrequency[1], progress),
                    lerp(startFrequency[2], targetFrequency[2], progress),
                ];

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

    // endregion
}
