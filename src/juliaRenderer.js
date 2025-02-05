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

        this.DEFAULT_ROTATION = 0;
        this.DEFAULT_ZOOM = 3.5;
        this.DEFAULT_PAN = [0.0, 0.0];
        this.DEFAULT_PALETTE = [1.0, 0.5, 0.8];
        this.DEFAULT_C = [0.355, 0.355];

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
    }

    createFragmentShaderSource() {
        return `
            precision mediump float;
            
            uniform vec2 u_resolution;
            uniform vec2 u_pan;
            uniform float u_zoom;
            uniform float u_iterations;
            uniform vec3 u_colorPalette;
            uniform float u_rotation; // Rotation in radians
            uniform vec2 u_c; // Julia set constant
            
            void main() {
                // Compute aspect ratio dynamically.
                float aspect = u_resolution.x / u_resolution.y;
                
                // Normalize coordinates based on the current resolution.
                vec2 st = gl_FragCoord.xy / u_resolution;
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
                for (float n = 0.0; n < 1000.0; n++) {
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
    }

    draw() {
        this.gl.useProgram(this.program);
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Update the viewport.
        this.gl.viewport(0, 0, w, h);

        // Update the resolution uniform.
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

        this.draw();
        updateInfo();
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Animation Methods
    // -----------------------------------------------------------------------------------------------------------------

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
                updateInfo(true);

                if (progress < 1) {
                    self.currentAnimationFrame = requestAnimationFrame(stepAdjust);
                } else if (callback) {
                    callback(); // Proceed to preset transition
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