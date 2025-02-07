/**
 * Julia set renderer
 * @author Radim Brnka
 * @extends FractalRenderer
 */

import {updateInfo, updateJuliaSliders} from "./ui";
import {FractalRenderer} from "./fractalRenderer";
import {isTouchDevice} from "./utils";

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

        this.PRESETS = [
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

        this.c = this.DEFAULT_C.slice();
        this.init();
    }

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
        const iters = Math.min(1000, baseIters + this.extraIterations);
        this.gl.uniform1f(this.iterLoc, iters);

        this.gl.uniform3fv(this.colorLoc, this.colorPalette);

        // Pass Julia constant `c`
        const cLoc = this.gl.getUniformLocation(this.program, 'u_c');
        this.gl.uniform2fv(cLoc, this.c);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    reset() {
        this.stopCurrentAnimation();
        this.colorPalette = this.DEFAULT_PALETTE.slice();
        this.pan = this.DEFAULT_PAN.slice();
        this.zoom = this.DEFAULT_ZOOM; // Uses the setter!
        this.rotation = this.DEFAULT_ROTATION; // Reset rotation
        this.c = this.DEFAULT_C.slice();
        this.extraIterations = 0;

        this.resizeCanvas();
        this.draw();
        updateInfo();
    }

    /**
     * Test function to randomize the inner palette stops.
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
     * Helper function for ease-in-out timing
     * @param t time step
     * @return {number}
     */
    easeInOut = (t) => {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    /**
     * Helper function for linear interpolation
     * @param start
     * @param end
     * @param t
     * @return {*}
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    }

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
     * @param targetC
     * @param duration transition duration
     * @param callback once finished
     */
    animateToC(targetC = this.DEFAULT_C.slice(), duration = 500, callback = null) {
        if (this.c[0] === targetC[0] && this.c[1] === targetC[1]) return;

        this.stopCurrentAnimation();

        const self = this;
        const startC = self.c;

        let startTime = null;

        function stepAdjustC(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;

            // Apply eased progress
            const easedProgress = self.easeInOut(progress);

            // Interpolate `c` smoothly
            self.c[0] = self.lerp(startC[0], targetC[0], easedProgress);
            self.c[1] = self.lerp(startC[1], targetC[1], easedProgress);

            // Redraw with updated values
            self.draw();
            updateJuliaSliders();
            updateInfo(true);

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepAdjustC);
            } else {
                self.onAnimationFinished();
                if (callback) callback();
            }
        }

        self.currentAnimationFrame = requestAnimationFrame(stepAdjustC);
    }

    animateTravelToPreset(preset, transitionDuration, onFinishedCallback = null) {
        this.stopCurrentAnimation();

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
                self.zoom = self.lerp(startZoom, self.DEFAULT_ZOOM, progress);
                self.pan[0] = self.lerp(startPan[0], targetPan[0], progress);
                self.pan[1] = self.lerp(startPan[1], targetPan[1], progress);

                // Redraw during the adjustment
                self.draw();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepAdjust);
                } else {
                    self.onAnimationFinished();
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
                const easedProgress = self.easeInOut(progress);

                // Interpolate `c`, `pan`, and rotation smoothly
                self.c[0] = self.lerp(startC[0], preset.c[0], easedProgress);
                self.c[1] = self.lerp(startC[1], preset.c[1], easedProgress);
                self.rotation = self.lerp(startRotation, preset.rotation, progress);
                self.pan[0] = self.lerp(startPan[0], preset.pan[0], progress);
                self.pan[1] = self.lerp(startPan[1], preset.pan[1], progress);
                self.zoom = self.lerp(startZoom, preset.zoom, progress);

                // Redraw with updated values
                self.draw();
                updateJuliaSliders();
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepTransition);
                } else {
                    // Ensure exact final values
                    self.c = preset.c.slice();
                    self.onAnimationFinished();
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