#ifdef GL_ES
precision mediump float;
#endif

// Uniforms:
uniform vec2 u_resolution;// Canvas resolution in pixels.
uniform vec2 u_pan;// Pan offset in attractor space.
uniform float u_zoom;// Zoom factor.
uniform float u_rotation;// Rotation angle in radians.
uniform vec3 u_params;// Rossler parameters: a, b, c.
uniform float u_iterations;// Dynamic iteration count (adaptive quality).
uniform vec3 u_colorPalette;// Theme multiplier.
uniform vec3 u_frequency;// Sine wave frequencies per channel.
uniform vec3 u_phase;// Sine wave phase offsets per channel.

// Maximum iterations for the simulation (template-replaced by JS).
const int MAX_ITERATIONS = __MAX_ITER__;
// Time step for RK4 integration (larger = faster but coarser).
const float dt = 0.08;
// Iterations to skip while orbit settles onto attractor.
const int TRANSIENT = 100;
// Early exit threshold - stop when density is saturated.
const float DENSITY_SATURATE = 8.0;

// Rossler system derivative.
vec3 rosslerDerivative(vec3 p, vec3 params) {
    float a = params.x;
    float b = params.y;
    float c = params.z;
    return vec3(
    -p.y - p.z,
    p.x + a * p.y,
    b + p.z * (p.x - c)
    );
}

// Integrate one step using 4th-order Runge-Kutta.
vec3 rosslerStepRK4(vec3 p, vec3 params) {
    vec3 k1 = rosslerDerivative(p, params);
    vec3 k2 = rosslerDerivative(p + 0.5 * dt * k1, params);
    vec3 k3 = rosslerDerivative(p + 0.5 * dt * k2, params);
    vec3 k4 = rosslerDerivative(p + dt * k3, params);
    return p + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

// Shortest distance from point p to line segment a-b.
float distToSegment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float len2 = dot(ab, ab);
    if (len2 < 1e-10) return length(p - a);// degenerate segment
    float t = clamp(dot(p - a, ab) / len2, 0.0, 1.0);
    return length(p - (a + t * ab));
}

void main() {
    // Map fragment coordinates to normalized space.
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = gl_FragCoord.xy / u_resolution;
    uv -= 0.5;
    uv.x *= aspect;

    // Apply rotation.
    float cosR = cos(u_rotation);
    float sinR = sin(u_rotation);
    vec2 rotated = vec2(
    uv.x * cosR - uv.y * sinR,
    uv.x * sinR + uv.y * cosR
    );

    // Apply pan and zoom.
    vec2 pos = rotated * u_zoom + u_pan;

    // Thin line: ~0.75 pixels in world space.
    float threshold = u_zoom * 0.75 / u_resolution.y;

    // Fixed initial condition — all pixels trace the same orbit,
    // producing a smooth distance field (no per-pixel chaos).
    vec3 p = vec3(0.1, 0.0, 0.0);

    // Accumulate density and z-weighted average for smooth coloring.
    float density = 0.0;
    float weightedZ = 0.0;
    vec2 prevXY = p.xy;

    for (int i = 0; i < MAX_ITERATIONS; i++) {
        if (float(i) >= u_iterations) break;
        p = rosslerStepRK4(p, u_params);
        if (length(p) > 1e6) break;

        if (i >= TRANSIENT) {
            float d = distToSegment(pos, prevXY, p.xy);
            float w = 1.0 - smoothstep(0.0, threshold, d);
            density += w;
            weightedZ += w * p.z;
            // Early exit when pixel is saturated
            if (density > DENSITY_SATURATE) break;
        }
        prevXY = p.xy;
    }

    // Quick saturating brightness — even a single pass gives a solid line.
    float brightness = 1.0 - exp(-density * 3.0);

    // Smooth z-average across all nearby orbit passes for spatial gradient.
    float avgZ = density > 0.001 ? weightedZ / density : 0.0;
    float zNorm = clamp(avgZ / u_params.z, 0.0, 1.0);

    // Use frequency and phase to modulate color based on z-depth
    vec3 freqColor = 0.5 + 0.5 * cos(u_frequency * zNorm * 6.2831853 + u_phase);

    // Blend frequency-modulated color with palette
    vec3 baseColor = u_colorPalette * freqColor;

    // 3D depth gradient: darker at the flat spiral, brighter at the spike.
    vec3 col = brightness * mix(
        baseColor * 0.7,
        baseColor * 1.4,
        sqrt(zNorm)
    );

    gl_FragColor = vec4(col, 1.0);
}
