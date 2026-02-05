precision highp float;

uniform vec2 u_resolution;
uniform float u_zoom;
uniform vec2 u_pan;
uniform float u_rotation;
uniform float u_iterations;
uniform vec3 u_colorPalette;
uniform vec3 u_frequency;
uniform vec3 u_phase;
uniform bool u_showCriticalLine;
uniform bool u_useAnalyticExtension;

const float PI = 3.14159265359;
const int MAX_TERMS = __MAX_TERMS__;

// HSL to RGB conversion function.
vec3 hsl2rgb(vec3 hsl) {
    float h = hsl.x, s = hsl.y, l = hsl.z;
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hprime = h * 6.0;
    float x = c * (1.0 - abs(mod(hprime, 2.0) - 1.0));
    vec3 rgb;
    if (0.0 <= hprime && hprime < 1.0) {
        rgb = vec3(c, x, 0.0);
    } else if (1.0 <= hprime && hprime < 2.0) {
        rgb = vec3(x, c, 0.0);
    } else if (2.0 <= hprime && hprime < 3.0) {
        rgb = vec3(0.0, c, x);
    } else if (3.0 <= hprime && hprime < 4.0) {
        rgb = vec3(0.0, x, c);
    } else if (4.0 <= hprime && hprime < 5.0) {
        rgb = vec3(x, 0.0, c);
    } else {
        rgb = vec3(c, 0.0, x);
    }
    float m = l - 0.5 * c;
    return rgb + vec3(m);
}

// Basic complex division.
vec2 c_div(vec2 a, vec2 b) {
    float denom = b.x * b.x + b.y * b.y;
    return vec2((a.x * b.x + a.y * b.y) / denom, (a.y * b.x - a.x * b.y) / denom);
}

// Original zeta series (for Re(s) > 1)
vec2 zeta(vec2 s) {
    vec2 sum = vec2(0.0);
    for (int n = 1; n <= MAX_TERMS; ++n) {
        if (float(n) >= u_iterations) break;
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
    for (int n = 1; n <= MAX_TERMS; ++n) {
        if (float(n) >= u_iterations) break;
        float nf = float(n);
        float sign = (mod(nf, 2.0) < 1.0) ? -1.0 : 1.0;
        float scale = 1.0 / pow(nf, s.x);
        float angle = -s.y * log(nf);
        vec2 term = sign * vec2(scale * cos(angle), scale * sin(angle));
        if (length(term) < 1e-6) break;
        sum += term;
    }
    return sum;
}

// Analytic continuation: zeta(s) = eta(s) / (1 - 2^(1-s))
vec2 analyticZeta(vec2 s) {
    vec2 etaVal = eta(s);
    float log2 = 0.69314718;// ln(2)
    float expReal = exp((1.0 - s.x) * log2);
    float expImag = -s.y * log2;
    vec2 twoPow = vec2(expReal * cos(expImag), expReal * sin(expImag));
    vec2 denom = vec2(1.0 - twoPow.x, 0.0 - twoPow.y);
    return c_div(etaVal, denom);
}

void main() {
    // Map pixel coordinates to the fractal plane.
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

    // Apply rotation.
    float cosR = cos(u_rotation);
    float sinR = sin(u_rotation);
    vec2 rotated = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR);

    vec2 coord = rotated * u_zoom + u_pan;

    vec2 z;
    if (u_useAnalyticExtension)
        z = analyticZeta(coord);
    else
        z = zeta(coord);

    float mag = length(z);
    float phase = atan(z.y, z.x);

    // Phase -> hue (keep domain coloring structure)
    float hue = mod((phase / (2.0 * PI)) + 1.0, 1.0);
    float lightness = smoothstep(0.0, 1.0, log(mag + 1.0));

    // HSL base color
    vec3 baseColor = hsl2rgb(vec3(hue, 1.0, lightness));

    // Apply palette modulation: tint the domain coloring with the palette
    vec3 col = baseColor * u_colorPalette;

    // Critical line overlay at Re(s) = 0.5
    if (u_showCriticalLine) {
        float critDist = abs(coord.x - 0.5);
        float critLine = 1.0 - smoothstep(0.0, 0.003 * u_zoom, critDist);
        col = mix(col, vec3(1.0), critLine * 0.3);
    }

    gl_FragColor = vec4(col, 1.0);
}
