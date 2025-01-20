/**
 * Mandelbrot set renderer
 * @author Radim Brnka
 * @extends FractalRenderer
 */

import {FractalRenderer} from './fractalRenderer.js';

export class MandelbrotRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

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
            
            void main() {
                float aspect = float(${w.toFixed(1)}) / float(${h.toFixed(1)});
                vec2 st = gl_FragCoord.xy / vec2(${w.toFixed(1)}, ${h.toFixed(1)});
                st -= 0.5; // Center
                st.x *= aspect; // Adjust aspect ratio
    
                // Apply rotation matrix
                float cosR = cos(u_rotation);
                float sinR = sin(u_rotation);
                vec2 rotated = vec2(
                    st.x * cosR - st.y * sinR,
                    st.x * sinR + st.y * cosR
                );
    
                // Scale and translate
                vec2 c = rotated * u_zoom + u_pan;
    
                // Fractal computation (e.g., Mandelbrot set)
                vec2 z = vec2(0.0, 0.0);
                float i;
                for (float n = 0.0; n < 10000.0; n++) {
                    if (n >= u_iterations || dot(z, z) > 4.0) {
                        i = n;
                        break;
                    }
                    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
                }
            
                if (i >= u_iterations) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    float color = i / 100.0;
                    vec3 fractalColor = vec3(
                        sin(color * 1.571),
                        sin(color * 6.283),
                        sin(color * 3.142)
                    );
                    fractalColor *= u_colorPalette;
                    gl_FragColor = vec4(fractalColor, 1.0);
                }
            }
        `;
    }

    draw() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.updateUniforms();

        this.gl.uniform2fv(this.panLoc, this.pan);
        this.gl.uniform1f(this.zoomLoc, this.zoom);
        this.gl.uniform1f(this.rotationLoc, this.rotation);

        // const baseIters = Math.floor(100 * Math.pow(2, -Math.log2(this.zoom)));
        // const iters = Math.min(10000, baseIters + this.extraIterations);
        const baseIters = Math.floor(1000 * Math.pow(2, -Math.log2(this.zoom)));
        const iters = Math.min(50000, baseIters + this.extraIterations);

        this.gl.uniform1f(this.iterLoc, iters);
        this.gl.uniform3fv(this.colorLoc, this.colorPalette);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
