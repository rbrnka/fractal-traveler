/*
 * Julia Fragment Shader (Rebased Perturbation)
 * @author    Radim Brnka
 * @project   Synaptory Fractal Traveler
 * @copyright 2025-2026
 *
 * @description
 * Julia set implementation using perturbation math relative to a
 * pre-calculated Mandelbrot reference orbit.
 * Formula: dz_{n+1} = 2*zref*dz + dz^2 + (c_julia - c_ref).
 *
 * @license   MIT
 */

precision highp float;

uniform vec2  u_resolution;
uniform float u_rotation;

// delta z0 (pan - refZ0) computed on JS side for float64 precision
uniform vec2  u_delta_z0_h;
uniform vec2  u_delta_z0_l;

// zoom hi/lo
uniform float u_zoom_h;
uniform float u_zoom_l;

// Julia constant
uniform vec2  u_c;

uniform float u_iterations;
uniform vec3  u_innerStops[5];

uniform sampler2D u_orbitTex;
uniform float     u_orbitW;

const int MAX_ITER = __MAX_ITER__;

// --- df helpers ---
struct df  { float hi; float lo; };
struct df2 { df x; df y; };

df df_make(float hi, float lo){ df a; a.hi=hi; a.lo=lo; return a; }
df df_from(float a){ return df_make(a, 0.0); }
float df_to_float(df a){ return a.hi + a.lo; }

df twoSum(float a, float b) {
    float s  = a + b;
    float bb = s - a;
    float err = (a - (s - bb)) + (b - bb);
    return df_make(s, err);
}

df quickTwoSum(float a, float b) {
    float s = a + b;
    float err = b - (s - a);
    return df_make(s, err);
}

df df_add(df a, df b) {
    df s = twoSum(a.hi, b.hi);
    float t = a.lo + b.lo;
    df u = twoSum(s.lo, t);
    df v = twoSum(s.hi, u.hi);
    float lo = u.lo + v.lo;
    return quickTwoSum(v.hi, lo);
}

df df_sub(df a, df b) { return df_add(a, df_make(-b.hi, -b.lo)); }

const float SPLIT = 4097.0;

df twoProd(float a, float b) {
    float p = a * b;

    float aSplit = a * SPLIT;
    float aHi = aSplit - (aSplit - a);
    float aLo = a - aHi;

    float bSplit = b * SPLIT;
    float bHi = bSplit - (bSplit - b);
    float bLo = b - bHi;

    float err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
    return df_make(p, err);
}

df df_mul(df a, df b) {
    df p = twoProd(a.hi, b.hi);
    float err = a.hi * b.lo + a.lo * b.hi + a.lo * b.lo;
    df s = twoSum(p.lo, err);
    df r = twoSum(p.hi, s.hi);
    float lo = s.lo + r.lo;
    return quickTwoSum(r.hi, lo);
}

df df_mul_f(df a, float b) { return df_mul(a, df_from(b)); }

df2 df2_make(df x, df y){ df2 r; r.x=x; r.y=y; return r; }
df2 df2_add(df2 a, df2 b){ return df2_make(df_add(a.x, b.x), df_add(a.y, b.y)); }

df2 df2_mul(df2 a, df2 b) {
    df axbx = df_mul(a.x, b.x);
    df ayby = df_mul(a.y, b.y);
    df axby = df_mul(a.x, b.y);
    df aybx = df_mul(a.y, b.x);
    return df2_make(df_sub(axbx, ayby), df_add(axby, aybx));
}

df2 df2_sqr(df2 a){
    df xx = df_mul(a.x, a.x);
    df yy = df_mul(a.y, a.y);
    df xy = df_mul(a.x, a.y);
    return df2_make(df_sub(xx, yy), df_mul_f(xy, 2.0));
}

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

df2 sampleZRef(int n) {
    float x = (float(n) + 0.5) / u_orbitW;
    vec4 t = texture2D(u_orbitTex, vec2(x, 0.5));
    return df2_make(df_make(t.r, t.g), df_make(t.b, t.a));
}

void main() {
    float aspect = u_resolution.x / u_resolution.y;

    vec2 st = gl_FragCoord.xy / u_resolution;
    st -= 0.5;
    st.x *= aspect;

    float cosR = cos(u_rotation);
    float sinR = sin(u_rotation);
    vec2 r = vec2(
    st.x * cosR - st.y * sinR,
    st.x * sinR + st.y * cosR
    );

    df zoom = df_make(u_zoom_h, u_zoom_l);

    // deltaZ0 = pan - refZ0 (computed on JS side with float64 precision)
    df2 deltaZ0 = df2_make(
        df_make(u_delta_z0_h.x, u_delta_z0_l.x),
        df_make(u_delta_z0_h.y, u_delta_z0_l.y)
    );

    // dz0 = deltaZ0 + zoom * r
    df2 dz = df2_add(
        deltaZ0,
        df2_make(df_mul_f(zoom, r.x), df_mul_f(zoom, r.y))
    );

    float it = 0.0;
    float zx = 0.0;
    float zy = 0.0;

    for (int n = 0; n < MAX_ITER; n++) {
        float fn = float(n);
        if (fn >= u_iterations) { it = fn; break; }

        df2 zref = sampleZRef(n);

        zx = df_to_float(zref.x) + df_to_float(dz.x);
        zy = df_to_float(zref.y) + df_to_float(dz.y);
        if (zx*zx + zy*zy > 4.0) { it = fn; break; }

        // Correct Julia perturbation:
        // dz_{n+1} = 2*zref*dz + dz^2   (NO +dc term)
        df2 zref_dz = df2_mul(zref, dz);
        zref_dz.x = df_mul_f(zref_dz.x, 2.0);
        zref_dz.y = df_mul_f(zref_dz.y, 2.0);

        df2 dz2 = df2_sqr(dz);

        dz = df2_add(zref_dz, dz2);

        if (n == MAX_ITER - 1) it = u_iterations;
    }

    if (it >= u_iterations) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float r2 = max(zx*zx + zy*zy, 1e-30);
        float smoothColor = it - log2(log2(r2));

        // Normalize
        float t = clamp(smoothColor / u_iterations, 0.0, 1.0);

        t = 0.5 + 0.6 * sin(t * 4.0 * 3.14159265);

        vec3 col = getColorFromMap(t);
        gl_FragColor = vec4(col, 1.0);
    }
}