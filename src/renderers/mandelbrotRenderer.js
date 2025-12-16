import {FractalRenderer} from './fractalRenderer.js';
import {asyncDelay, compareComplex, splitFloat} from "../global/utils";
import {DEFAULT_CONSOLE_GROUP_COLOR, EASE_TYPE, PI} from "../global/constants";

/**
 * MandelbrotRenderer (Rebased Perturbation)
 *
 * @author Radim Brnka
 * @description This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.
 * @extends FractalRenderer
 *
 * Orbit stored in float texture (OES_texture_float)
 * Fragment uses perturbation: dz_{n+1} = 2*zref*dz + dz^2 + dc with dc = (viewPan-refPan) + zoom * r
 */
export class MandelbrotRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_PAN = [-0.5, 0];
        this.setPan(this.DEFAULT_PAN[0], this.DEFAULT_PAN[1]); // IMPORTANT: use setPan (syncs DD + array)

        // Reference state
        this.refPan = [...this.DEFAULT_PAN];
        this.orbitDirty = true;

        this._prevPan0 = NaN;
        this._prevPan1 = NaN;
        this._prevZoom = NaN;

        // Orbit / perturbation constants
        this.MAX_ITER = 2000;          // shader loop upper bound and orbit length
        this.REF_SEARCH_GRID = 5;      // 5x5 sampling grid
        this.REF_SEARCH_RADIUS = 0.50; // in "screen units" scaled by zoom (tune 0.25..0.6)

        // WebGL resources (created in onProgramCreated)
        this.orbitTex = null;
        this.orbitData = null;
        this.floatTexExt = null;

        /** Mandelbrot-specific presets */
        this.PRESETS = [
            {
                id: 0,
                pan: this.DEFAULT_PAN,
                zoom: this.DEFAULT_ZOOM,
                rotation: this.DEFAULT_ROTATION,
                title: 'Default View'
            },
            {id: 1, pan: [0.351424, 0.063866], zoom: 0.000049},
            {id: 2, pan: [0.254998, 0.000568], zoom: 0.000045},
            {id: 3, pan: [-0.164538, 1.038428], zoom: 0.000127},
            {id: 4, pan: [-0.750700, 0.021415], zoom: 0.000110, title: 'Across the Seahorse Valley'},
            {id: 5, pan: [-0.766863, -0.107475], zoom: 0.000196},
            {id: 6, pan: [-0.8535686544080792, -0.21081423598149682], zoom: 0.000126},
            {id: 7, pan: [0.337420, 0.047257], zoom: 0.000143, title: 'Minibrot'},
            {id: 8, pan: [0.11650135661082159, -0.6635453818054073], zoom: 0.000104, title: 'Misiurewicz Point'},
            {id: 9, pan: [-0.124797, 0.840309], zoom: 0.000628, title: 'The Rabbits'}
            // {id: 9, pan: [-0.7469408211592985,0.10721648652717636], rotation: 0, zoom: 0.000985998295121236, title: 'Seahorse Valley'}
        ];

        this.init();
    }

    /**
     * Called by FractalRenderer.initGLProgram() after program creation + common uniform cache.
     * Creates float texture, allocates orbit buffer, and binds texture unit.
     */
    onProgramCreated() {
        this.floatTexExt = this.gl.getExtension("OES_texture_float");
        if (!this.floatTexExt) {
            console.error('Missing OES_texture_float. Perturbation orbit texture upload requires it.');
            return;
        }

        this.orbitTex = this.gl.createTexture();
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.orbitTex);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.orbitData = new Float32Array(this.MAX_ITER * 4);

        // Shader expects orbit sampler in unit 0
        if (this.orbitTexLoc) this.gl.uniform1i(this.orbitTexLoc, 0);
        if (this.orbitWLoc) this.gl.uniform1f(this.orbitWLoc, this.MAX_ITER);

        this.orbitDirty = true;
    }

    /**
     * @inheritDoc
     * @override
     */
    createFragmentShaderSource() {
        const coloring = `
            float color = i / 100.0;
            vec3 fractalColor = vec3(
                sin(color * 3.1415),
                sin(color * 6.2830),
                sin(color * 1.7200)
            ) * u_colorPalette;
            gl_FragColor = vec4(fractalColor, 1.0);
        `;

        return `
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
            
            const int MAX_ITER = ${this.MAX_ITER};
            
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
            df2 df2_add(df2 a, df2 b){ return df2_make(df_add(a.x,b.x), df_add(a.y,b.y)); }
            
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
                    ${coloring}
                }
            }
        `;
    }

    updateUniforms() {
        super.updateUniforms();

        // view pan hi/lo
        this.viewPanHLoc = this.gl.getUniformLocation(this.program, 'u_view_pan_h');
        this.viewPanLLoc = this.gl.getUniformLocation(this.program, 'u_view_pan_l');

        // ref pan hi/lo
        this.refPanHLoc = this.gl.getUniformLocation(this.program, 'u_ref_pan_h');
        this.refPanLLoc = this.gl.getUniformLocation(this.program, 'u_ref_pan_l');

        // zoom hi/lo
        this.zoomHLoc = this.gl.getUniformLocation(this.program, 'u_zoom_h');
        this.zoomLLoc = this.gl.getUniformLocation(this.program, 'u_zoom_l');

        // orbit texture uniforms
        this.orbitTexLoc = this.gl.getUniformLocation(this.program, 'u_orbitTex');
        this.orbitWLoc = this.gl.getUniformLocation(this.program, 'u_orbitW');
    }

    /** Reference picking + orbit build) */
    escapeItersDouble(cx, cy, iters) {
        let zx = 0.0, zy = 0.0;
        for (let i = 0; i < iters; i++) {
            const zx2 = zx*zx - zy*zy + cx;
            const zy2 = 2.0*zx*zy + cy;
            zx = zx2; zy = zy2;
            if (zx*zx + zy*zy > 4.0) return i;
        }
        return iters;
    }

    /**
     * Choose a good refPan near view center:
     * - sample a grid around view center (radius scales with zoom)
     * - pick the point with the highest escape iteration (prefer inside / late escape)
     */
    pickReferenceNearViewCenter() {
        const grid = this.REF_SEARCH_GRID;
        const half = (grid - 1) / 2;
        const step = (2.0 * this.REF_SEARCH_RADIUS) / (grid - 1);

        const base = this.zoom; // scale offsets by current zoom

        const probeIters = Math.min(this.MAX_ITER, Math.max(200, Math.floor(this.iterations)));

        let bestCx = this.pan[0];
        let bestCy = this.pan[1];
        let bestScore = -1;

        for (let j = 0; j < grid; j++) {
            for (let i = 0; i < grid; i++) {
                const ox = (i - half) * step;
                const oy = (j - half) * step;
                const cx = this.pan[0] + ox * base;
                const cy = this.pan[1] + oy * base;

                const score = this.escapeItersDouble(cx, cy, probeIters);
                if (score > bestScore) {
                    bestScore = score;
                    bestCx = cx;
                    bestCy = cy;
                }
            }
        }

        this.refPan[0] = bestCx;
        this.refPan[1] = bestCy;
    }

    computeReferenceOrbit() {
        if (!this.orbitData || !this.orbitTex) return;

        const cx = this.refPan[0];
        const cy = this.refPan[1];

        let zx = 0.0,
            zy = 0.0;

        for (let n = 0; n < this.MAX_ITER; n++) {
            const sx = splitFloat(zx);
            const sy = splitFloat(zy);

            const idx = n * 4;
            this.orbitData[idx] = sx.high;
            this.orbitData[idx + 1] = sx.low;
            this.orbitData[idx + 2] = sy.high;
            this.orbitData[idx + 3] = sy.low;

            const zx2 = zx * zx - zy * zy + cx;
            const zy2 = 2.0 * zx * zy + cy;
            zx = zx2;
            zy = zy2;

            if (zx * zx + zy * zy > 4.0) {
                const fx = splitFloat(zx);
                const fy = splitFloat(zy);
                for (let k = n + 1; k < this.MAX_ITER; k++) {
                    const j = k * 4;
                    this.orbitData[j] = fx.high;
                    this.orbitData[j + 1] = fx.low;
                    this.orbitData[j + 2] = fy.high;
                    this.orbitData[j + 3] = fy.low;
                }
                break;
            }
        }

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.orbitTex);

        // Upload 1D orbit texture: width=MAX_ITER, height=1
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.MAX_ITER,
            1,
            0,
            this.gl.RGBA,
            this.gl.FLOAT,
            this.orbitData
        );

        if (this.orbitTexLoc) this.gl.uniform1i(this.orbitTexLoc, 0);
        if (this.orbitWLoc) this.gl.uniform1f(this.orbitWLoc, this.MAX_ITER);
    }

    /**
     * @inheritDoc
     * @override
     */
    draw() {
        this.gl.useProgram(this.program);

        // Iteration strategy avoids exploding to infinity at tiny zooms
        // TODO Tune! main point is: clamp to MAX_ITER.
        const safe = Math.max(this.zoom, 1e-300);
        const baseIters = Math.floor(200 + 50 * Math.log10(this.DEFAULT_ZOOM / safe));
        this.iterations = Math.max(50, Math.min(this.MAX_ITER, baseIters + this.extraIterations));

        // Detect view changes -> mark orbit dirty
        if (this.pan[0] !== this._prevPan0 || this.pan[1] !== this._prevPan1 || this.zoom !== this._prevZoom) {
            this.orbitDirty = true;
            this._prevPan0 = this.pan[0];
            this._prevPan1 = this.pan[1];
            this._prevZoom = this.zoom;
        }

        // Rebase reference + rebuild orbit when needed
        if (this.orbitDirty) {
            this.pickReferenceNearViewCenter();
            this.computeReferenceOrbit();
            this.orbitDirty = false;
        }

        // Upload viewPan hi/lo
        const vpx = splitFloat(this.pan[0]);
        const vpy = splitFloat(this.pan[1]);
        if (this.viewPanHLoc) this.gl.uniform2f(this.viewPanHLoc, vpx.high, vpy.high);
        if (this.viewPanLLoc) this.gl.uniform2f(this.viewPanLLoc, vpx.low,  vpy.low);

        // Upload refPan hi/lo
        const rpx = splitFloat(this.refPan[0]);
        const rpy = splitFloat(this.refPan[1]);
        if (this.refPanHLoc) this.gl.uniform2f(this.refPanHLoc, rpx.high, rpy.high);
        if (this.refPanLLoc) this.gl.uniform2f(this.refPanLLoc, rpx.low,  rpy.low);

        // Upload zoom hi/lo
        const z = splitFloat(this.zoom);
        if (this.zoomHLoc) this.gl.uniform1f(this.zoomHLoc, z.high);
        if (this.zoomLLoc) this.gl.uniform1f(this.zoomLLoc, z.low);

        super.draw();
    }

    needsRebase() {
        const dx = this.pan[0] - this.refPan[0];
        const dy = this.pan[1] - this.refPan[1];
        const dist = Math.hypot(dx, dy);
        return dist > this.zoom * 0.75;
    }

    // region > ANIMATION METHODS (unchanged, but ensure presets use setPan via animatePanTo)

    /**
     * Animates travel to a preset. It first zooms out to the default zoom, then rotates, then animates pan and zoom-in.
     * If any of the final params is the same as the target, it won't animate it.
     *
     * @param {MANDELBROT_PRESET} preset An instance-specific object to define exact spot in the fractal
     * @param {number} [zoomOutDuration] in ms
     * @param {number} [zoomInDuration] in ms
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, zoomOutDuration = 1000, zoomInDuration = 3500) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        console.log(`Traveling to preset: ${JSON.stringify(preset)}`);

        const targetRotation = preset.rotation || 0;

        if (preset.zoom.toFixed(6) === this.zoom.toFixed(6)) {
            // If only pan is changed, adjust pan
            await this.animatePanTo(preset.pan, zoomOutDuration);
        } else if (compareComplex(preset.pan, this.pan)) {
            // If only zoom is changed, adjust zoom-in
            await this.animateZoomTo(preset.zoom, zoomOutDuration);
        } else {
            // Otherwise zoom-out
            await this.animateZoomTo(this.DEFAULT_ZOOM, zoomOutDuration);
        }

        await Promise.all([
            this.animatePanThenZoomTo(preset.pan, preset.zoom, 500, zoomInDuration),
            this.animateRotationTo(targetRotation, 500, EASE_TYPE.QUINT),
        ]);

        this.currentPresetIndex = preset.id || 0;

        console.log(`Travel complete.`);
        console.groupEnd();
    }

    /**
     * Animate travel to a preset with random rotation. This method waits for three stages:
     *   1. Zoom-out to default zoom with rotation.
     *   2. Pan transition.
     *   3. Zoom-in with rotation.
     *
     * @param {MANDELBROT_PRESET} preset The target preset object with properties: pan, c, zoom, rotation.
     * @param {number} zoomOutDuration Duration (ms) for the zoom-out stage.
     * @param {number} panDuration Duration (ms) for the pan stage.
     * @param {number} zoomInDuration Duration (ms) for the zoom-in stage.
     */
    async animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPresetWithRandomRotation`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);

        // Generate random rotations for a more dynamic effect.
        const zoomOutRotation = this.rotation + (Math.random() * PI * 2 - PI);
        const zoomInRotation = zoomOutRotation + (Math.random() * PI * 2 - PI);

        if (this.rotation !== this.DEFAULT_ROTATION) {
            await this.animateZoomRotationTo(this.DEFAULT_ZOOM, zoomOutRotation, zoomOutDuration);
        }

        await this.animatePanTo(preset.pan, panDuration, EASE_TYPE.CUBIC);
        await this.animateZoomRotationTo(preset.zoom, zoomInRotation, zoomInDuration);

        this.currentPresetIndex = preset.id || 0;

        console.groupEnd();
    }

    /**
     * Animates infinite demo loop of traveling to the presets
     * @param {boolean} random Determines whether presets are looped in order from 1-9 or ordered randomly
     * @return {Promise<void>}
     */
    async animateDemo(random = true) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDemo`, `color: ${DEFAULT_CONSOLE_GROUP_COLOR}`);
        this.stopAllNonColorAnimations();

        if (!this.PRESETS.length) {
            console.warn('No presets defined for Mandelbrot mode ');
            return;
        }

        this.demoActive = true;

        const getNextPresetIndex = (random) => {
            if (random) {
                let index;
                do {
                    index = Math.floor(Math.random() * this.PRESETS.length);
                } while (index === this.currentPresetIndex || index === 0);
                return index;
            } else {
                // Sequential: increment index, but if it wraps to 0, skip to 1.
                const nextIdx = (this.currentPresetIndex + 1) % this.PRESETS.length;
                return nextIdx === 0 ? 1 : nextIdx;
            }
        };

        // Continue cycling through presets while demo is active.
        while (this.demoActive) {
            this.currentPresetIndex = getNextPresetIndex(random);
            const currentPreset = this.PRESETS[this.currentPresetIndex];
            console.log(`Animating to preset ${this.currentPresetIndex}`);

            // Animate to the current preset.
            await this.animateTravelToPresetWithRandomRotation(currentPreset, 2000, 1000, 5000);

            // Wait after the animation completes.
            await asyncDelay(3500);
        }

        console.log(`Demo interrupted.`);
        console.groupEnd();
    }

    // endregion--------------------------------------------------------------------------------------------------------
}
