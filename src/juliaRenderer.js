/**
 * Julia set renderer
 * @author Radim Brnka
 * @extends FractalRenderer
 */

import {FractalRenderer} from './fractalRenderer.js';

export class JuliaRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.pan = [0, 5];
        this.colorPalette = [1.0, 0.5, 0.8];

        this.PRESETS = [
            {pan: [0.351424, 0.063866], zoom: 0.000049}
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
    }
}