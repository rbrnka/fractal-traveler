import {updateInfo, updateJuliaSliders} from "./ui";
import {FractalRenderer} from "./fractalRenderer";
import {easeInOut, isTouchDevice, lerp} from "./utils";

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

        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_ZOOM = 3.5;
        this.DEFAULT_PALETTE = [1.0, 1.0, 1.0];
        this.DEFAULT_C = isTouchDevice() ? [0.355, 0.355] : [-0.246, 0.64];

        this.zoom = this.DEFAULT_ZOOM;
        this.pan = this.DEFAULT_PAN.slice(); // Copy
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = this.DEFAULT_PALETTE.slice();

        /**
         * Julia-specific presets
         */
        this.PRESETS = [
            {c: this.DEFAULT_C, zoom: this.DEFAULT_ZOOM, rotation: this.DEFAULT_ROTATION, pan: this.DEFAULT_PAN},
            {c: [0.34, -0.05], zoom: 3.5, rotation: 90 * (Math.PI / 180), pan: [0, 0]},
            {c: [0.285, 0.01], zoom: 3.5, rotation: 90 * (Math.PI / 180), pan: [0, 0]}, // Near Julia set border
            {c: [0.45, 0.1428], zoom: 3.5, rotation: 90 * (Math.PI / 180), pan: [0, 0]},
            {c: [-0.4, 0.6], zoom: 3.5, rotation: 120 * (Math.PI / 180), pan: [0, 0]},
            {c: [-0.70176, -0.3842], zoom: 3.5, rotation: 150 * (Math.PI / 180), pan: [0, 0]},
            {c: [-0.835, -0.232], zoom: 3.5, rotation: 150 * (Math.PI / 180), pan: [0, 0]}, // Spiral structure
            {c: [-0.75, 0.1], zoom: 3.5, rotation: 150 * (Math.PI / 180), pan: [0, 0]}, // Main cardioid
            {c: [-0.1, 0.651], zoom: 3.5, rotation: 150 * (Math.PI / 180), pan: [0, 0]}, // Seahorse Valley
            {c: [-1.25066, 0.02012], zoom: 3.5, rotation: 150 * (Math.PI / 180), pan: [0, 0]} // Deep zoom
        ];

        /**
         *  Dive is a special animation loop that first animates cx in given direction and when it reaches set threshold,
         *  it will start animating cy in given direction until its threshold is also hit. Then it loops in the opposite
         *  direction.
         *  @typedef {Object} Dive
         *  @property {number} cxDirection Use -1/+1 for negative/positive direction of the animation
         *  @property {Array.<{phase: Number, phase: Number, phase: Number, phase: Number}>} [phases]
         *      1: animate cx toward dive.endC[0],
         *      2: animate cy toward dive.endC[1],
         *      3: animate cx back toward dive.startC[0],
         *      4: animate cy back toward dive.startC[1]
         * @property {Array.<{panX, panY}>} pan
         * @property {Array.<{cx, cy}>} startC
         * @property {Array.<{cx, cy}>} endC
         * @property {number} zoom
         * @property {number} step
         */

        /**
         * @type Dive[]
         */
        this.DIVES = [
            {
                pan: [0, 0],
                startC: [-0.25190652273600045, 0.637461568487061],
                endC: [-0.2526, 0.6355],
                cxDirection: -1,
                cyDirection: -1,
                rotation: 0,
                zoom: 0.05,
                step: 0.00000005,
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
            },
            {
                pan: [0, 0],
                rotation: 2.6179938779914944,
                zoom: 1.7,
                startC: [-0.246, 0.64],
                step: 0.000005,

                cxDirection: 1,
                cyDirection: 1,
                endC: [-0.2298, 0.67],
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

        this.c = this.DEFAULT_C.slice();
        this.init();
    }

    /**
     * @inheritDoc
     */
    createFragmentShaderSource() {
        return `
            #ifdef GL_ES
            precision mediump float;
            #endif
            
            // Uniforms from your JavaScript code:
            uniform vec2 u_resolution;    // Canvas resolution in pixels.
            uniform vec2 u_pan;           // Pan offset in fractal space.
            uniform float u_zoom;         // Zoom factor.
            uniform float u_iterations;   // For normalizing the smooth iteration count.
            uniform float u_rotation;     // Rotation (in radians).
            uniform vec2 u_c;             // Julia set constant.
            uniform vec3 u_colorPalette;  // Color palette (can be changed by the user).
            
            // Maximum iterations (compile-time constant required by GLSL ES 1.00).
            const int MAX_ITERATIONS = 1000;
            
            // Define color stops as individual constants (RGB values in [0,1]).
            // Default stops (black, orange, white, blue, dark blue).
            const vec3 stop0 = vec3(0.0, 0.0, 0.0);       // Black
            const vec3 stop1 = vec3(1.0, 0.647, 0.0);     // Orange
            const vec3 stop2 = vec3(1.0, 1.0, 1.0);       // White
            const vec3 stop3 = vec3(0.0, 0.0, 1.0);       // Blue
            const vec3 stop4 = vec3(0.0, 0.0, 0.5);       // Dark Blue
            
            // Interpolates between the five color stops.
            // 5 stops = 4 segments.
            vec3 getColorFromMap(float t) {
                float step = 1.0 / 4.0; // size of one segment
                if(t <= step) {
                    return mix(stop0, stop1, t / step);
                } else if(t <= 2.0 * step) {
                    return mix(stop1, stop2, (t - step) / step);
                } else if(t <= 3.0 * step) {
                    return mix(stop2, stop3, (t - 2.0 * step) / step);
                } else {
                    return mix(stop3, stop4, (t - 3.0 * step) / step);
                }
            }
            
            void main() {
                // Map fragment coordinates to normalized device coordinates.
                float aspect = u_resolution.x / u_resolution.y;
                vec2 st = gl_FragCoord.xy / u_resolution;
                st -= 0.5;       // center at (0,0)
                st.x *= aspect;  // adjust x for aspect ratio
            
                // Apply rotation.
                float cosR = cos(u_rotation);
                float sinR = sin(u_rotation);
                vec2 rotated = vec2(
                    st.x * cosR - st.y * sinR,
                    st.x * sinR + st.y * cosR
                );
                
                // Map screen coordinates to Julia space.
                vec2 z = rotated * u_zoom + u_pan;
                
                // Determine escape iterations.
                int iterCount = MAX_ITERATIONS;
                for (int i = 0; i < MAX_ITERATIONS; i++) {
                    if (dot(z, z) > 4.0) {
                        iterCount = i;
                        break;
                    }
                    // Julia set iteration.
                    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + u_c;
                }
                
                // If the point never escaped, render as simple color.
                if (iterCount == MAX_ITERATIONS) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    // Compute a smooth iteration value.
                    float smoothColor = float(iterCount) - log2(log2(dot(z, z)));
                    float t = clamp(smoothColor / u_iterations, 0.0, 1.0);
                    
                    // Apply a sine modulation to mimic the "sine" color mapping effect.
                    // Frequency: 4π
                    t = 0.5 + 0.6 * sin(t * 4.0 * 3.14159265);
                    
                    // Lookup the color from the map.
                    vec3 col = getColorFromMap(t);
                    
                    // Use the user-defined color palette as a tint.
                    col *= u_colorPalette;
                    
                    gl_FragColor = vec4(col, 1.0);
                }
            }
         `;
    }

    /**
     * @inheritDoc
     */
    draw() {
        this.gl.useProgram(this.program);
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Update the viewport.
        this.gl.viewport(0, 0, w, h);

        if (this.resolutionLoc === undefined) {
            // Cache the resolution location if not already cached.
            this.resolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
        }
        if (this.resolutionLoc) {
            this.gl.uniform2f(this.resolutionLoc, w, h);
        }

        this.updateUniforms();

        this.gl.uniform2fv(this.panLoc, this.pan);
        this.gl.uniform1f(this.zoomLoc, this.zoom);
        this.gl.uniform1f(this.rotationLoc, this.rotation);

        // Dynamically calculate iterations
        const baseIters = Math.floor(3000 * Math.pow(2, -Math.log2(this.zoom)));
        const iters = Math.min(2000, baseIters + this.extraIterations);
        this.gl.uniform1f(this.iterLoc, iters);

        this.gl.uniform3fv(this.colorLoc, this.colorPalette);

        // Pass Julia constant `c`
        const cLoc = this.gl.getUniformLocation(this.program, 'u_c');
        this.gl.uniform2fv(cLoc, this.c);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * @inheritDoc
     */
    reset() {
        this.c = this.DEFAULT_C.slice();
        super.reset();
    }

    /**
     * TODO Test function to randomize the inner palette stops.
     */
    randomizeInnerPalette() {
        // Generate three random inner stops.
        // Each stop is an array of three numbers in [0, 1].
        const innerStops = [];
        for (let i = 0; i < 3; i++) {
            innerStops.push(Math.random()); // red
            innerStops.push(Math.random()); // green
            innerStops.push(Math.random()); // blue
        }
        // Convert to a Float32Array.
        const innerStopsArray = new Float32Array(innerStops);

        this.gl.useProgram(this.program);
        this.gl.uniform3fv(this.innerStopsLoc, innerStopsArray);
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Animation Methods
    // -----------------------------------------------------------------------------------------------------------------

    /**
     * @inheritDoc
     */
    animateZoom(targetZoom, duration, callback) {
        const startZoom = this.zoom;
        const self = this;
        let startTime = null;

        function stepZoom(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            self.zoom = startZoom * Math.pow(targetZoom / startZoom, progress);
            self.draw();
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepZoom);
            } else if (callback) {
                callback(); // Execute callback after zoom finishes
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepZoom);
    }

    /**
     * Animates Julia from current C to target C
     *
     * @param targetC
     * @param duration transition duration
     * @param callback once finished
     */
    animateToC(targetC = this.DEFAULT_C.slice(), duration = 500, callback = null) {
        if (this.c[0] === targetC[0] && this.c[1] === targetC[1]) return;

        this.stopCurrentNonColorAnimation();

        const self = this;
        const startC = self.c;

        let startTime = null;

        function stepAdjustC(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            // Apply eased progress
            const easedProgress = easeInOut(progress);

            // Interpolate `c` smoothly
            self.c[0] = lerp(startC[0], targetC[0], easedProgress);
            self.c[1] = lerp(startC[1], targetC[1], easedProgress);

            // Redraw with updated values
            self.draw();
            updateJuliaSliders();
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepAdjustC);
            } else {
                self.updateInfoOnAnimationFinished();
                if (callback) callback();
            }
        }

        self.currentAnimationFrame = requestAnimationFrame(stepAdjustC);
    }

    /**
     * Animates travel to a preset.
     * @param {object} preset
     *      @param {Array} preset.c [x, yi]
     *      @param {Array} preset.pan [fx, fy]
     *      @param {number} preset.zoom
     *      @param {number} preset.rotation in rad
     * @param {number} transitionDuration in ms
     * @param {function()} onFinishedCallback A callback method executed once the animation is finished
     */
    animateTravelToPreset(preset, transitionDuration, onFinishedCallback = null) {
        this.stopCurrentNonColorAnimation();

        const self = this;

        // Adjust to default zoom and pan
        function adjustToDefault(callback) {
            const startZoom = self.zoom;
            const startPan = self.pan.slice();

            const targetPan = self.DEFAULT_PAN.slice();
            const duration = 500; // Zoom-out duration
            let startTime = null;

            function stepAdjust(timestamp) {
                if (!startTime) startTime = timestamp;
                let progress = (timestamp - startTime) / duration;
                if (progress > 1) progress = 1;

                // Interpolate zoom and pan
                self.zoom = lerp(startZoom, self.DEFAULT_ZOOM, progress);
                self.pan[0] = lerp(startPan[0], targetPan[0], progress);
                self.pan[1] = lerp(startPan[1], targetPan[1], progress);

                // Redraw during the adjustment
                self.draw();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepAdjust);
                } else {
                    self.updateInfoOnAnimationFinished();
                    if (callback) callback();
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepAdjust);
        }

        // Transition logic after adjusting to default zoom and pan
        function startTransition() {
            const startC = self.c.slice(); // Copy current `c`
            const startZoom = self.zoom;
            const startPan = self.pan.slice();
            const startRotation = self.rotation;
            let startTime = null;

            function stepTransition(timestamp) {
                if (!startTime) startTime = timestamp;
                let progress = (timestamp - startTime) / transitionDuration;
                if (progress > 1) progress = 1;

                // Apply eased progress
                const easedProgress = easeInOut(progress);

                // Interpolate `c`, `pan`, and rotation smoothly
                self.c[0] = lerp(startC[0], preset.c[0], easedProgress);
                self.c[1] = lerp(startC[1], preset.c[1], easedProgress);
                self.rotation = lerp(startRotation, preset.rotation, progress);
                self.pan[0] = lerp(startPan[0], preset.pan[0], progress);
                self.pan[1] = lerp(startPan[1], preset.pan[1], progress);
                self.zoom = lerp(startZoom, preset.zoom, progress);

                // Redraw with updated values
                self.draw();
                updateJuliaSliders();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepTransition);
                } else {
                    if (onFinishedCallback) onFinishedCallback();
                    self.updateInfoOnAnimationFinished();
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepTransition);
        }

        // Adjust to default if needed, then start preset transition
        if (this.zoom !== this.DEFAULT_ZOOM || this.pan[0] !== this.DEFAULT_PAN[0] || this.pan[1] !== this.DEFAULT_PAN[1]) {
            adjustToDefault(startTransition);
        } else {
            startTransition();
        }
    }
}