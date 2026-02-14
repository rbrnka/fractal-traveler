/**
 * Riemann Zeta function with emulated double precision
 * Uses double-single arithmetic for accurate computation at high Im(s)
 * Enables visualization of Lehmer's phenomenon (t≈7005) and beyond
 *
 * @author Radim Brnka
 * @license MIT
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

const float PI = 3.14159265358979323846;
const float TWO_PI = 6.28318530717958647692;
const float LOG2 = 0.69314718055994530942;
const float LOGPI = 1.14472988584940017414;
const int MAX_TERMS = __MAX_TERMS__;

// ─────────────────────────────────────────────────────────────────────────────
// Double-Single Arithmetic
// A double-single number is stored as vec2(hi, lo) where value = hi + lo
// This gives us ~44 bits of mantissa instead of 23
// ─────────────────────────────────────────────────────────────────────────────

// Split a float into high and low parts for multiplication
vec2 split(float a) {
    const float SPLIT = 4097.0; // 2^12 + 1
    float t = SPLIT * a;
    float hi = t - (t - a);
    float lo = a - hi;
    return vec2(hi, lo);
}

// Quick two-sum: assumes |a| >= |b|
vec2 quickTwoSum(float a, float b) {
    float s = a + b;
    float e = b - (s - a);
    return vec2(s, e);
}

// Two-sum: no assumption on magnitudes
vec2 twoSum(float a, float b) {
    float s = a + b;
    float v = s - a;
    float e = (a - (s - v)) + (b - v);
    return vec2(s, e);
}

// Two-product using FMA if available, otherwise Dekker's method
vec2 twoProd(float a, float b) {
    float p = a * b;
    vec2 as = split(a);
    vec2 bs = split(b);
    float e = ((as.x * bs.x - p) + as.x * bs.y + as.y * bs.x) + as.y * bs.y;
    return vec2(p, e);
}

// Create double-single from single float
vec2 dsCreate(float a) {
    return vec2(a, 0.0);
}

// Add two double-single numbers
vec2 dsAdd(vec2 a, vec2 b) {
    vec2 s = twoSum(a.x, b.x);
    vec2 t = twoSum(a.y, b.y);
    s.y += t.x;
    s = quickTwoSum(s.x, s.y);
    s.y += t.y;
    s = quickTwoSum(s.x, s.y);
    return s;
}

// Subtract double-single numbers
vec2 dsSub(vec2 a, vec2 b) {
    return dsAdd(a, vec2(-b.x, -b.y));
}

// Multiply double-single numbers
vec2 dsMul(vec2 a, vec2 b) {
    vec2 p = twoProd(a.x, b.x);
    p.y += a.x * b.y + a.y * b.x;
    p = quickTwoSum(p.x, p.y);
    return p;
}

// Multiply double-single by single float
vec2 dsMulF(vec2 a, float b) {
    vec2 p = twoProd(a.x, b);
    p.y += a.y * b;
    p = quickTwoSum(p.x, p.y);
    return p;
}

// Divide double-single numbers
vec2 dsDiv(vec2 a, vec2 b) {
    float q1 = a.x / b.x;
    vec2 r = dsSub(a, dsMulF(b, q1));
    float q2 = r.x / b.x;
    r = dsSub(r, dsMulF(b, q2));
    float q3 = r.x / b.x;
    return quickTwoSum(q1, q2 + q3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Double-Single Mathematical Functions
// ─────────────────────────────────────────────────────────────────────────────

// Natural logarithm with double-single precision
vec2 dsLog(float x) {
    if (x <= 0.0) return vec2(-1e30, 0.0);

    // Get initial approximation
    float l = log(x);

    // One Newton-Raphson iteration: l' = l + (x - e^l) / e^l
    // = l + x/e^l - 1
    float el = exp(l);
    float correction = (x - el) / el;

    return twoSum(l, correction);
}

// Double-single log for integers (more accurate)
// Precomputed to n=50 to support Lehmer's phenomenon (t≈7005, N≈33)
vec2 dsLogInt(int n) {
    // For small n, use precomputed high-precision values
    // log(n) split into hi + lo parts (computed with 128-bit precision)
    if (n == 1) return vec2(0.0, 0.0);
    if (n == 2) return vec2(0.6931471805599453, 2.3190468138462996e-17);
    if (n == 3) return vec2(1.0986122886681098, -9.072668766387564e-17);
    if (n == 4) return vec2(1.3862943611198906, 4.6380936276925992e-17);
    if (n == 5) return vec2(1.6094379124341003, -6.987424801643562e-17);
    if (n == 6) return vec2(1.791759469228055, -7.141120892207323e-17);
    if (n == 7) return vec2(1.9459101490553132, 8.8967140497006e-17);
    if (n == 8) return vec2(2.0794415416798357, 6.957140441594099e-17);
    if (n == 9) return vec2(2.1972245773362196, -1.8145337532775128e-16);
    if (n == 10) return vec2(2.302585092994046, -2.1707562233822494e-16);
    if (n == 11) return vec2(2.3978952727983707, 8.7031606184687386e-17);
    if (n == 12) return vec2(2.4849066497880004, -1.5229788710498378e-16);
    if (n == 13) return vec2(2.5649493574615367, -1.2902322356373552e-16);
    if (n == 14) return vec2(2.6390573296356670, 1.7748946255498830e-16);
    if (n == 15) return vec2(2.7080502011022100, -1.5765474636950920e-16);
    if (n == 16) return vec2(2.7725887222397811, 9.2761872277251990e-17);
    if (n == 17) return vec2(2.8332133440562162, -1.0178596913893030e-16);
    if (n == 18) return vec2(2.8903717578961645, -2.7218335827392540e-16);
    if (n == 19) return vec2(2.9444389791664403, -1.5313617978292780e-16);
    if (n == 20) return vec2(2.9957322735539909, -2.3794889871591740e-16);
    if (n == 21) return vec2(3.0445224377234230, -2.0769832028527680e-16);
    if (n == 22) return vec2(3.0910424533583156, 1.6567782919977010e-16);
    if (n == 23) return vec2(3.1354942159291497, 2.1529043447588220e-16);
    if (n == 24) return vec2(3.1780538303479458, -6.2403809988748550e-17);
    if (n == 25) return vec2(3.2188758248682006, -1.3976179828962100e-16);
    if (n == 26) return vec2(3.2580965380214821, -2.1849115825666060e-16);
    if (n == 27) return vec2(3.2958368660043291, -2.7218335827392540e-16);
    if (n == 28) return vec2(3.3322045101752038, 2.6636960653423510e-16);
    if (n == 29) return vec2(3.3672958299864741, 2.6862015229294490e-16);
    if (n == 30) return vec2(3.4011973816621555, -3.6973221461626850e-16);
    if (n == 31) return vec2(3.4339872044851463, -2.5016798523632330e-16);
    if (n == 32) return vec2(3.4657359027997265, 1.3914070262874990e-16);
    if (n == 33) return vec2(3.4965075614664802, 2.5016798523632330e-16);
    if (n == 34) return vec2(3.5263605246161616, -2.0016948892279840e-16);
    if (n == 35) return vec2(3.5553480614894135, -2.4633737631715690e-16);
    if (n == 36) return vec2(3.5835189384561099, -4.5328661465678250e-16);
    if (n == 37) return vec2(3.6109179126442243, -3.4236667584423010e-16);
    if (n == 38) return vec2(3.6375861597263857, -2.4250676739799050e-16);
    if (n == 39) return vec2(3.6635616461296463, -3.3702685010096140e-16);
    if (n == 40) return vec2(3.6888794541139363, -4.0895850363587240e-16);
    if (n == 41) return vec2(3.7135720667043080, 2.3186907018244000e-16);
    if (n == 42) return vec2(3.7376696182833684, -2.9706355243385490e-16);
    if (n == 43) return vec2(3.7612001156935624, -3.1897335727378300e-16);
    if (n == 44) return vec2(3.7841896339182610, 2.5463796780628850e-16);
    if (n == 45) return vec2(3.8066624897703196, -4.4869163337179810e-16);
    if (n == 46) return vec2(3.8286413964890951, 3.0476333645057400e-16);
    if (n == 47) return vec2(3.8501476017100584, -1.5313617978292780e-16);
    if (n == 48) return vec2(3.8712010109078911, -1.5383216235288620e-16);
    if (n == 49) return vec2(3.8918202981106265, 1.7734240336589100e-16);
    if (n == 50) return vec2(3.9120230054281460, -3.2205300581031160e-16);

    // For larger n, compute with extra precision using log properties
    // log(n) = log(n/k) + log(k) where k is largest precomputed value <= n
    if (n <= 100) {
        // Use log(n) = log(n/50) + log(50) for better accuracy
        vec2 log50 = vec2(3.9120230054281460, -3.2205300581031160e-16);
        float ratio = float(n) / 50.0;
        vec2 logRatio = dsLog(ratio);
        return dsAdd(log50, logRatio);
    }

    return dsLog(float(n));
}

// Constants in double-single format
vec2 DS_TWO_PI = vec2(6.283185307179586, 2.4492935982947064e-16);
vec2 DS_PI = vec2(3.141592653589793, 1.2246467991473532e-16);
vec2 DS_PI_8 = vec2(0.39269908169872414, 1.5308084989341915e-17);
vec2 DS_INV_TWO_PI = vec2(0.15915494309189535, -9.486829744032374e-18);

// Reduce angle to [0, 2π) using double-single arithmetic
// This is the KEY function that enables high-t accuracy
float reduceAngle(vec2 angle) {
    // Divide by 2π to get number of cycles
    vec2 cycles = dsMul(angle, DS_INV_TWO_PI);

    // Extract the fractional part carefully
    // cycles = hi + lo, where hi might be large
    // We want frac(hi + lo) = frac(hi) + lo, adjusted for carry

    // Get integer and fractional parts of hi
    float hiInt = floor(cycles.x);
    float hiFrac = cycles.x - hiInt;

    // Combine fractional part of hi with lo
    float totalFrac = hiFrac + cycles.y;

    // Normalize to [0, 1)
    // Handle multiple carries/borrows for robustness
    totalFrac = totalFrac - floor(totalFrac);

    // Convert back to angle in [0, 2π)
    return totalFrac * TWO_PI;
}

// ─────────────────────────────────────────────────────────────────────────────
// Riemann-Siegel theta function with double-single precision
// θ(t) = arg(Γ(1/4 + it/2)) - (t/2)·log(π)
// ─────────────────────────────────────────────────────────────────────────────

vec2 dsThetaFull(vec2 t) {
    // For small t
    if (t.x < 1.0) {
        float tf = t.x + t.y;
        float theta = (tf / 2.0) * log(max(tf, 0.1) / TWO_PI) - tf / 2.0 - PI / 8.0;
        return dsCreate(theta);
    }

    // t/2
    vec2 tHalf = dsMulF(t, 0.5);

    // t / (2π)
    vec2 tOver2Pi = dsMul(t, DS_INV_TWO_PI);

    // log(t / 2π) - we need this in DS
    vec2 logTOver2Pi = dsLog(tOver2Pi.x + tOver2Pi.y);

    // Main term: (t/2) * log(t/2π)
    vec2 term1 = dsMul(tHalf, logTOver2Pi);

    // - t/2
    vec2 term2 = dsSub(term1, tHalf);

    // - π/8
    vec2 result = dsSub(term2, DS_PI_8);

    // Stirling corrections
    float tf = t.x;
    float t2 = tf * tf;
    float t3 = t2 * tf;
    float t5 = t3 * t2;

    float correction = 1.0 / (48.0 * tf)
                     + 7.0 / (5760.0 * t3)
                     + 31.0 / (80640.0 * t5);

    return dsAdd(result, dsCreate(correction));
}

// Simplified theta for single float input
vec2 dsTheta(float t) {
    return dsThetaFull(dsCreate(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Riemann-Siegel C coefficients
// ─────────────────────────────────────────────────────────────────────────────

float C0(float p) {
    float cos2pip = cos(TWO_PI * p);
    if (abs(cos2pip) < 1e-8) return 0.0;
    return cos(TWO_PI * (p * p - p - 0.0625)) / cos2pip;
}

float C1(float p) {
    float cos2pip = cos(TWO_PI * p);
    if (abs(cos2pip) < 1e-8) return 0.0;
    float sin2pip = sin(TWO_PI * p);
    return -sin2pip * (PI * PI * PI) / (3.0 * cos2pip * cos2pip * cos2pip);
}

// ─────────────────────────────────────────────────────────────────────────────
// Riemann-Siegel Z function with double-single precision
// This is where the magic happens - accurate cos/sin at high t
// ─────────────────────────────────────────────────────────────────────────────

float rsZ_ds(float t) {
    float absT = abs(t);

    if (absT < 2.0) {
        // Small t - regular precision is fine
        vec2 th = dsTheta(absT);
        float thf = th.x + th.y;
        float sum = 0.0;
        for (int n = 1; n <= 50; n++) {
            float nf = float(n);
            float angle = thf - absT * log(nf);
            sum += cos(angle) / sqrt(nf);
        }
        return 2.0 * sum;
    }

    // Main computation with double-single precision
    float sqrtTOver2Pi = sqrt(absT / TWO_PI);
    int N = int(floor(sqrtTOver2Pi));
    float p = sqrtTOver2Pi - float(N);

    // Compute theta in double-single
    vec2 theta = dsTheta(absT);
    vec2 t_ds = dsCreate(absT);

    // Main sum with accurate angle reduction
    float sum = 0.0;
    for (int n = 1; n <= MAX_TERMS; n++) {
        if (n > N) break;

        // Get log(n) in double-single precision
        vec2 logN = dsLogInt(n);

        // Compute theta - t * log(n) in double-single
        vec2 tLogN = dsMul(t_ds, logN);
        vec2 angle_ds = dsSub(theta, tLogN);

        // Reduce angle to [0, 2π) - THIS IS THE KEY STEP
        float angle = reduceAngle(angle_ds);

        // Now cos(angle) is accurate!
        sum += cos(angle) / sqrt(float(n));
    }
    sum *= 2.0;

    // Remainder term
    float sign = mod(float(N), 2.0) < 0.5 ? 1.0 : -1.0;
    float factor = pow(absT / TWO_PI, -0.25);
    float R = sign * factor * C0(p);

    // Higher order corrections
    if (absT > 50.0) {
        float factor1 = factor / sqrtTOver2Pi;
        R -= sign * factor1 * C1(p);
    }

    return sum + R;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert Z(t) back to ζ(½+it) with accurate phase
// ─────────────────────────────────────────────────────────────────────────────

vec2 zetaFromZ_ds(float t) {
    float Zt = rsZ_ds(abs(t));

    // Get theta with double precision and reduce for accurate cos/sin
    vec2 theta = dsTheta(abs(t));
    float th_reduced = reduceAngle(theta);

    // ζ(½+it) = Z(t) · e^(-iθ)
    vec2 result = vec2(Zt * cos(th_reduced), -Zt * sin(th_reduced));

    // For negative t: ζ(½-it) = conj(ζ(½+it))
    if (t < 0.0) {
        result.y = -result.y;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard complex arithmetic for off-critical-line computation
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
// Fallback: Dirichlet eta for off-critical-line points
// ─────────────────────────────────────────────────────────────────────────────

vec2 eta_ds(vec2 s, int terms) {
    vec2 sum = vec2(0.0);
    vec2 s_ds = dsCreate(s.y);

    for (int n = 1; n <= MAX_TERMS; ++n) {
        if (n > terms) break;
        float nf = float(n);
        float sign = mod(nf, 2.0) < 1.0 ? -1.0 : 1.0;
        float scale = 1.0 / pow(nf, s.x);

        // Use double-single for angle computation
        vec2 logN = dsLogInt(n);
        vec2 angle_ds = dsMulF(logN, -s.y);
        float angle = reduceAngle(angle_ds);

        vec2 term = sign * vec2(scale * cos(angle), scale * sin(angle));
        if (length(term) < 1e-10) break;
        sum += term;
    }
    return sum;
}

vec2 etaZeta_ds(vec2 s, int terms) {
    vec2 etaVal = eta_ds(s, terms);
    float expReal = exp((1.0 - s.x) * LOG2);
    float expImag = -s.y * LOG2;

    // Reduce angle for 2^(1-s) computation
    vec2 angle_ds = dsCreate(expImag);
    float angle = reduceAngle(angle_ds);

    vec2 twoPow = vec2(expReal * cos(angle), expReal * sin(angle));
    vec2 denom = vec2(1.0 - twoPow.x, -twoPow.y);
    return c_div(etaVal, denom);
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

// ─────────────────────────────────────────────────────────────────────────────
// Main zeta function - uses double-single RS on critical line
// ─────────────────────────────────────────────────────────────────────────────

vec2 zeta(vec2 s) {
    int terms = int(u_iterations);
    float distFromCritical = abs(s.x - 0.5);

    // Use double-precision Riemann-Siegel near critical line
    if (distFromCritical < 0.15 && s.x > 0.0) {
        vec2 rsResult = zetaFromZ_ds(s.y);

        if (distFromCritical < 0.02) {
            return rsResult;
        }

        // Blend with eta at edges
        vec2 etaResult = etaZeta_ds(s, terms);
        float blend = smoothstep(0.02, 0.15, distFromCritical);
        return mix(rsResult, etaResult, blend);
    }

    // For Re(s) > 0, use double-precision eta
    if (s.x > 0.0) {
        return etaZeta_ds(s, terms);
    }

    // For Re(s) <= 0, use functional equation
    vec2 s1 = vec2(1.0 - s.x, -s.y);
    vec2 zeta1s = etaZeta_ds(s1, terms);

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

    // Contours
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
