import {lerp} from "../global/utils";
import {CONSOLE_GROUP_STYLE, JULIA_PALETTES} from "../global/constants";
/** @type {string} */
import fragmentShaderRaw from '../shaders/julia.preview.frag';
import FractalRenderer from "./fractalRenderer";

/**
 * Julia Set Preview Renderer (legacy)
 *
 * @author Radim Brnka
 * @description
 * @extends FractalRenderer
 * @since 1.9
 */
export class JuliaPreviewRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.MAX_ITER = 500;
        this.extraIterations = 0;

        this.DEFAULT_ZOOM = 2.5;

        /** @type COMPLEX */
        this.DEFAULT_C = [-0.246, 0.64235];

        this.zoom = this.DEFAULT_ZOOM;
        this.pan = [...this.DEFAULT_PAN]; // Copy
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = [...this.DEFAULT_PALETTE];

        /** @type COMPLEX */
        this.c = [...this.DEFAULT_C];

        /** @type {Array.<JULIA_PRESET>} */
        this.PRESETS = [];

        /** @type {Array.<DIVE>} */
        this.DIVES = [];

        this.currentPaletteIndex = 0;
        this.innerStops = new Float32Array(JULIA_PALETTES[this.currentPaletteIndex].theme);

        this.currentCAnimationFrame = null;
        this.demoTime = 0;

        this.init();
    }

    /**
     * @inheritDoc
     * @override
     */
    createFragmentShaderSource() {
        return fragmentShaderRaw.toString();
    }

    /**
     * @inheritDoc
     * @override
     */
    updateUniforms() {
        super.updateUniforms();

        this.cLoc = this.gl.getUniformLocation(this.program, 'u_c');
        this.innerStopsLoc = this.gl.getUniformLocation(this.program, 'u_innerStops');
    }

    /**
     * @inheritDoc
     * @override
     */
    draw() {
        this.gl.useProgram(this.program);

        const baseIters = Math.floor(3000 * Math.pow(2, -Math.log2(this.zoom)));
        this.iterations = Math.min(2000, baseIters + this.extraIterations);

        // Pass Julia constant `c`
        this.gl.uniform2fv(this.cLoc, this.c);
        this.gl.uniform3fv(this.innerStopsLoc, this.innerStops);

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

        super.reset();
    }

    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

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
        console.groupCollapsed(`%c ${this.constructor.name}: animateInnerStopsTransition`, `color: ${CONSOLE_GROUP_STYLE}`);
        this.stopCurrentColorAnimations();

        // Save the starting stops as a plain array.
        const startStops = Array.from(this.innerStops);

        await new Promise(resolve => {
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
                    if (keyColor) {
                        this.colorPalette = [keyColor.r, keyColor.g, keyColor.b];
                    }
                }

                if (!keyColor) {
                    const stopIndex = 3;
                    this.colorPalette = [
                        toPalette.theme[stopIndex * 3] * 1.5,
                        toPalette.theme[stopIndex * 3 + 1] * 1.5,
                        toPalette.theme[stopIndex * 3 + 2] * 1.5
                    ];
                }

                // Update the uniform for inner stops.
                this.gl.useProgram(this.program);
                if (this.innerStopsLoc) {
                    this.gl.uniform3fv(this.innerStopsLoc, this.innerStops);
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

    needsRebase() {
        return false;
    }

    onProgramCreated() {

    }

    // endregion--------------------------------------------------------------------------------------------------------
}