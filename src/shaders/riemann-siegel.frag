/**
 * Riemann Zeta function using the Riemann-Siegel formula
 * Accurate for large Im(s), enabling exploration of high zeros
 * like the Lehmer phenomenon (~t=7005) and beyond
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
// Riemann-Siegel theta function
// θ(t) = arg(Γ(1/4 + it/2)) - (t/2)·log(π)
// Using Stirling approximation for large t
// ─────────────────────────────────────────────────────────────────────────────

float rsTheta(float t) {
    if (t < 1.0) {
        // Small t approximation
        return (t / 2.0) * log(max(t, 0.1) / TWO_PI) - t / 2.0 - PI / 8.0;
    }

    float t2 = t * t;
    float t3 = t2 * t;
    float t5 = t3 * t2;

    // Stirling expansion with more terms for accuracy
    return (t / 2.0) * log(t / TWO_PI)
         - t / 2.0
         - PI / 8.0
         + 1.0 / (48.0 * t)
         + 7.0 / (5760.0 * t3)
         + 31.0 / (80640.0 * t5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Riemann-Siegel C0 coefficient
// C0(p) = cos(2π(p² - p - 1/16)) / cos(2πp)
// ─────────────────────────────────────────────────────────────────────────────

float C0(float p) {
    float cos2pip = cos(TWO_PI * p);
    if (abs(cos2pip) < 1e-8) return 0.0;
    return cos(TWO_PI * (p * p - p - 0.0625)) / cos2pip;
}

// Higher order C coefficients for improved accuracy
float C1(float p) {
    float cos2pip = cos(TWO_PI * p);
    if (abs(cos2pip) < 1e-8) return 0.0;
    float sin2pip = sin(TWO_PI * p);
    // Simplified C1
    return -sin2pip * (PI * PI * PI) / (3.0 * cos2pip * cos2pip * cos2pip);
}

float C2(float p) {
    float cos2pip = cos(TWO_PI * p);
    if (abs(cos2pip) < 1e-8) return 0.0;
    // Simplified C2 approximation
    float p2 = p * p;
    return cos(TWO_PI * (p2 - p)) * 0.05 / (cos2pip * cos2pip);
}

// ─────────────────────────────────────────────────────────────────────────────
// Riemann-Siegel Z function
// Z(t) is real-valued: ζ(½+it) = e^(-iθ(t)) · Z(t)
// Z(t) = 2·Σ_{n=1}^{N} n^(-1/2)·cos(θ(t) - t·ln(n)) + R(t)
// ─────────────────────────────────────────────────────────────────────────────

float rsZ(float t) {
    float absT = abs(t);

    // For very small t, Z(t) varies smoothly
    if (absT < 2.0) {
        // Use series approximation near t=0
        // Z(0) ≈ -1.46 (related to ζ(1/2))
        float th = rsTheta(absT);
        float sum = 0.0;
        for (int n = 1; n <= 50; n++) {
            float nf = float(n);
            sum += cos(th - absT * log(nf)) / sqrt(nf);
        }
        return 2.0 * sum;
    }

    // Main Riemann-Siegel computation
    float sqrtTOver2Pi = sqrt(absT / TWO_PI);
    int N = int(floor(sqrtTOver2Pi));
    float p = sqrtTOver2Pi - float(N);

    float th = rsTheta(absT);

    // Main sum: 2·Σ_{n=1}^{N} cos(θ - t·ln(n)) / √n
    float sum = 0.0;
    for (int n = 1; n <= MAX_TERMS; n++) {
        if (n > N) break;
        float nf = float(n);
        sum += cos(th - absT * log(nf)) / sqrt(nf);
    }
    sum *= 2.0;

    // Remainder term R(t)
    float sign = mod(float(N), 2.0) < 0.5 ? 1.0 : -1.0;
    float factor = pow(absT / TWO_PI, -0.25);

    // First correction term
    float R = sign * factor * C0(p);

    // Higher order corrections for better accuracy at moderate t
    if (absT > 50.0) {
        float factor1 = factor / sqrtTOver2Pi;
        R -= sign * factor1 * C1(p);

        if (absT > 200.0) {
            float factor2 = factor1 / sqrtTOver2Pi;
            R += sign * factor2 * C2(p);
        }
    }

    return sum + R;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert Z(t) back to ζ(½+it)
// ζ(½+it) = e^(-iθ(t)) · Z(t) = Z(t)·(cos(θ) - i·sin(θ))
// ─────────────────────────────────────────────────────────────────────────────

vec2 zetaFromZ(float t) {
    float Zt = rsZ(abs(t));
    float th = rsTheta(abs(t));

    // ζ(½+it) = Z(t) · e^(-iθ)
    vec2 result = vec2(Zt * cos(th), -Zt * sin(th));

    // For negative t: ζ(½-it) = conj(ζ(½+it))
    if (t < 0.0) {
        result.y = -result.y;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: Dirichlet eta for off-critical-line points
// ─────────────────────────────────────────────────────────────────────────────

vec2 eta(vec2 s, int terms) {
    vec2 sum = vec2(0.0);
    for (int n = 1; n <= MAX_TERMS; ++n) {
        if (n > terms) break;
        float nf = float(n);
        float sign = mod(nf, 2.0) < 1.0 ? -1.0 : 1.0;
        float scale = 1.0 / pow(nf, s.x);
        float angle = -s.y * log(nf);
        vec2 term = sign * vec2(scale * cos(angle), scale * sin(angle));
        if (length(term) < 1e-8) break;
        sum += term;
    }
    return sum;
}

vec2 etaZeta(vec2 s, int terms) {
    vec2 etaVal = eta(s, terms);
    float expReal = exp((1.0 - s.x) * LOG2);
    float expImag = -s.y * LOG2;
    vec2 twoPow = vec2(expReal * cos(expImag), expReal * sin(expImag));
    vec2 denom = vec2(1.0 - twoPow.x, -twoPow.y);
    return c_div(etaVal, denom);
}

// ─────────────────────────────────────────────────────────────────────────────
// Functional equation for Re(s) < 0
// ζ(s) = 2^s · π^(s-1) · sin(πs/2) · Γ(1-s) · ζ(1-s)
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

// ─────────────────────────────────────────────────────────────────────────────
// Main zeta function - uses Riemann-Siegel on critical line
// ─────────────────────────────────────────────────────────────────────────────

vec2 zeta(vec2 s) {
    int terms = int(u_iterations);
    float distFromCritical = abs(s.x - 0.5);

    // Use Riemann-Siegel near critical line with smooth blending
    if (distFromCritical < 0.15 && s.x > 0.0) {
        vec2 rsResult = zetaFromZ(s.y);

        // Pure RS near the line, blend toward eta at edges
        if (distFromCritical < 0.02) {
            return rsResult;
        }

        // Smooth blend between RS and eta in transition zone
        vec2 etaResult = etaZeta(s, terms);
        float blend = smoothstep(0.02, 0.15, distFromCritical);
        return mix(rsResult, etaResult, blend);
    }

    // For Re(s) > 0, use eta method
    if (s.x > 0.0) {
        return etaZeta(s, terms);
    }

    // For Re(s) <= 0, use functional equation in log space
    vec2 s1 = vec2(1.0 - s.x, -s.y);
    vec2 zeta1s = etaZeta(s1, terms);

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
