import {FractalRenderer} from './fractalRenderer.js';
import {asyncDelay, compareComplex} from "../global/utils";
import {DEFAULT_CONSOLE_GROUP_COLOR, EASE_TYPE} from "../global/constants";

/**
 * MandelbrotRenderer
 *
 * @author Radim Brnka
 * @description This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.
 * @extends FractalRenderer
 */
export class MandelbrotRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_PAN = [-0.5, 0];
        this.pan = [...this.DEFAULT_PAN];
        /** Mandelbrot-specific presets
         */
        this.PRESETS = [
            {pan: this.DEFAULT_PAN, zoom: this.DEFAULT_ZOOM, rotation: this.DEFAULT_ROTATION},
            {pan: [0.351424, 0.063866], zoom: 0.000049},
            {pan: [0.254998, 0.000568], zoom: 0.000045},
            {pan: [-0.164538, 1.038428], zoom: 0.000127},
            {pan: [-0.750700, 0.021415], zoom: 0.000110},
            // {pan: [-1.907294, 0.000000], zoom: 0.000451},
            {pan: [-0.766863, -0.107475], zoom: 0.000196},
            {pan: [-0.8535686544080792, -0.21081423598149682], zoom: 0.000126},
            {pan: [0.337420, 0.047257], zoom: 0.000143},
            {pan: [0.11650135661082159, -0.6635453818054073], zoom: 0.000104},
            {pan: [-0.124797, 0.840309], zoom: 0.000628}
        ];

        this.init();
    }

    /**
     * @inheritDoc
     * @override
     */
    createFragmentShaderSource() {
        /** Coloring algorithm */
        const coloring = `float color = i / 100.0;
                vec3 fractalColor = vec3(
                    sin(color * 3.1415),
                    sin(color * 6.283),
                    sin(color * 1.720)
                ) * u_colorPalette;
                gl_FragColor = vec4(fractalColor, 1.0);
         `;

        return `
        precision mediump float;
        
        // Use uniforms for dynamic values.
        uniform vec2 u_resolution;
        uniform vec2 u_pan;
        uniform float u_zoom;
        uniform float u_iterations;
        uniform vec3 u_colorPalette;
        uniform float u_rotation; // Rotation in radians
        
        void main() {
            // Compute aspect ratio from the current resolution.
            float aspect = u_resolution.x / u_resolution.y;
            
            // Normalize coordinates based on the current resolution.
            vec2 st = gl_FragCoord.xy / u_resolution;
            st -= 0.5;  // Center the coordinate system.
            st.x *= aspect;  // Adjust for the aspect ratio.
    
            // Apply rotation.
            float cosR = cos(u_rotation);
            float sinR = sin(u_rotation);
            vec2 rotated = vec2(
                st.x * cosR - st.y * sinR,
                st.x * sinR + st.y * cosR
            );
    
            // Scale and translate to fractal coordinates.
            vec2 c = rotated * u_zoom + u_pan;
    
            // Mandelbrot computation.
            vec2 z = vec2(0.0, 0.0);
            float i;
            for (float n = 0.0; n < 2000.0; n++) {
                if (n >= u_iterations || dot(z, z) > 4.0) {
                    i = n;
                    break;
                }
                z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
            }
    
            // Color the pixel.
            if (i >= u_iterations) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            } else {
                ${coloring}
            }
        }
    `;
    }

    /**
     * @inheritDoc
     * @override
     */
    draw() {
        const baseIters = Math.floor(5000 * Math.pow(2, -Math.log2(this.zoom)));
        this.iterations = Math.min(2000, baseIters + this.extraIterations);

        super.draw();

    }

    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

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
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        console.log(`Traveling to preset: ${JSON.stringify(preset)}`);

        const targetRotation = preset.rotation || 0;

        if (preset.zoom.toFixed(6) === this.zoom.toFixed(6)) {
            // If only pan is changed, adjust pan
            await this.animatePanTo(preset.pan, zoomOutDuration);
        } else if (compareComplex(preset.pan, this.pan)) {
            // If only zoom is changed, adjust zoom-in
            await this.animateZoomTo(preset.zoom, zoomOutDuration);
        } else {
            // Otherwise zoom-out
            await this.animateZoomTo(this.DEFAULT_ZOOM, zoomOutDuration);
        }

        await Promise.all([
            this.animatePanThenZoomTo(preset.pan, preset.zoom, 500, zoomInDuration, EASE_TYPE.QUAD),
            this.animateRotationTo(targetRotation, 500, EASE_TYPE.QUINT)
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
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPresetWithRandomRotation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        // Generate random rotations for a more dynamic effect.
        const zoomOutRotation = this.rotation + (Math.random() * Math.PI * 2 - Math.PI);
        const zoomInRotation = zoomOutRotation + (Math.random() * Math.PI * 2 - Math.PI);

        if (this.rotation !== this.DEFAULT_ROTATION) {
            await this.animateZoomRotationTo(this.DEFAULT_ZOOM, zoomOutRotation, zoomOutDuration, EASE_TYPE.QUAD)
        }

        await this.animatePanTo(preset.pan, panDuration, EASE_TYPE.CUBIC);
        await this.animateZoomRotationTo(preset.zoom, zoomInRotation, zoomInDuration);

        this.currentPresetIndex = preset.id || 0;

        console.groupEnd();
    }

    /**
     * Animates infinite demo loop of traveling to the presets
     * @param {boolean} random Determines whether presets are looped in order from 1-9 or ordered randomly
     * @return {Promise<void>}
     */
    async animateDemo(random = true) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentNonColorAnimations();

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

            // Animate to the current preset.
            await this.animateTravelToPresetWithRandomRotation(currentPreset, 1000, 500, 5000);

            // Wait after the animation completes.
            await asyncDelay(3500);
        }

        console.log(`Demo interrupted.`);
        console.groupEnd();
    }

    // endregion--------------------------------------------------------------------------------------------------------
}
