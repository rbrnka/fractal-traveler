/**
 * Julia set renderer
 * @author Radim Brnka
 * @extends FractalRenderer
 */

import {updateInfo, updateJuliaSliders} from "./ui";
import {FractalRenderer} from "./fractalRenderer";

export class JuliaRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_ROTATION = 90 * (Math.PI / 180);
        this.DEFAULT_ZOOM = 3.5;
        this.DEFAULT_PAN = [0.0, 0.0];
        this.DEFAULT_PALETTE = [1.0, 0.5, 0.8];

        this.zoom = this.DEFAULT_ZOOM;
        this.pan = this.DEFAULT_PAN.slice(); // Copy
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = this.DEFAULT_PALETTE.slice();

        this.PRESETS = [
            {c: [0.34, -0.05], zoom: 1, rotation: this.DEFAULT_ROTATION},
            {c: [-0.4, 0.6], zoom: 1, rotation: 120 * (Math.PI / 180)},
            {c: [0.285, 0.01], zoom: 0.02, rotation: this.DEFAULT_ROTATION}, // Near Julia set border
            {c: [-0.70176, -0.3842], zoom: 1, rotation: 45 * (Math.PI / 180)},
            {c: [0.45, 0.1428], zoom: 1, rotation: this.DEFAULT_ROTATION},
            {c: [-0.75, 0.1], zoom: 0.05, rotation: 150 * (Math.PI / 180)}, // Main cardioid
            {c: [-0.1, 0.651], zoom: 0.01, rotation: 150 * (Math.PI / 180)}, // Seahorse Valley
            {c: [-0.835, -0.232], zoom: 0.008, rotation: 150 * (Math.PI / 180)}, // Spiral structure
            {c: [-1.25066, 0.02012], zoom: 0.0005, rotation: 150 * (Math.PI / 180)} // Deep zoom
        ];

        this.c = [0.355, 0.355];
    }

    createFragmentShaderSource() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        return `
            precision mediump float;
            
            uniform vec2 u_pan;
            uniform float u_zoom;
            uniform float u_iterations;
            uniform vec3 u_colorPalette;
            uniform float u_rotation; // Rotation in radians
            uniform vec2 u_c; // Julia set constant
            
            // Color constants (customizable for more variation)
            const vec3 C1 = vec3(1.0, 0.0, 0.0); // Red
            const vec3 C2 = vec3(0.0, 1.0, 0.0); // Green
            const vec3 C3 = vec3(0.0, 0.0, 1.0); // Blue
            const vec3 C4 = vec3(1.0, 1.0, 0.0); // Yellow
            const vec3 C5 = vec3(0.0, 1.0, 1.0); // Cyan
            const vec3 C6 = vec3(1.0, 0.0, 1.0); // Magenta
            
            void main() {
                float aspect = float(${w.toFixed(1)}) / float(${h.toFixed(1)});
                vec2 st = gl_FragCoord.xy / vec2(${w.toFixed(1)}, ${h.toFixed(1)});
                st -= 0.5; // Center the coordinates
                st.x *= aspect; // Adjust aspect ratio
    
                // Apply rotation
                float cosR = cos(u_rotation);
                float sinR = sin(u_rotation);
                vec2 rotated = vec2(
                    st.x * cosR - st.y * sinR,
                    st.x * sinR + st.y * cosR
                );
    
                // Scale and translate
                vec2 z = rotated * u_zoom + u_pan;
    
                // Julia set calculation
                float i;
                for (float n = 0.0; n < 10000.0; n++) {
                    if (n >= u_iterations || dot(z, z) > 4.0) {
                        i = n;
                        break;
                    }
                    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + u_c;
                }
    
                if (i >= u_iterations) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    float smoothColor = i - log2(log2(dot(z, z))) + 4.0;
                    smoothColor = fract(smoothColor * 0.01); // Normalize for smooth color transitions
                    vec3 fractalColor = vec3(
                        sin(smoothColor * 3.283),
                        sin(smoothColor * 6.283),
                        cos(smoothColor * 1.7)
                    );
                    fractalColor *= u_colorPalette;
                    gl_FragColor = vec4(fractalColor, 1.0);
                }
            }
        `;

        /*
         // Color logic
                if (i >= u_iterations) {
                    // Points inside the set
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    // Normalize the escape value
                    float value = i / u_iterations;

                    // Apply a sine wave function for cyclic transitions
                    float t = sin(value * 3.14159 * 6.0); // 6 cycles
                    t = 0.5 + 0.5 * t; // Map to [0, 1]

                    float smoothColor = i - log2(log2(dot(z, z))) + 4.0;
                    smoothColor = fract(smoothColor * 0.01); // Normalize for smooth color transitions

                    // Segment-based color transitions
                    vec3 color;
                    if (t < 0.2) {
                        color = mix(C1, C2, t / 0.2); // Red to Green
                    } else if (t < 0.4) {
                        color = mix(C2, C3, (t - 0.2) / 0.2); // Green to Blue
                    } else if (t < 0.6) {
                        color = mix(C3, C4, (t - 0.4) / 0.2); // Blue to Yellow
                    } else if (t < 0.8) {
                        color = mix(C4, C5, (t - 0.6) / 0.2); // Yellow to Cyan
                    } else {
                        color = mix(C5, C6, (t - 0.8) / 0.2); // Cyan to Magenta
                    }

                    // Apply user-defined palette multiplier
                    color *= smoothColor;

                    // Final color
                    gl_FragColor = vec4(color, 1.0);
         */
    }

    draw() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.updateUniforms();

        this.gl.uniform2fv(this.panLoc, this.pan);
        this.gl.uniform1f(this.zoomLoc, this.zoom);
        this.gl.uniform1f(this.rotationLoc, this.rotation);

        // Dynamically calculate iterations
        const baseIters = Math.floor(1000 * Math.pow(2, -Math.log2(this.zoom)));
        const iters = Math.min(50000, baseIters + this.extraIterations);
        this.gl.uniform1f(this.iterLoc, iters);

        this.gl.uniform3fv(this.colorLoc, this.colorPalette);

        // Pass Julia constant `c`
        const cLoc = this.gl.getUniformLocation(this.program, 'u_c');
        this.gl.uniform2fv(cLoc, this.c);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        updateJuliaSliders();
    }

    reset() {
        this.stopCurrentAnimation();
        this.pan = this.DEFAULT_PAN.slice();
        this.zoom = this.DEFAULT_ZOOM; // Uses the setter!
        this.rotation = this.DEFAULT_ROTATION; // Reset rotation
        this.extraIterations = 0;
        this.resizeCanvas();
        updateInfo(null, false);
        updateJuliaSliders();

        this.draw();
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

            if (progress < 1) {
                self.currentAnimationFrame = requestAnimationFrame(stepZoom);
                updateInfo(null, true);
            } else if (callback) {
                callback(); // Execute callback after zoom finishes
            }
        }

        this.currentAnimationFrame = requestAnimationFrame(stepZoom);
    }

    animateTravelToPreset(preset, transitionDuration) {
        this.stopCurrentAnimation();

        const self = this;

        // Helper function for ease-in-out timing
        function easeInOut(t) {
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        }

        // Helper function for linear interpolation
        function lerp(start, end, t) {
            return start + (end - start) * t;
        }

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

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepAdjust);
                    updateInfo(null, true);
                } else if (callback) {
                    callback(); // Proceed to preset transition
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepAdjust);
        }

        // Transition logic after adjusting to default zoom and pan
        function startTransition() {
            const startC = self.c.slice(); // Copy current `c`
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

                // Redraw with updated values
                self.draw();

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepTransition);
                    updateInfo(null, true);
                } else {
                    // Ensure exact final values
                    self.c = preset.c.slice();
                    self.onAnimationFinished();
                }
            }

            self.currentAnimationFrame = requestAnimationFrame(stepTransition);
        }

        // Adjust to default if needed, then start preset transition
        if (this.zoom < this.DEFAULT_ZOOM || this.pan[0] !== this.DEFAULT_PAN[0] || this.pan[1] !== this.DEFAULT_PAN[1]) {
            adjustToDefault(startTransition);
        } else {
            startTransition();
        }
    }
}