/**
 * Riemann Zeta function using Euler-accelerated Dirichlet eta
 * Provides faster convergence than the naive eta series
 */
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
uniform float u_contourStrength;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float LOG2 = 0.69314718056;
const float LOGPI = 1.14472988585;
const int MAX_TERMS = __MAX_TERMS__;

// ─────────────────────────────────────────────────────────────────────────────
// Complex arithmetic
// ─────────────────────────────────────────────────────────────────────────────

vec2 c_mul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 c_div(vec2 a, vec2 b) {
    float denom = b.x * b.x + b.y * b.y;
    return vec2((a.x * b.x + a.y * b.y) / denom, (a.y * b.x - a.x * b.y) / denom);
}

vec2 c_exp(vec2 z) {
    float ea = exp(z.x);
    return vec2(ea * cos(z.y), ea * sin(z.y));
}

vec2 c_log(vec2 z) {
    return vec2(log(length(z)), atan(z.y, z.x));
}

// ─────────────────────────────────────────────────────────────────────────────
// Accelerated eta using Cohen-Rodriguez Villegas-Zagier algorithm
// This is a simplified version that achieves O(3^(-n)) convergence
// ─────────────────────────────────────────────────────────────────────────────

vec2 acceleratedEta(vec2 s) {
    // Number of terms for acceleration (fixed for shader)
    float n = min(u_iterations, 64.0);

    // Compute d_n coefficient iteratively
    // d_k = sum_{j=0}^k n!/(j!(n-j)!) * (n+j)!/(2j)! / 4^j
    float d = 0.0;
    float term = 1.0;  // Tracks n! * (n+j)! / (j! * (n-j)! * (2j)! * 4^j)

    for (int j = 0; j <= MAX_TERMS; j++) {
        if (float(j) >= n) break;
        d += term;
        // Update term for next iteration
        float fj = float(j);
        term *= (n - fj) * (n + fj + 1.0) / ((fj + 1.0) * (2.0 * fj + 2.0) * (2.0 * fj + 1.0) * 0.25);
    }

    // Main sum with acceleration weights
    vec2 sum = vec2(0.0);
    float b = 1.0;  // binomial coefficient
    float c = d;    // current d_k starting from d_0
    term = 1.0;

    for (int k = 0; k <= MAX_TERMS; k++) {
        if (float(k) >= n) break;

        float fk = float(k);
        float kp1 = fk + 1.0;

        // Compute (-1)^k * (d - c_k) * (k+1)^(-s)
        float sign = (mod(fk, 2.0) < 0.5) ? 1.0 : -1.0;
        float scale = 1.0 / pow(kp1, s.x);
        float angle = -s.y * log(kp1);

        vec2 powTerm = vec2(scale * cos(angle), scale * sin(angle));
        sum += sign * (d - c) * powTerm;

        // Update c (running sum of binomial-weighted terms)
        // c_{k+1} = c_k - binom(n,k+1) * term_{k+1}
        b *= (n - fk) / (fk + 1.0);
        term *= (n - fk) * (n + fk + 1.0) / ((fk + 1.0) * (2.0 * fk + 2.0) * (2.0 * fk + 1.0) * 0.25);
        c -= b * term;
    }

    return sum / d;
}

// Convert eta to zeta: ζ(s) = η(s) / (1 - 2^(1-s))
vec2 etaToZeta(vec2 etaVal, vec2 s) {
    float expReal = exp((1.0 - s.x) * LOG2);
    float expImag = -s.y * LOG2;
    vec2 twoPow = vec2(expReal * cos(expImag), expReal * sin(expImag));
    vec2 denom = vec2(1.0 - twoPow.x, -twoPow.y);
    return c_div(etaVal, denom);
}

// Simple eta for fallback
vec2 eta(vec2 s) {
    vec2 sum = vec2(0.0);
    for (int n = 1; n <= MAX_TERMS; ++n) {
        if (float(n) >= u_iterations) break;
        float nf = float(n);
        float sign = (mod(nf, 2.0) < 1.0) ? -1.0 : 1.0;
        float scale = 1.0 / pow(nf, s.x);
        float angle = -s.y * log(nf);
        vec2 term = sign * vec2(scale * cos(angle), scale * sin(angle));
        if (length(term) < 1e-8) break;
        sum += term;
    }
    return sum;
}

vec2 simpleEtaZeta(vec2 s) {
    vec2 etaVal = eta(s);
    return etaToZeta(etaVal, s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Functional equation for Re(s) < 0
// ─────────────────────────────────────────────────────────────────────────────

vec2 c_loggamma(vec2 z) {
    vec2 logsum = vec2(0.0);
    for (int i = 0; i < 12; i++) {
        if (length(z) > 12.0) break;
        float r = length(z);
        float theta = atan(z.y, z.x);
        logsum -= vec2(log(r), theta);
        z += vec2(1.0, 0.0);
    }
    float r = length(z);
    float theta = atan(z.y, z.x);
    vec2 logz = vec2(log(r), theta);
    vec2 zhalf = z - vec2(0.5, 0.0);
    vec2 term1 = c_mul(zhalf, logz);
    return term1 - z + vec2(0.9189385, 0.0) + logsum;
}

vec2 c_sin(vec2 z) {
    float absImag = abs(z.y);
    if (absImag > 20.0) {
        float dominant = z.y > 0.0 ? -z.y : z.y;
        float phase = z.y > 0.0 ? z.x : -z.x;
        float mag = exp(dominant) * 0.5;
        vec2 expTerm = vec2(mag * cos(phase), mag * sin(phase));
        if (z.y > 0.0) {
            return vec2(-expTerm.y, expTerm.x);
        } else {
            return vec2(expTerm.y, -expTerm.x);
        }
    }
    vec2 iz = vec2(-z.y, z.x);
    vec2 eiz = c_exp(iz);
    vec2 emiz = c_exp(vec2(z.y, -z.x));
    vec2 diff = vec2(eiz.x - emiz.x, eiz.y - emiz.y);
    return vec2(diff.y * 0.5, -diff.x * 0.5);
}

vec2 c_logsin(vec2 z) {
    float absImag = abs(z.y);
    if (absImag > 20.0) {
        float logMag = absImag - 0.693147;
        float phase = z.y > 0.0 ? -z.x + PI * 0.5 : z.x - PI * 0.5;
        phase = mod(phase + PI, TWO_PI) - PI;
        return vec2(logMag, phase);
    }
    return c_log(c_sin(z));
}

vec2 analyticZeta(vec2 s) {
    // For Re(s) >= 0.5, use eta-based method
    if (s.x >= 0.5) {
        return simpleEtaZeta(s);
    }

    // For 0 < Re(s) < 0.5, eta still works
    if (s.x > 0.0) {
        return simpleEtaZeta(s);
    }

    // For Re(s) <= 0, use functional equation
    vec2 s1 = vec2(1.0 - s.x, -s.y);
    vec2 zeta1s = simpleEtaZeta(s1);

    if (length(zeta1s) < 1e-30) {
        return vec2(0.0);
    }

    vec2 logTwoS = vec2(s.x * LOG2, s.y * LOG2);
    vec2 logPiSm1 = vec2((s.x - 1.0) * LOGPI, s.y * LOGPI);
    vec2 pis2 = vec2(s.x * PI * 0.5, s.y * PI * 0.5);
    vec2 logSinTerm = c_logsin(pis2);
    vec2 logGammaTerm = c_loggamma(s1);
    vec2 logZeta1s = c_log(zeta1s);

    vec2 logResult = logTwoS + logPiSm1 + logSinTerm + logGammaTerm + logZeta1s;
    return c_exp(logResult);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main zeta
// ─────────────────────────────────────────────────────────────────────────────

vec2 zeta(vec2 s) {
    return analyticZeta(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Color functions
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

    float cosR = cos(u_rotation);
    float sinR = sin(u_rotation);
    vec2 rotated = vec2(uv.x * cosR - uv.y * sinR, uv.x * sinR + uv.y * cosR);

    vec2 coord = rotated * u_zoom + u_pan;

    vec2 z = zeta(coord);

    float mag = length(z);
    float phase = atan(z.y, z.x);

    // Phase -> hue
    float hue = mod((phase / TWO_PI) + 1.0, 1.0);

    // Log magnitude for contours
    float logMag = log(mag + 1e-10);

    // Magnitude and phase contours
    float magContour = 0.5 + 0.5 * cos(logMag * TWO_PI);
    float phaseContour = 0.5 + 0.5 * cos(phase * 6.0);
    float contours = 1.0 - u_contourStrength * (1.0 - magContour) - u_contourStrength * (1.0 - phaseContour);

    float saturation = 0.0;

    // Lightness from magnitude
    float tanhArg = logMag * 0.5;
    float e2x = exp(2.0 * clamp(tanhArg, -10.0, 10.0));
    float tanhVal = (e2x - 1.0) / (e2x + 1.0);
    float baseLightness = 0.5 + 0.3 * tanhVal;
    baseLightness = clamp(baseLightness, 0.1, 0.9);

    float lightness = baseLightness * contours;

    vec3 baseColor = hsl2rgb(vec3(hue, saturation, lightness));

    // Frequency modulation
    vec3 freqMod;
    freqMod.r = 0.5 + 0.5 * cos(logMag * u_frequency.r + u_phase.r + phase * 2.0);
    freqMod.g = 0.5 + 0.5 * cos(logMag * u_frequency.g + u_phase.g + phase * 2.0);
    freqMod.b = 0.5 + 0.5 * cos(logMag * u_frequency.b + u_phase.b + phase * 2.0);

    vec3 col = baseColor * u_colorPalette * freqMod;

    // Critical line overlay
    if (u_showCriticalLine) {
        float critDist = abs(coord.x - 0.5);
        float critLine = 1.0 - smoothstep(0.0, 0.003 * u_zoom, critDist);
        col = mix(col, vec3(0.0), critLine * 0.3);
    }

    gl_FragColor = vec4(col, 1.0);
}
