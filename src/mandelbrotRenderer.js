/**
 * Mandelbrot set renderer
 * @author Radim Brnka
 * @extends FractalRenderer
 */

import {FractalRenderer} from './fractalRenderer.js';

export class MandelbrotRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_PAN = [-0.5, 0];
        this.pan = this.DEFAULT_PAN.slice();
        this.PRESETS = [
            {pan: [0.351424, 0.063866], zoom: 0.000049},
            {pan: [0.254998, 0.000568], zoom: 0.000045},
            {pan: [-0.164538, 1.038428], zoom: 0.000127},
            {pan: [-0.750700, 0.021415], zoom: 0.000110},
            {pan: [-1.907294, 0.000000], zoom: 0.000451},
            {pan: [-0.766863, -0.107475], zoom: 0.000196},
            {pan: [-0.853569, -0.210814], zoom: 0.000126},
            {pan: [0.337420, 0.047257], zoom: 0.000143},
            {pan: [0.116501, -0.663546], zoom: 0.000104},
            // {pan: [-0.124797, 0.840309], zoom: 0.000628}
        ];

        this.init();
    }

    createFragmentShaderSource() {
        const coloring2 = `
        float color = i / 100.0;
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
                ${coloring2}
            }
        }
    `;
    }

    draw() {
        this.gl.useProgram(this.program);
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.gl.viewport(0, 0, w, h);
        this.gl.uniform2f(this.resolutionLoc, w, h);

        // Update other uniforms...
        this.gl.uniform2fv(this.panLoc, this.pan);
        this.gl.uniform1f(this.zoomLoc, this.zoom);
        this.gl.uniform1f(this.rotationLoc, this.rotation);

        const baseIters = Math.floor(5000 * Math.pow(2, -Math.log2(this.zoom)));
        const iters = Math.min(2000, baseIters + this.extraIterations);
        this.gl.uniform1f(this.iterLoc, iters);
        this.gl.uniform3fv(this.colorLoc, this.colorPalette);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
