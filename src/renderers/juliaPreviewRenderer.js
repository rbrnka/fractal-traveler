/** @type {string} */
import fragmentShaderRaw from '../shaders/julia.preview.frag';
import FractalRenderer from "./fractalRenderer";
import data from '../data/julia.json';
import {DEFAULT_JULIA_PALETTE} from "../global/constants";

/**
 * Julia Set Preview Renderer (legacy)
 *
 * @author Radim Brnka
 * @description Simplified renderer for Julia preview in Mandelbrot mode
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
        this.DEFAULT_PALETTE = data.palettes[0].theme || DEFAULT_JULIA_PALETTE.theme;
        this.colorPalette = [...this.DEFAULT_PALETTE];

        /** @type COMPLEX */
        this.c = [...this.DEFAULT_C];

        /** @type {Array.<JULIA_PRESET>} */
        this.PRESETS = [];

        /** @type {Array.<DIVE>} */
        this.DIVES = [];

        this.innerStops = new Float32Array(this.DEFAULT_PALETTE);

        this.currentCAnimationFrame = null;
        this.demoTime = 0;

        this.init();
    }

    /**
     * @inheritDoc
     * @override
     */
    createFragmentShaderSource() {
        return fragmentShaderRaw.replace('__MAX_ITER__', this.MAX_ITER).toString();
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
        this.colorPalette = [...this.DEFAULT_PALETTE];
        this.innerStops = new Float32Array(this.colorPalette);
        this.extraIterations = 0;

        this.draw();
    }

    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

    /**
     * Updates the palette and redraws.
     * @param {number[]|Float32Array} newPalette - The inner stops array (15 floats for 5 RGB colors)
     * @param {number} [duration] - Ignored for preview (instant transition)
     * @param {Function} [coloringCallback] - Callback after palette change
     * @return {Promise<void>}
     */
    async animateColorPaletteTransition(newPalette, duration = 250, coloringCallback = null) {
        if (!newPalette) return Promise.resolve();

        // Update inner stops from the provided palette
        this.innerStops = new Float32Array(newPalette);

        // Derive colorPalette from stop index 3 (brightest color typically)
        const stopIndex = 3;
        this.colorPalette = [
            newPalette[stopIndex * 3] * 1.5,
            newPalette[stopIndex * 3 + 1] * 1.5,
            newPalette[stopIndex * 3 + 2] * 1.5
        ];

        // Redraw with new palette
        this.draw();

        if (coloringCallback) coloringCallback();

        return Promise.resolve();
    }

    needsRebase() {
        return false;
    }

    onProgramCreated() {

    }

    // endregion--------------------------------------------------------------------------------------------------------
}