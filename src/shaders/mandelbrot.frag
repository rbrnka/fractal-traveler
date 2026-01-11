/*
 * Mandelbrot Fragment Shader (Rebased Perturbation)
 * @author    Radim Brnka
 * @project   Synaptory Fractal Traveler
 * @copyright 2025-2026
 * @description
 * High-precision Mandelbrot implementation using Double-Float (df) arithmetic.
 * Implements perturbation: dz_{n+1} = 2*zref*dz + dz^2 + dc.
 * Requires OES_texture_float for orbit reference sampling.
 *
 * @license   MIT
 */

precision highp float;

uniform vec2 u_resolution;

// view (camera) pan (hi+lo)
uniform vec2 u_view_pan_h;
uniform vec2 u_view_pan_l;

// reference orbit pan (hi+lo)
uniform vec2 u_ref_pan_h;
uniform vec2 u_ref_pan_l;

// zoom (hi+lo)
uniform float u_zoom_h;
uniform float u_zoom_l;

uniform float u_iterations;
uniform vec3  u_colorPalette;
uniform float u_rotation;

uniform sampler2D u_orbitTex;
uniform float u_orbitW;

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

df2 df2_mul(df2 a, df2 b){
    // (ax + i ay)(bx + i by) = (axbx - ayby) + i(axby + aybx)
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

df2 sampleZRef(int n){
    float x = (float(n) + 0.5) / u_orbitW;
    vec4 t = texture2D(u_orbitTex, vec2(x, 0.5));
    return df2_make(df_make(t.r, t.g), df_make(t.b, t.a));
}

vec4 calculateColor(float i, vec3 u_colorPalette) {
    float color = i / 100.0;
    vec3 fractalColor = vec3(
    sin(color * 3.1415),
    sin(color * 6.2830),
    sin(color * 1.7200)
    ) * u_colorPalette;
    return vec4(fractalColor, 1.0);
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

    df2 viewPan = df2_make(
    df_make(u_view_pan_h.x, u_view_pan_l.x),
    df_make(u_view_pan_h.y, u_view_pan_l.y)
    );
    df2 refPan = df2_make(
    df_make(u_ref_pan_h.x, u_ref_pan_l.x),
    df_make(u_ref_pan_h.y, u_ref_pan_l.y)
    );

    // dc = (viewPan - refPan) + zoom * r
    df2 dc = df2_make(df_mul_f(zoom, r.x), df_mul_f(zoom, r.y));
    dc = df2_add(dc, df2_make(df_sub(viewPan.x, refPan.x), df_sub(viewPan.y, refPan.y)));

    df2 dz = df2_make(df_from(0.0), df_from(0.0));

    float i = 0.0;

    for (int n = 0; n < MAX_ITER; n++) {
        float fn = float(n);
        if (fn >= u_iterations) { i = fn; break; }

        df2 zref = sampleZRef(n);

        // bailout approx using float
        float zx = df_to_float(zref.x) + df_to_float(dz.x);
        float zy = df_to_float(zref.y) + df_to_float(dz.y);
        if (zx*zx + zy*zy > 4.0) { i = fn; break; }

        // dz_{n+1} = 2*zref*dz + dz^2 + dc
        df2 zref_dz = df2_mul(zref, dz);
        zref_dz.x = df_mul_f(zref_dz.x, 2.0);
        zref_dz.y = df_mul_f(zref_dz.y, 2.0);

        df2 dz2 = df2_sqr(dz);

        dz = df2_add(df2_add(zref_dz, dz2), dc);

        if (n == MAX_ITER - 1) i = u_iterations;
    }

    if (i >= u_iterations) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = calculateColor(i, u_colorPalette);
    }
}