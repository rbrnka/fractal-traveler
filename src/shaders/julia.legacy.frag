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
const int MAX_ITERATIONS = __MAX_ITER__;

// Define color stops as individual constants (RGB values in [0,1]).
// Default stops (black, orange, white, blue, dark blue).

// Interpolates between the five color stops.
// 5 stops = 4 segments.
vec3 getColorFromMap(float t) {
    float segment = 1.0 / 4.0;
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
        // After the sine modulation
        t = 0.5 + 0.6 * sin(t * 4.0 * 3.14159265);

        // Lookup the color from the map
        vec3 col = getColorFromMap(t);

        // Use the user-defined color palette as a tint
        // col *= u_colorPalette;

        gl_FragColor = vec4(col, 1.0);
    }
}