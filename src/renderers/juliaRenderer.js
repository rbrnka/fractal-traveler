import {updateInfo} from "../ui/ui";
import {FractalRenderer} from "./fractalRenderer";
import {compareComplex, hexToRGB, isTouchDevice, lerp, normalizeRotation} from "../global/utils";
import '../global/types';
import {DEFAULT_CONSOLE_GROUP_COLOR, DEG, EASE_TYPE, JULIA_PALETTES,} from "../global/constants";
import {updateJuliaSliders} from "../ui/juliaSlidersController";

/**
 * Julia set renderer
 *
 * @author Radim Brnka
 * @description This module defines a JuliaRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Julia set fractal and sets preset zoom-ins.
 * @extends FractalRenderer
 */
export class JuliaRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_ZOOM = 2.5;
        // Use less detailed initial set for less performant devices
        /** @type COMPLEX */
        this.DEFAULT_C = isTouchDevice() ? [0.355, 0.355] : [-0.246, 0.64235];

        this.zoom = this.DEFAULT_ZOOM;
        this.pan = [...this.DEFAULT_PAN]; // Copy
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = [...this.DEFAULT_PALETTE];

        /** @type COMPLEX */
        this.c = [...this.DEFAULT_C];

        /** @type {Array.<JULIA_PRESET>} */
        this.PRESETS = [
            {
                c: this.DEFAULT_C,
                zoom: this.DEFAULT_ZOOM,
                rotation: this.DEFAULT_ROTATION,
                pan: this.DEFAULT_PAN,
                title: 'Default view'
            },
            {c: [0.34, -0.05], zoom: 3.5, rotation: DEG._90, pan: [0, 0], title: 'Spiral Galaxies'},
            {c: [0.285, 0.01], zoom: 3.5, rotation: DEG._90, pan: [0, 0], title: 'Near Julia set border'},
            {c: [-1.76733, 0.00002], zoom: 0.5, rotation: 0, pan: [0, 0], title: 'Mandelbrothers'},
            {c: [-0.4, 0.6], zoom: 3.5, rotation: DEG._120, pan: [0, 0], title: 'Black Holes'},
            {c: [-0.70176, -0.3842], zoom: 3.5, rotation: DEG._150, pan: [0, 0], title: 'Dancing Snowflakes'},
            {c: [-0.835, -0.232], zoom: 3.5, rotation: DEG._150, pan: [0, 0], title: 'Kissing Dragons'},
            {c: [-0.75, 0.1], zoom: 3.5, rotation: DEG._150, pan: [0, 0], title: 'Main cardioid'},
            {c: [-0.744539860355905, 0.121723773894425], zoom: 1.8, rotation: DEG._30, pan: [0, 0], title: 'Seahorse Valley'},
            {c: [-1.74876455, 0], zoom: 0.45, rotation: DEG._90, pan: [0, 0], title: 'The Cauliflower Medallion'},
            // {c: [0.45, 0.1428], zoom: 3.5, rotation: ROTATION_DEG.R90, pan: [0, 0], title: ''},
            // {c: [-0.1, 0.651], zoom: 3.5, rotation: ROTATION_DEG.R150, pan: [0, 0], title: ''},
            // {c: [-1.25066, 0.02012], zoom: 3.5, rotation: ROTATION_DEG.R150, pan: [0, 0], title: 'Deep zoom'}
        ];

        /** @type {Array.<DIVE>} */
        this.DIVES = [
            {
                pan: [0, 0],
                rotation: 0,
                zoom: 1.7,
                startC: [-0.246, 0.64],
                step: 0.000005,

                cxDirection: 1,
                cyDirection: 1,
                endC: [-0.2298, 0.67],

                title: 'Orbiting Black holes'
            },
            {
                pan: [0, 0],
                startC: [-0.25190652273600045, 0.637461568487061],
                endC: [-0.2526, 0.6355],
                cxDirection: -1,
                cyDirection: -1,
                rotation: 0,
                zoom: 0.05,
                step: 0.00000005,

                title: 'Dimensional Collision'
            },
            {
                pan: [-0.31106298032702495, 0.39370074960517293],
                rotation: 1.4999999999999947,
                zoom: 0.3829664619602934,
                startC: [-0.2523365227360009, 0.6386621652418372],
                step: 0.00001,

                cxDirection: -1,
                cyDirection: -1,
                endC: [-0.335, 0.62],

                title: 'Life of a Star'
            },
            {
                pan: [-0.6838279169792393, 0.46991716118236204],
                rotation: 0,
                zoom: 0.04471011402132469,
                startC: [-0.246, 0.6427128691849591],
                step: 0.0000005,

                cxDirection: -1,
                cyDirection: -1,
                endC: [-0.247, 0.638],

                title: 'Tipping points'
            },
            {
                pan: [0.5160225367869309, -0.05413028639548453],
                rotation: 2.6179938779914944,
                zoom: 0.110783,
                startC: [-0.78, 0.11],
                step: 0.00001,

                cxDirection: 1,
                cyDirection: 1,
                endC: [-0.7425, 0.25],

                title: 'Hypnosis'
            }//, {
            //     pan: [0.47682225091699837, 0.09390869977189013],
            //     rotation: 5.827258771281306,
            //     zoom: 0.16607266879497062,
            //
            //     startC: [-0.750542394776536, 0.008450344098947803],
            //     endC: [-0.7325586,0.18251028375238866],
            //
            //     cxDirection: 1,
            //     cyDirection: 1,
            //
            //     step: 0.00001,
            //     phases: [2, 1, 4, 3],
            // }
        ];

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
        return `
            #ifdef GL_ES
            precision mediump float;
            #endif
            
            // Uniforms
            uniform vec2 u_resolution;    // Canvas resolution in pixels
            uniform vec2 u_pan;           // Pan offset in fractal space
            uniform float u_zoom;         // Zoom factor
            uniform float u_iterations;   // For normalizing the smooth iteration count
            uniform float u_rotation;     // Rotation (in radians)
            uniform vec2 u_c;             // Julia set constant
            uniform vec3 u_colorPalette;  // Color palette
            uniform vec3 u_innerStops[5]; // Color palette inner stops
            
            // Maximum iterations (compile-time constant required by GLSL ES 1.00).
            const int MAX_ITERATIONS = 1000;
            
            // Define color stops as individual constants (RGB values in [0,1]).
            // Default stops (black, orange, white, blue, dark blue).
            
            // Interpolates between the five color stops.
            // 5 stops = 4 segments.
            vec3 getColorFromMap(float t) {
                float segment = 1.0 / 4.0; // 4 segments for 5 stops.
                if (t <= segment) {
                    return mix(u_innerStops[0], u_innerStops[1], t / segment);
                } else if (t <= 2.0 * segment) {
                    return mix(u_innerStops[1], u_innerStops[2], (t - segment) / segment);
                } else if (t <= 3.0 * segment) {
                    return mix(u_innerStops[2], u_innerStops[3], (t - 2.0 * segment) / segment);
                } else {
                    return mix(u_innerStops[3], u_innerStops[4], (t - 3.0 * segment) / segment);
                }
            }
            
            void main() {
                // Map fragment coordinates to normalized device coordinates
                float aspect = u_resolution.x / u_resolution.y;
                vec2 st = gl_FragCoord.xy / u_resolution;
                st -= 0.5;       // center at (0,0)
                st.x *= aspect;  // adjust x for aspect ratio
            
                // Apply rotation
                float cosR = cos(u_rotation);
                float sinR = sin(u_rotation);
                vec2 rotated = vec2(
                    st.x * cosR - st.y * sinR,
                    st.x * sinR + st.y * cosR
                );
                
                // Map screen coordinates to Julia space
                vec2 z = rotated * u_zoom + u_pan;
                
                // Determine escape iterations
                int iterCount = MAX_ITERATIONS;
                for (int i = 0; i < MAX_ITERATIONS; i++) {
                    if (dot(z, z) > 4.0) {
                        iterCount = i;
                        break;
                    }
                    // Julia set iteration.
                    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + u_c;
                }
                
                // If the point never escaped, render as simple color
                if (iterCount == MAX_ITERATIONS) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    // Compute a smooth iteration value
                    float smoothColor = float(iterCount) - log2(log2(dot(z, z)));
                    float t = clamp(smoothColor / u_iterations, 0.0, 1.0);
                    
                    // Apply a sine modulation to mimic the "sine" color mapping effect
                    // Frequency: 4π
                    t = 0.5 + 0.6 * sin(t * 4.0 * 3.14159265);
                    
                    // Lookup the color from the map
                    vec3 col = getColorFromMap(t);
                    
                    // Use the user-defined color palette as a tint
                    // col *= u_colorPalette;
                    
                    gl_FragColor = vec4(col, 1.0);
                }
            }
         `;
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

    /** Stops currently running pan animation */
    stopCurrentCAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentCAnimation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`, 'color: #fff');

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
        console.groupCollapsed(`%c ${this.constructor.name}: animateInnerStopsTransition`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
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

    async animateColorPaletteTransition(duration = 250, coloringCallback = null) {
        this.currentPaletteIndex = (this.currentPaletteIndex + 1) % JULIA_PALETTES.length;

        await this.animateInnerStopsTransition(JULIA_PALETTES[this.currentPaletteIndex], duration, coloringCallback);
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
        console.groupCollapsed(`%c ${this.constructor.name}: animateToC`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopCurrentCAnimation();

        if (compareComplex(this.c, targetC)) {
            console.log(`Already at the target c. Skipping.`);
            console.groupEnd();
            return;
        }

        console.log(`Animating c from ${this.c} to ${targetC}.`);

        const startC = [...this.c];

        await new Promise(resolve => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Interpolate `c` smoothly
                const easedProgress = easeFunction(progress);
                this.c[0] = lerp(startC[0], targetC[0], easedProgress);
                this.c[1] = lerp(startC[1], targetC[1], easedProgress);
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
        console.groupCollapsed(`%c ${this.constructor.name}: animateToZoomAndC`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
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
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
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
     * @inheritDoc
     */
    async animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        return Promise.resolve(); // TODO implement someday if needed
    }

    /**
     * Infinite animation of the dive (c-param interpolations)
     * @param {DIVE} dive
     * @return {Promise<void>}
     */
    async animateDive(dive) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDive`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
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
        console.log(`%c ${this.constructor.name}: animateDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopAllNonColorAnimations();

        this.demoActive = true; // Not used in Julia but the demo is active

        // Return a Promise that never resolves (continuous animation)
        await new Promise(() => {
            const step = () => {
                this.c = [
                    ((Math.sin(this.demoTime) + 1) / 2) * 1.5 - 1,   // Oscillates between -1 and 0.5
                    ((Math.cos(this.demoTime) + 1) / 2) * 1.4 - 0.7  // Oscillates between -0.7 and 0.7
                ];
                this.rotation = normalizeRotation(this.rotation + 0.0001);
                this.demoTime += 0.0005; // Speed

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