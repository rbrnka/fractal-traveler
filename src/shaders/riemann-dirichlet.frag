precision highp float;

uniform vec2 u_resolution;
uniform float u_zoom;
uniform vec2 u_pan;
uniform int u_termCount;
uniform bool u_useAnalyticExtension;  // New toggle for analytic extension

const float PI = 3.14159265359;

// Complex arithmetic helpers
vec2 c_div(vec2 a, vec2 b) {
    float denom = b.x * b.x + b.y * b.y;
    return vec2((a.x * b.x + a.y * b.y) / denom, (a.y * b.x - a.x * b.y) / denom);
}

// Original zeta series (for Re(s) > 1)
vec2 zeta(vec2 s) {
    vec2 sum = vec2(0.0);
    for (int n = 1; n <= 100; ++n) {
        if(n > u_termCount) break;
        float nf = float(n);
        float scale = 1.0 / pow(nf, s.x);
        float angle = -s.y * log(nf);
        vec2 term = vec2(scale * cos(angle), scale * sin(angle));
        if (length(term) < 1e-6) break;
        sum += term;
    }
    return sum;
}

// Dirichlet eta series (alternating series)
vec2 eta(vec2 s) {
    vec2 sum = vec2(0.0);
    for (int n = 1; n <= 100; ++n) {
        if(n > u_termCount) break;
        float nf = float(n);
        // Determine sign: odd n gives +1, even n gives -1.
        float sign = (mod(nf, 2.0) < 1.0) ? -1.0 : 1.0;
        float scale = 1.0 / pow(nf, s.x);
        float angle = -s.y * log(nf);
        vec2 term = sign * vec2(scale * cos(angle), scale * sin(angle));
        if (length(term) < 1e-6) break;
        sum += term;
    }
    return sum;
}

// Analytic continuation: ζ(s) = η(s) / (1 - 2^(1-s))
vec2 analyticZeta(vec2 s) {
    vec2 etaVal = eta(s);
    float log2 = 0.69314718; // ln(2)
    float expReal = exp((1.0 - s.x) * log2);
    float expImag = -s.y * log2;
    vec2 twoPow = vec2(expReal * cos(expImag), expReal * sin(expImag));
    vec2 denom = vec2(1.0 - twoPow.x, 0.0 - twoPow.y);
    return c_div(etaVal, denom);
}

void main() {
    // Map pixel coordinates to the fractal plane.
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    vec2 coord = uv * u_zoom + u_pan;

    vec2 z;
    if (u_useAnalyticExtension)
    z = analyticZeta(coord);
    else
    z = zeta(coord);

    float mag = length(z);
    float phase = atan(z.y, z.x);

    vec3 color;
    if (u_useAnalyticExtension) {
        // New color mapping for the analytic extension mode.
        color = vec3(
        0.5 + 0.5 * sin(phase),
        0.5 + 0.5 * sin(phase + 2.0),
        0.5 + 0.5 * sin(phase + 4.0)
        ) * smoothstep(0.0, 1.0, log(mag + 1.0));
    } else {
        // Original color mapping.
        color = vec3(
        0.5 + 0.5 * sin(phase),
        0.5 + 0.5 * sin(phase + 2.0),
        0.5 + 0.5 * sin(phase + 4.0)
        ) * smoothstep(0.0, 1.0, log(mag + 1.0));
    }

    gl_FragColor = vec4(color, 1.0);
}