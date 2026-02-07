import FractalRenderer from "./fractalRenderer";
import {asyncDelay, hexToRGBArray, lerp, normalizeRotation} from "../global/utils";
import {CONSOLE_GROUP_STYLE, EASE_TYPE, log} from "../global/constants";
import {updateInfo} from "../ui/ui";
import presetsData from '../data/riemann.json';
/** @type {string} */
import fragmentShaderRaw from '../shaders/riemann.frag';

class RiemannRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.MAX_TERMS = 500;
        this.DEFAULT_ZOOM = 50;
        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.DEFAULT_FREQUENCY = [1.0, 1.0, 1.0];
        this.DEFAULT_PHASE = [0, 0, 0];
        this.MIN_ZOOM = 4000;

        this.zoom = this.DEFAULT_ZOOM;
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = this.DEFAULT_PALETTE.slice();
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];
        this.showCriticalLine = true;
        this.useAnalyticExtension = true;
        this.contourStrength = 0.15;
        this.seriesTerms = 100; // Number of terms in eta/zeta series

        this.PRESETS = presetsData.views || [];
        this.PALETTES = presetsData.palettes || [];
        this.TOUR = presetsData.tour || [];
        this.currentPaletteIndex = 0;
        this.zeroTourActive = false;

        this.init();
    }

    createFragmentShaderSource() {
        return fragmentShaderRaw.replace('__MAX_TERMS__', this.MAX_TERMS).toString();
    }

    onProgramCreated() {
        // No additional resources needed
    }

    needsRebase() {
        return false;
    }

    updateUniforms() {
        super.updateUniforms();
        this.frequencyLoc = this.gl.getUniformLocation(this.program, 'u_frequency');
        this.phaseLoc = this.gl.getUniformLocation(this.program, 'u_phase');
        this.showCriticalLineLoc = this.gl.getUniformLocation(this.program, 'u_showCriticalLine');
        this.useAnalyticExtensionLoc = this.gl.getUniformLocation(this.program, 'u_useAnalyticExtension');
        this.contourStrengthLoc = this.gl.getUniformLocation(this.program, 'u_contourStrength');
    }

    draw() {
        this.gl.useProgram(this.program);

        // Compute dynamic iteration count based on seriesTerms + adaptive quality adjustment
        this.iterations = Math.max(20, Math.min(this.MAX_TERMS, this.seriesTerms + this.extraIterations));

        // Upload Riemann-specific uniforms
        if (this.frequencyLoc) this.gl.uniform3fv(this.frequencyLoc, this.frequency);
        if (this.phaseLoc) this.gl.uniform3fv(this.phaseLoc, this.phase);
        if (this.showCriticalLineLoc) this.gl.uniform1i(this.showCriticalLineLoc, this.showCriticalLine ? 1 : 0);
        if (this.useAnalyticExtensionLoc) this.gl.uniform1i(this.useAnalyticExtensionLoc, this.useAnalyticExtension ? 1 : 0);
        if (this.contourStrengthLoc) this.gl.uniform1f(this.contourStrengthLoc, this.contourStrength);

        super.draw();
    }

    reset() {
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];
        this.currentPaletteIndex = 0;
        this.showCriticalLine = true;
        this.useAnalyticExtension = true;
        this.contourStrength = 0.15;
        this.seriesTerms = 100;
        super.reset();
    }

    // region > ANIMATION METHODS

    /**
     * Animates travel to a preset. Interpolates pan, zoom, rotation, and palette simultaneously.
     * Matches the Mandelbrot-style signature used by the UI's else branch.
     *
     * @param {Object} preset - Preset with pan, zoom, rotation, paletteId
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

        const targetPan = preset.pan || this.DEFAULT_PAN;
        const targetZoom = preset.zoom || this.DEFAULT_ZOOM;
        const targetRotation = normalizeRotation(preset.rotation ?? this.DEFAULT_ROTATION);

        // Capture start values
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
            console.warn('No presets defined for Riemann mode');
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

    /**
     * Animates a comprehensive tour through significant points of the Riemann zeta function.
     * Includes the pole, trivial zeros, special values, saddle points, gram points, and non-trivial zeros.
     * @param {Function} [onPointReached=null] - Callback when each point is reached (point, index)
     * @param {number} [holdDuration=4000] - How long to hold at each point (ms)
     * @return {Promise<void>}
     */
    async animateZeroTour(onPointReached = null, holdDuration = 4000) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZeroTour`, CONSOLE_GROUP_STYLE);

        this.stopAllNonColorAnimations();
        this.zeroTourActive = true;

        for (let i = 0; i < this.TOUR.length && this.zeroTourActive; i++) {
            const point = this.TOUR[i];
            const preset = {
                pan: point.pan,
                zoom: point.zoom || 8,
                rotation: 0,
                paletteId: point.paletteId || 'Default'
            };

            log(`Traveling to ${point.type}: ${i + 1}/${this.TOUR.length}: ${point.name}`);

            await this.animateTravelToPreset(preset, 2000, 1000, 2500);

            if (onPointReached && this.zeroTourActive) {
                onPointReached(point, i);
            }

            if (this.zeroTourActive) {
                await asyncDelay(holdDuration);
            }
        }

        // Return to overview if tour completed normally
        if (this.zeroTourActive && this.PRESETS.length > 0) {
            log('Tour complete, returning to overview');
            await this.animateTravelToPreset(this.PRESETS[0], 2000, 1000, 2500);
        }

        this.zeroTourActive = false;
        console.groupEnd();
    }

    /**
     * Stops an active zero tour.
     */
    stopZeroTour() {
        this.zeroTourActive = false;
        this.stopAllNonColorAnimations();
        log('Zero tour stopped', 'stopZeroTour');
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

export default RiemannRenderer;
