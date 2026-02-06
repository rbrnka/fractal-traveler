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

// Complex multiplication
vec2 c_mul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex exponential: e^(a+bi) = e^a * (cos(b) + i*sin(b))
vec2 c_exp(vec2 z) {
    float ea = exp(z.x);
    return vec2(ea * cos(z.y), ea * sin(z.y));
}

// Complex sine: sin(z) = (e^(iz) - e^(-iz)) / 2i
vec2 c_sin(vec2 z) {
    vec2 iz = vec2(-z.y, z.x);
    vec2 eiz = c_exp(iz);
    vec2 emiz = c_exp(vec2(z.y, -z.x));
    vec2 diff = vec2(eiz.x - emiz.x, eiz.y - emiz.y);
    // Divide by 2i: (a+bi)/(2i) = (b-ai)/2 = (b/2, -a/2)
    return vec2(diff.y * 0.5, -diff.x * 0.5);
}

// Approximate log-gamma using Stirling's approximation for |z| > 10
// For smaller |z|, use recurrence: log(Gamma(z)) = log(Gamma(z+1)) - log(z)
vec2 c_loggamma(vec2 z) {
    // Shift z to larger values using recurrence
    vec2 logsum = vec2(0.0);
    for (int i = 0; i < 10; i++) {
        if (length(z) > 10.0) break;
        // log(Gamma(z)) = log(Gamma(z+1)) - log(z)
        float r = length(z);
        float theta = atan(z.y, z.x);
        logsum -= vec2(log(r), theta);
        z += vec2(1.0, 0.0);
    }
    // Stirling: log(Gamma(z)) ~ (z-0.5)*log(z) - z + 0.5*log(2*pi)
    float r = length(z);
    float theta = atan(z.y, z.x);
    vec2 logz = vec2(log(r), theta);
    vec2 zhalf = z - vec2(0.5, 0.0);
    vec2 term1 = c_mul(zhalf, logz);
    vec2 result = term1 - z + vec2(0.9189385, 0.0); // 0.5*log(2*pi)
    return result + logsum;
}

// Complex gamma via exp(loggamma)
vec2 c_gamma(vec2 z) {
    return c_exp(c_loggamma(z));
}

// Eta-based analytic continuation (works for Re(s) > 0)
vec2 etaZeta(vec2 s) {
    vec2 etaVal = eta(s);
    float log2 = 0.69314718;
    float expReal = exp((1.0 - s.x) * log2);
    float expImag = -s.y * log2;
    vec2 twoPow = vec2(expReal * cos(expImag), expReal * sin(expImag));
    vec2 denom = vec2(1.0 - twoPow.x, -twoPow.y);
    return c_div(etaVal, denom);
}

// Full analytic continuation using functional equation for Re(s) < 0.5
// zeta(s) = 2^s * pi^(s-1) * sin(pi*s/2) * Gamma(1-s) * zeta(1-s)
vec2 analyticZeta(vec2 s) {
    // For Re(s) >= 0.5, use eta method directly
    if (s.x >= 0.5) {
        return etaZeta(s);
    }

    // For Re(s) < 0.5, use functional equation to reflect to Re(1-s) > 0.5
    vec2 s1 = vec2(1.0 - s.x, -s.y); // 1 - s
    vec2 zeta1s = etaZeta(s1);

    // 2^s
    float log2 = 0.69314718;
    vec2 twoS = c_exp(vec2(s.x * log2, s.y * log2));

    // pi^(s-1)
    float logpi = 1.1447298; // log(pi)
    vec2 sm1 = vec2(s.x - 1.0, s.y);
    vec2 piSm1 = c_exp(vec2(sm1.x * logpi, sm1.y * logpi));

    // sin(pi*s/2)
    vec2 pis2 = vec2(s.x * PI * 0.5, s.y * PI * 0.5);
    vec2 sinTerm = c_sin(pis2);

    // Gamma(1-s)
    vec2 gammaTerm = c_gamma(s1);

    // Combine: 2^s * pi^(s-1) * sin(pi*s/2) * Gamma(1-s) * zeta(1-s)
    vec2 result = c_mul(twoS, piSm1);
    result = c_mul(result, sinTerm);
    result = c_mul(result, gammaTerm);
    result = c_mul(result, zeta1s);

    return result;
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

    // Phase -> hue (domain coloring)
    float hue = mod((phase / (2.0 * PI)) + 1.0, 1.0);

    // Enhanced domain coloring with contour lines (Wikipedia style)
    // Log magnitude for contour spacing
    float logMag = log(mag + 1e-10);

    // Magnitude contours: create bands based on log(|z|)
    float magContour = 0.5 + 0.5 * cos(logMag * 2.0 * PI);

    // Phase contours: create bands based on argument (12 sectors)
    float phaseContour = 0.5 + 0.5 * cos(phase * 6.0);

    // Combine contours for grid-like effect
    float contourStrength = 0.15;
    float contours = 1.0 - contourStrength * (1.0 - magContour) - contourStrength * (1.0 - phaseContour);

    // Base saturation - high for vivid colors
    float saturation = 0.0;

    // Lightness based on magnitude with smooth falloff
    // Zeros (mag near 0) become dark, poles (mag large) become bright
    // tanh approximation: tanh(x) = (exp(2x)-1)/(exp(2x)+1)
    float tanhArg = logMag * 0.5;
    float e2x = exp(2.0 * clamp(tanhArg, -10.0, 10.0));
    float tanhVal = (e2x - 1.0) / (e2x + 1.0);
    float baseLightness = 0.5 + 0.3 * tanhVal;
    baseLightness = clamp(baseLightness, 0.1, 0.9);

    // Apply contour modulation to lightness
    float lightness = baseLightness * contours;

    // HSL base color
    vec3 baseColor = hsl2rgb(vec3(hue, saturation, lightness));

    // Apply palette modulation
    vec3 col = baseColor * u_colorPalette;

    // Critical line overlay at Re(s) = 0.5
    if (u_showCriticalLine) {
        float critDist = abs(coord.x - 0.5);
        float critLine = 1.0 - smoothstep(0.0, 0.003 * u_zoom, critDist);
        col = mix(col, vec3(1.0), critLine * 0.3);
    }

    gl_FragColor = vec4(col, 1.0);
}
