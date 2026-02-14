import FractalRenderer from "./fractalRenderer";
import {asyncDelay, hexToRGBArray, lerp, normalizeRotation} from "../global/utils";
import {CONSOLE_GROUP_STYLE, EASE_TYPE, log, RIEMANN_DOUBLE_PRECISION_THRESHOLD} from "../global/constants";
import {updateInfo} from "../ui/ui";
import presetsData from '../data/riemann.json';

// Available shaders
import shaderBorwein from '../shaders/riemann-borwein.frag';
import shaderSiegel from '../shaders/riemann-siegel.frag';
import shaderDouble from '../shaders/riemann-double.frag';
import shaderDefault from '../shaders/riemann.frag';

const SHADER_OPTIONS = {
    'borwein': { source: shaderBorwein, name: 'Borwein', description: 'Euler-accelerated convergence' },
    'siegel': { source: shaderSiegel, name: 'Riemann-Siegel', description: 'Optimized for critical line' },
    'double': { source: shaderDouble, name: 'Double Precision', description: 'High accuracy for large t (slower)' },
    'default': { source: shaderDefault, name: 'Default (Eta)', description: 'Dirichlet eta series' }
};

class RiemannRenderer extends FractalRenderer {

    // Static accessor for shader options (for UI)
    static get SHADER_OPTIONS() {
        return SHADER_OPTIONS;
    }

    constructor(canvas) {
        super(canvas);

        this.MAX_TERMS = 2000;
        this.DEFAULT_ZOOM = 2e1;
        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.DEFAULT_FREQUENCY = [3.5, 5.0, 0.1];
        this.DEFAULT_PHASE = [0, 0, 0];
        this.MIN_ZOOM = 4000;
        this.MAX_ZOOM = 0.01;
        // No pan limit for Riemann - allow exploring any region
        this.MAX_PAN_DISTANCE = Infinity;

        this.zoom = this.DEFAULT_ZOOM;
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = this.DEFAULT_PALETTE.slice();
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];
        this.showCriticalLine = true;
        this.useAnalyticExtension = true;
        this.contourStrength = 0.15;
        this.seriesTerms = 500; // Number of terms in eta/zeta series

        // Shader selection
        this.currentShader = 'borwein';
        this.fragmentShaderSource = SHADER_OPTIONS[this.currentShader].source;
        this.autoShaderSwitching = true; // Enable automatic shader switching based on region
        this.manualShaderOverride = false; // When true, don't auto-switch

        this.PRESETS = presetsData.views || [];
        this.PALETTES = presetsData.palettes || [];
        this.currentPaletteIndex = 0;
        this.zeroTourActive = false;

        this.init();
    }

    createFragmentShaderSource() {
        return this.fragmentShaderSource.replace('__MAX_TERMS__', this.MAX_TERMS).toString();
    }

    /**
     * Switches to a different shader algorithm.
     * @param {string} shaderId - One of: 'borwein', 'siegel', 'double', 'default'
     * @returns {boolean} - True if shader was changed successfully
     */
    /**
     * Switches to a different shader algorithm (called from UI).
     * Sets manual override to prevent auto-switching.
     * @param {string} shaderId - One of: 'borwein', 'siegel', 'double', 'default'
     * @param {boolean} [isManual=true] - Whether this is a manual user selection
     * @returns {boolean} - True if shader was changed successfully
     */
    setShader(shaderId, isManual = true) {
        if (!SHADER_OPTIONS[shaderId]) {
            console.warn(`Unknown shader: ${shaderId}`);
            return false;
        }

        if (shaderId === this.currentShader) {
            if (isManual) this.manualShaderOverride = true;
            return true; // Already using this shader
        }

        // Manual selection disables auto-switching
        if (isManual) {
            this.manualShaderOverride = true;
        }

        log(`Switching shader to: ${shaderId}`);
        this.currentShader = shaderId;
        this.fragmentShaderSource = SHADER_OPTIONS[shaderId].source;

        // Rebuild the WebGL program with new shader
        this.rebuildProgram();
        this.draw();

        return true;
    }

    /**
     * Gets info about the current shader.
     * @returns {{id: string, name: string, description: string}}
     */
    getShaderInfo() {
        const shader = SHADER_OPTIONS[this.currentShader];
        return {
            id: this.currentShader,
            name: shader.name,
            description: shader.description
        };
    }

    /**
     * Rebuilds the WebGL program (needed after shader change).
     */
    rebuildProgram() {
        // Use the base class initGLProgram which handles shader compilation
        // The fragmentShaderSource is already updated, so this will recompile
        this.initGLProgram();
        log(`Shader rebuilt: ${this.currentShader}`);
    }

    /**
     * Called after GL program is created.
     * Caches Riemann-specific uniform locations.
     * @override
     */
    onProgramCreated() {
        super.onProgramCreated();

        // Riemann-specific uniform locations
        this.frequencyLoc = this.gl.getUniformLocation(this.program, 'u_frequency');
        this.phaseLoc = this.gl.getUniformLocation(this.program, 'u_phase');
        this.showCriticalLineLoc = this.gl.getUniformLocation(this.program, 'u_showCriticalLine');
        this.useAnalyticExtensionLoc = this.gl.getUniformLocation(this.program, 'u_useAnalyticExtension');
        this.contourStrengthLoc = this.gl.getUniformLocation(this.program, 'u_contourStrength');
    }

    needsRebase() {
        return false;
    }

    draw() {
        // Auto-switch shader based on viewing region
        this.checkAutoShaderSwitch();

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

    /**
     * Checks if shader should be auto-switched based on current viewing region.
     * Switches to double precision for high imaginary values (|Im(s)| > threshold).
     */
    checkAutoShaderSwitch() {
        if (!this.autoShaderSwitching || this.manualShaderOverride) return;

        const absImag = Math.abs(this.pan[1]);
        const needsDoublePrecision = absImag > RIEMANN_DOUBLE_PRECISION_THRESHOLD;

        if (needsDoublePrecision && this.currentShader !== 'double') {
            log(`Auto-switching to double precision (t=${absImag.toFixed(0)})`);
            this.setShaderInternal('double');
        } else if (!needsDoublePrecision && this.currentShader === 'double') {
            log(`Auto-switching back to borwein (t=${absImag.toFixed(0)})`);
            this.setShaderInternal('borwein');
        }
    }

    /**
     * Internal shader switch without triggering draw (to avoid recursion).
     * @param {string} shaderId
     */
    setShaderInternal(shaderId) {
        if (!SHADER_OPTIONS[shaderId] || shaderId === this.currentShader) return;

        this.currentShader = shaderId;
        this.fragmentShaderSource = SHADER_OPTIONS[shaderId].source;
        this.rebuildProgram();
    }

    reset() {
        this.frequency = [...this.DEFAULT_FREQUENCY];
        this.phase = [...this.DEFAULT_PHASE];
        this.currentPaletteIndex = 0;
        this.showCriticalLine = true;
        this.useAnalyticExtension = true;
        this.contourStrength = 0.15;
        this.seriesTerms = 500;

        // Reset shader to default and enable auto-switching
        this.manualShaderOverride = false;
        if (this.currentShader !== 'borwein') {
            this.setShaderInternal('borwein');
        }

        super.reset();
    }

    /**
     * Resets manual shader override, allowing auto-switching again.
     * Called when navigating to presets.
     */
    resetShaderOverride() {
        this.manualShaderOverride = false;
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

        // Reset shader override to allow auto-switching during preset navigation
        this.resetShaderOverride();

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
     * @param {Function} [onPresetReached] - Optional callback(preset, index, total) when preset is reached
     * @return {Promise<void>}
     */
    async animateDemo(random = true, coloringCallback = null, onPresetComplete = null, userPresets = [], onPresetReached = null) {
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

            await this.animateTravelToPreset(currentPreset, 1000, 1000, 1000, coloringCallback);

            // Show overlay at the end of animation
            if (onPresetReached) {
                onPresetReached(currentPreset, demoIndex, allPresets.length);
            }

            if (onPresetComplete) onPresetComplete();

            await asyncDelay(10000);
        }

        console.log(`Demo interrupted.`);
        console.groupEnd();
    }

    /**
     * Animates a comprehensive tour through significant points of the Riemann zeta function.
     * Includes the pole, trivial zeros, special values, saddle points, gram points, and non-trivial zeros.
     * @param {Function} [onPointReached=null] - Callback when each point is reached (point, index)
     * @param {number} [holdDuration=4000] - How long to hold at each point (ms)
     * @param {Function} [onBeforeTravel=null] - Callback before traveling to next point (to hide overlay)
     * @return {Promise<void>}
     */
    async animateZeroTour(onPointReached = null, holdDuration = 4000, onBeforeTravel = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateZeroTour`, CONSOLE_GROUP_STYLE);

        this.stopAllNonColorAnimations();
        this.zeroTourActive = true;

        for (let i = 0; i < this.PRESETS.length && this.zeroTourActive; i++) {
            const point = this.PRESETS[i];
            const zoom = point.zoom || 8;
            const preset = {
                pan: point.pan,
                zoom: zoom,
                rotation: 0,
                paletteId: point.paletteId || 'Default'
            };

            log(`Traveling to ${point.type}: ${i + 1}/${this.PRESETS.length}: ${point.id}`);

            // Hide overlay/markers before starting travel
            if (onBeforeTravel) {
                onBeforeTravel();
            }

            await this.animateTravelToPreset(preset, 2000, 1000, 2500);

            // Show overlay at the end of animation
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
