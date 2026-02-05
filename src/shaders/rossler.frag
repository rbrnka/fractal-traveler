#ifdef GL_ES
precision mediump float;
#endif

// Uniforms:
uniform vec2 u_resolution;// Canvas resolution in pixels.
uniform vec2 u_pan;// Pan offset in attractor space.
uniform float u_zoom;// Zoom factor.
uniform float u_rotation;// Rotation angle in radians.
uniform vec3 u_params;// Rossler parameters: a, b, c.
uniform vec3 u_colorPalette;// Theme multiplier.
uniform vec3 u_frequency;// Sine wave frequencies per channel.
uniform vec3 u_phase;// Sine wave phase offsets per channel.

// Maximum iterations for the simulation (template-replaced by JS).
const int MAX_ITERATIONS = __MAX_ITER__;
// Time step for RK4 integration.
const float dt = 0.04;

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
    uv -= 0.5;// center at (0,0)
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

    // Zoom-adaptive line thickness: ~3 pixels in world space.
    float threshold = u_zoom * 3.0 / u_resolution.y;

    // Accumulate density: each orbit segment that passes near this pixel
    // contributes to the total. This gives smooth anti-aliased lines and
    // a rich value range for sine-based coloring.
    float density = 0.0;
    vec3 p = vec3(pos, 0.0);
    vec2 prevXY = p.xy;

    for (int i = 0; i < MAX_ITERATIONS; i++) {
        p = rosslerStepRK4(p, u_params);
        // Stability guard: break if orbit diverges.
        if (length(p) > 1e6) break;

        // Distance to segment between previous and current orbit point.
        float d = distToSegment(pos, prevXY, p.xy);
        density += 1.0 - smoothstep(0.0, threshold, d);

        prevXY = p.xy;
    }

    // Soft brightness ramp from density (0→0, ~3→0.78, ~6→0.95, ∞→1).
    float brightness = 1.0 - exp(-density * 0.5);

    // Sine-based palette coloring driven by accumulated density.
    vec3 col = brightness * vec3(
        0.5 + 0.5 * sin(density * u_frequency.r + u_phase.r),
        0.5 + 0.5 * sin(density * u_frequency.g + u_phase.g),
        0.5 + 0.5 * sin(density * u_frequency.b + u_phase.b)
    ) * u_colorPalette;

    gl_FragColor = vec4(col, 1.0);
}
