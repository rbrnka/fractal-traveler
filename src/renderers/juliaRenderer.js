import {updateInfo} from "../ui/ui";
import {FractalRenderer} from "./fractalRenderer";
import {compareComplex, hexToRGB, isTouchDevice, lerp, normalizeRotation, splitFloat,} from "../global/utils";
import "../global/types";
import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEG, EASE_TYPE, JULIA_PALETTES,} from "../global/constants";
import {updateJuliaSliders} from "../ui/juliaSlidersController";

/**
 * JuliaRenderer (Deep Zoom via Perturbation)
 *
 * @author Radim Brnka
 * @description This module defines a JuliaRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Julia set fractal and sets preset zoom-ins.
 * Reference orbit is for current c and a chosen z0_ref (near view center).
 * For each pixel:
 *   z0 = pan + zoom * rotated(st)
 *   dz0 = z0 - z0_ref
 *   dz_{n+1} = 2*zref*dz + dz^2   (NO +dc each step for Julia!)
 * @extends FractalRenderer
 */
export class JuliaRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.DEFAULT_ZOOM = 2.5;
        // Use less detailed initial set for less performant devices
        /** @type COMPLEX */
        this.DEFAULT_C = isTouchDevice() ? [0.355, 0.355] : [-0.246, 0.64235];

        this.zoom = this.DEFAULT_ZOOM;
        this.pan = [...this.DEFAULT_PAN]; // Copy
        this.rotation = this.DEFAULT_ROTATION;
        this.colorPalette = [...this.DEFAULT_PALETTE];
        // this.MAX_ZOOM = 0.00006;

        /** @type COMPLEX */
        this.c = [...this.DEFAULT_C];

        // --- Perturbation state ---
        this.refZ0 = [0, 0];
        this.orbitDirty = true;

        this._prevPan0 = NaN;
        this._prevPan1 = NaN;
        this._prevZoom = NaN;
        this._prevC0 = NaN;
        this._prevC1 = NaN;

        this.MAX_ITER = 2000;
        this.REF_SEARCH_GRID = 5;
        this.REF_SEARCH_RADIUS = 0.50;

        this.orbitTex = null;
        this.orbitData = null;
        this.floatTexExt = null;

        // @formatter:off
        /** @type {Array.<JULIA_PRESET>} */
        this.PRESETS = [
            {
                c: this.DEFAULT_C,
                zoom: this.DEFAULT_ZOOM,
                rotation: this.DEFAULT_ROTATION,
                pan: this.DEFAULT_PAN,
                title: 'Default view'
            },
            {c: [0.34, -0.05], zoom: 3.5, rotation: DEG._90, pan: [0, 0], title: 'Spiral Galaxies'},
            {c: [0.285, 0.01], zoom: 3.5, rotation: DEG._90, pan: [0, 0], title: 'Near Julia set border'},
            {c: [-1.76733, 0.00002], zoom: 0.5, rotation: 0, pan: [0, 0], title: 'Mandelbrothers'},
            {c: [-0.4, 0.6], zoom: 3.5, rotation: DEG._120, pan: [0, 0], title: 'Black Holes'},
            {c: [-0.70176, -0.3842], zoom: 3.5, rotation: DEG._150, pan: [0, 0], title: 'Dancing Snowflakes'},
            {c: [-0.835, -0.232], zoom: 3.5, rotation: DEG._150, pan: [0, 0], title: 'Kissing Dragons'},
            {c: [-0.75, 0.1], zoom: 3.5, rotation: DEG._150, pan: [0, 0], title: 'Main cardioid'},
            {c: [-0.744539860355905, 0.121723773894425], zoom: 1.8, rotation: DEG._30, pan: [0, 0], title: 'Seahorse Valley'},
            {c: [-1.74876455, 0], zoom: 0.45, rotation: DEG._90, pan: [0, 0], title: 'The Cauliflower Medallion'},
            // Extended presets
            {c: [-0.1060055299522249,0.9257297130853293], rotation: 5.933185307179583, pan: [0, 0], zoom: 0.11, title: '?'},
            {c: [-0.7500162952792153,0.0032826017747574765], zoom: 1.7, rotation: 0, pan: [0, 0], title: 'The Clown'},
            {pan: [0.1045565992379065,0.0073015054986378], rotation: 5.473185307179595, zoom: 1.6581189769919353, c: [-0.12129038469447653,0.649576297434808]},
            {c: [-0.1, 0.651], zoom: 3.5, rotation: DEG._90, pan: [0, 0], title: ''},
            {c: [-1.25066, 0.02012], zoom: 3.5,rotation: 0, pan: [0, 0], title: 'Deep zoom'},
            {rotation: 0, zoom: 0.2589096374896196, c: [-1.768967328653661,0.0019446820495425676], pan: [0, 0], title: 'Serpent'},
            {pan: [0,0], rotation: 5.41318530717958, zoom: 2.1068875547385417, c: [0.3072075408559901,0.48395526205533185], title: ''},
            {pan: [0, 0], rotation: 2.370000000000001, zoom: 0.12255613179332117, c: [-0.5925376099331446,0.6218581017272109], title: ''},
            {pan: [0,0], rotation: 0, zoom: 0.29302566239489597, c: [-1.768927341692215,-0.009640117346988308]},

            {pan: [0.12908510596292824,-0.13588306846615342], rotation: 1.699999999999994, zoom: 0.12982442828873209, c: [0.3633977303405407,0.3166912692104581]},
            {pan: [0.10410036735673252,-0.10610085351477151], rotation: 4.863185307179592, zoom: 1.8513247913869684, c: [0.3586059096423313,0.32287599414730545]},
            {pan: [0, 0], rotation: 1.9299999999999926, zoom: 1.322314018297482, c: [0.1294753560021048,0.6256313013048348]}

            // TODO CLEANUP AND CENTER
            // {pan: [0.08428823245534856,0.01811121963121005], rotation: 1.8199999999999967, zoom: 1.600537687038365, c: [0.30700179139276473,0.48388169438789685]}
            // {c: [0.45, 0.1428], zoom: 3.5, rotation: DEG._90, pan: [0, 0], title: ''},
        ];
        // @formatter:on

        /** @type {Array.<DIVE>} */
        this.DIVES = [
            {
                pan: [0, 0],
                rotation: 0,
                zoom: 1.7,
                startC: [-0.246, 0.64],
                step: 0.000005,

                cxDirection: 1,
                cyDirection: 1,
                endC: [-0.2298, 0.67],

                title: 'Orbiting Black holes'
            },
            {
                pan: [0, 0],
                startC: [-0.25190652273600045, 0.637461568487061],
                endC: [-0.2526, 0.6355],
                cxDirection: -1,
                cyDirection: -1,
                rotation: 0,
                zoom: 0.05,
                step: 0.00000005,

                title: 'Dimensional Collision'
            },
            {
                pan: [-0.31106298032702495, 0.39370074960517293],
                rotation: 1.4999999999999947,
                zoom: 0.3829664619602934,
                startC: [-0.2523365227360009, 0.6386621652418372],
                step: 0.00001,

                cxDirection: -1,
                cyDirection: -1,
                endC: [-0.335, 0.62],

                title: 'Life of a Star'
            },
            {
                pan: [-0.6838279169792393, 0.46991716118236204],
                rotation: 0,
                zoom: 0.04471011402132469,
                startC: [-0.246, 0.6427128691849591],
                step: 0.0000005,

                cxDirection: -1,
                cyDirection: -1,
                endC: [-0.247, 0.638],

                title: 'Tipping points'
            },
            {
                pan: [0.5160225367869309, -0.05413028639548453],
                rotation: 2.6179938779914944,
                zoom: 0.110783,
                startC: [-0.78, 0.11],
                step: 0.00001,

                cxDirection: 1,
                cyDirection: 1,
                endC: [-0.7425, 0.25],

                title: 'Hypnosis'
            }//, {
            //     pan: [0.47682225091699837, 0.09390869977189013],
            //     rotation: 5.827258771281306,
            //     zoom: 0.16607266879497062,
            //
            //     startC: [-0.750542394776536, 0.008450344098947803],
            //     endC: [-0.7325586,0.18251028375238866],
            //
            //     cxDirection: 1,
            //     cyDirection: 1,
            //
            //     step: 0.00001,
            //     phases: [2, 1, 4, 3],
            // }
        ];

        this.currentPaletteIndex = 0;
        this.innerStops = new Float32Array(JULIA_PALETTES[this.currentPaletteIndex].theme);

        this.currentCAnimationFrame = null;
        this.demoTime = 0;

        this.init();
    }

    /**
     * Perturbation renderers must expose orbit invalidation to shared interaction/animation code.
     */
    markOrbitDirty() {
        this.orbitDirty = true;
    }

    onProgramCreated() {
        this.floatTexExt = this.gl.getExtension("OES_texture_float");
        if (!this.floatTexExt) {
            console.error("Missing OES_texture_float. Julia deep zoom perturbation requires it.");
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

        if (this.orbitTexLoc) this.gl.uniform1i(this.orbitTexLoc, 0);
        if (this.orbitWLoc) this.gl.uniform1f(this.orbitWLoc, this.MAX_ITER);

        this.orbitDirty = true;
    }

    /**
     * @inheritDoc
     * @override
     */
    createFragmentShaderSource() {
        return `
            precision highp float;
        
            uniform vec2  u_resolution;
            uniform float u_rotation;
        
            // view pan hi/lo
            uniform vec2  u_pan_h;
            uniform vec2  u_pan_l;
        
            // zoom hi/lo
            uniform float u_zoom_h;
            uniform float u_zoom_l;
        
            // reference z0 (initial point) hi/lo
            uniform vec2  u_ref_z0_h;
            uniform vec2  u_ref_z0_l;
        
            // Julia constant
            uniform vec2  u_c;
            
            uniform float u_iterations;
            uniform vec3  u_innerStops[5];
            
            uniform sampler2D u_orbitTex;
            uniform float     u_orbitW;
            
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
            
                df2 pan = df2_make(
                    df_make(u_pan_h.x, u_pan_l.x),
                    df_make(u_pan_h.y, u_pan_l.y)
                );
            
                // z0 = pan + zoom * r
                df2 z0 = df2_add(
                    pan,
                    df2_make(df_mul_f(zoom, r.x), df_mul_f(zoom, r.y))
                );
            
                // z0ref
                df2 z0ref = df2_make(
                    df_make(u_ref_z0_h.x, u_ref_z0_l.x),
                    df_make(u_ref_z0_h.y, u_ref_z0_l.y)
                );
            
                // For Julia: dz starts as delta initial condition
                df2 dz = df2_make(df_sub(z0.x, z0ref.x), df_sub(z0.y, z0ref.y));
            
                float it = 0.0;
            
                for (int n = 0; n < MAX_ITER; n++) {
                    float fn = float(n);
                    if (fn >= u_iterations) { it = fn; break; }
                    
                    df2 zref = sampleZRef(n);
                    
                    float zx = df_to_float(zref.x) + df_to_float(dz.x);
                    float zy = df_to_float(zref.y) + df_to_float(dz.y);
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
                    float t = clamp(it / u_iterations, 0.0, 1.0);
                    t = 0.5 + 0.6 * sin(t * 4.0 * 3.14159265);
                    vec3 col = getColorFromMap(t);
                    gl_FragColor = vec4(col, 1.0);
                }
            }
        `;
    }

    /**
     * @inheritDoc
     * @override
     */
    updateUniforms() {
        super.updateUniforms();

        this.cLoc = this.gl.getUniformLocation(this.program, "u_c");
        this.innerStopsLoc = this.gl.getUniformLocation(this.program, "u_innerStops");

        this.panHLoc = this.gl.getUniformLocation(this.program, "u_pan_h");
        this.panLLoc = this.gl.getUniformLocation(this.program, "u_pan_l");
        this.zoomHLoc = this.gl.getUniformLocation(this.program, "u_zoom_h");
        this.zoomLLoc = this.gl.getUniformLocation(this.program, "u_zoom_l");
        this.refZ0HLoc = this.gl.getUniformLocation(this.program, "u_ref_z0_h");
        this.refZ0LLoc = this.gl.getUniformLocation(this.program, "u_ref_z0_l");

        this.orbitTexLoc = this.gl.getUniformLocation(this.program, "u_orbitTex");
        this.orbitWLoc = this.gl.getUniformLocation(this.program, "u_orbitW");
    }

    // --- Reference orbit building ---

    escapeItersJulia(zx0, zy0, iters) {
        let zx = zx0, zy = zy0;
        const cx = this.c[0], cy = this.c[1];
        for (let i = 0; i < iters; i++) {
            const zx2 = zx * zx - zy * zy + cx;
            const zy2 = 2.0 * zx * zy + cy;
            zx = zx2; zy = zy2;
            if (zx * zx + zy * zy > 4.0) return i;
        }
        return iters;
    }

    pickReferenceNearViewCenter() {
        const grid = this.REF_SEARCH_GRID;
        const half = (grid - 1) / 2;
        const step = (2.0 * this.REF_SEARCH_RADIUS) / (grid - 1);

        const base = this.zoom;
        const probeIters = Math.min(this.MAX_ITER, Math.max(200, Math.floor(this.iterations)));

        let bestX = this.pan[0];
        let bestY = this.pan[1];
        let bestScore = -1;

        for (let j = 0; j < grid; j++) {
            for (let i = 0; i < grid; i++) {
                const ox = (i - half) * step;
                const oy = (j - half) * step;

                const zx0 = this.pan[0] + ox * base;
                const zy0 = this.pan[1] + oy * base;

                const score = this.escapeItersJulia(zx0, zy0, probeIters);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = zx0;
                    bestY = zy0;
                }
            }
        }

        this.refZ0[0] = bestX;
        this.refZ0[1] = bestY;
    }

    computeReferenceOrbit() {
        if (!this.orbitData || !this.orbitTex) return;

        const cx = this.c[0];
        const cy = this.c[1];

        let zx = this.refZ0[0];
        let zy = this.refZ0[1];

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
            zx = zx2; zy = zy2;

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

    needsRebase() {
        const dx = this.pan[0] - this.refZ0[0];
        const dy = this.pan[1] - this.refZ0[1];
        return Math.hypot(dx, dy) > this.zoom * 0.75;
    }

    draw() {
        this.gl.useProgram(this.program);

        const safe = Math.max(this.zoom, 1e-300);
        const baseIters = Math.floor(200 + 50 * Math.log10(this.DEFAULT_ZOOM / safe));
        this.iterations = Math.max(50, Math.min(this.MAX_ITER, baseIters + this.extraIterations));

        const panMoved =
            Number.isFinite(this._prevPan0) && Number.isFinite(this._prevPan1)
                ? (Math.abs(this.pan[0] - this._prevPan0) + Math.abs(this.pan[1] - this._prevPan1)) > (this.zoom * 1e-6)
                : true;

        const zoomChanged =
            Number.isFinite(this._prevZoom)
                ? Math.abs(this.zoom - this._prevZoom) > (this.zoom * 1e-8)
                : true;

        const cChanged =
            Number.isFinite(this._prevC0) && Number.isFinite(this._prevC1)
                ? (Math.abs(this.c[0] - this._prevC0) + Math.abs(this.c[1] - this._prevC1)) > 0.0
                : true;

        if (panMoved || zoomChanged || cChanged) {
            this.orbitDirty = true;
            this._prevPan0 = this.pan[0];
            this._prevPan1 = this.pan[1];
            this._prevZoom = this.zoom;
            this._prevC0 = this.c[0];
            this._prevC1 = this.c[1];
        }

        // Rebase policy (same intent as Mandelbrot):
        // - avoid rebuilding orbit every frame during interaction (prevents swim/jitter)
        // - but if c changes, we must rebuild for correctness
        const mustRebaseNow = cChanged || this.needsRebase();
        // const canRebaseNow = !this.interactionActive || mustRebaseNow;

        if (this.orbitDirty && mustRebaseNow) {
            this.pickReferenceNearViewCenter();
            this.computeReferenceOrbit();
            this.orbitDirty = false;
        }

        // Upload pan hi/lo
        const px = splitFloat(this.pan[0]);
        const py = splitFloat(this.pan[1]);
        if (this.panHLoc) this.gl.uniform2f(this.panHLoc, px.high, py.high);
        if (this.panLLoc) this.gl.uniform2f(this.panLLoc, px.low, py.low);

        // Upload zoom hi/lo
        const z = splitFloat(this.zoom);
        if (this.zoomHLoc) this.gl.uniform1f(this.zoomHLoc, z.high);
        if (this.zoomLLoc) this.gl.uniform1f(this.zoomLLoc, z.low);

        // Upload ref z0 hi/lo
        const rx = splitFloat(this.refZ0[0]);
        const ry = splitFloat(this.refZ0[1]);
        if (this.refZ0HLoc) this.gl.uniform2f(this.refZ0HLoc, rx.high, ry.high);
        if (this.refZ0LLoc) this.gl.uniform2f(this.refZ0LLoc, rx.low, ry.low);

        if (this.cLoc) this.gl.uniform2fv(this.cLoc, this.c);
        if (this.innerStopsLoc) this.gl.uniform3fv(this.innerStopsLoc, this.innerStops);

        super.draw();
    }

    /**
     * @inheritDoc
     * @override
     */
    reset() {
        this.c = [...this.DEFAULT_C];
        this.innerStops = new Float32Array(JULIA_PALETTES[0].theme);
        this.currentPaletteIndex = 0;

        this.orbitDirty = true;
        this._prevPan0 = NaN;
        this._prevPan1 = NaN;
        this._prevZoom = NaN;
        this._prevC0 = NaN;
        this._prevC1 = NaN;

        super.reset();
    }

    // region > ANIMATION METHODS --------------------------------------------------------------------------------------

    /** Stops currently running pan animation */
    stopCurrentCAnimation() {
        console.log(`%c ${this.constructor.name}: %c stopCurrentCAnimation`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.currentCAnimationFrame !== null) {
            cancelAnimationFrame(this.currentCAnimationFrame);
            this.currentCAnimationFrame = null;
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    stopAllNonColorAnimations() {
        this.stopCurrentCAnimation();

        super.stopAllNonColorAnimations();
    }

    /**
     * Returns id/title of the next color theme in the themes array.
     * @return {string}
     */
    getNextColorThemeId() {
        const nextTheme = JULIA_PALETTES[(this.currentPaletteIndex + 1) % JULIA_PALETTES.length];

        return nextTheme.id || 'Random';
    }

    /**
     * Smoothly transitions the inner color stops (used by the shader for inner coloring)
     * from the current value to the provided toPalette over the specified duration.
     * Also updates the colorPalette to match the theme (using the first stop, for example).
     *
     * @param {JULIA_PALETTE} toPalette - The target theme as an array of numbers (e.g., 15 numbers for 5 stops).
     * @param {number} [duration=250] - Duration of the transition in milliseconds.
     * @param {Function} [callback] - A callback invoked when the transition completes.
     * @return {Promise<void>}
     */
    async animateInnerStopsTransition(toPalette, duration = 250, callback = null) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateInnerStopsTransition`, CONSOLE_GROUP_STYLE);
        this.stopCurrentColorAnimations();

        // Save the starting stops as a plain array.
        const startStops = Array.from(this.innerStops);

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Interpolate each component of the inner stops.
                const interpolated = startStops.map((v, i) => lerp(v, toPalette.theme[i], progress));
                this.innerStops = new Float32Array(interpolated);

                let keyColor;

                if (toPalette.keyColor) {
                    keyColor = hexToRGB(toPalette.keyColor);
                    if (keyColor) this.colorPalette = [keyColor.r, keyColor.g, keyColor.b];
                }

                if (!keyColor) {
                    const stopIndex = 3;
                    this.colorPalette = [
                        toPalette.theme[stopIndex * 3] * 1.5,
                        toPalette.theme[stopIndex * 3 + 1] * 1.5,
                        toPalette.theme[stopIndex * 3 + 2] * 1.5
                    ];
                }

                this.draw();

                if (callback) callback();

                if (progress < 1) {
                    this.currentColorAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentColorAnimations();
                    console.groupEnd();
                    resolve();
                }
            };

            this.currentColorAnimationFrame = requestAnimationFrame(step);
        });
    }

    /** @inheritDoc */
    async animateColorPaletteTransition(duration = 250, coloringCallback = null) {
        this.currentPaletteIndex = (this.currentPaletteIndex + 1) % JULIA_PALETTES.length;

        await this.animateInnerStopsTransition(JULIA_PALETTES[this.currentPaletteIndex], duration, coloringCallback);
    }

    /** @inheritDoc */
    async animateFullColorSpaceCycle(duration = 15000, coloringCallback = null) {
        await new Promise(() => {
            this.animateColorPaletteTransition(duration, coloringCallback);
        });
    }

    /**
     * Animates Julia from current C to target C
     *
     * @param {COMPLEX} [targetC] Defaults to default C
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animateToC(targetC = [...this.DEFAULT_C], duration = 500, easeFunction = EASE_TYPE.QUINT) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateToC`, CONSOLE_GROUP_STYLE);
        this.stopCurrentCAnimation();

        if (compareComplex(this.c, targetC)) {
            console.log(`Already at the target c. Skipping.`);
            console.groupEnd();
            return;
        }

        console.log(`Animating c from ${this.c} to ${targetC}.`);

        const startC = [...this.c];

        await new Promise((resolve) => {
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);

                // Interpolate `c` smoothly
                const easedProgress = easeFunction(progress);
                this.c[0] = lerp(startC[0], targetC[0], easedProgress);
                this.c[1] = lerp(startC[1], targetC[1], easedProgress);

                // c changes require orbit rebuild for correctness (but keep same gating in draw()).
                this.markOrbitDirty();

                this.draw();

                updateInfo(true);
                updateJuliaSliders();

                if (progress < 1) {
                    this.currentCAnimationFrame = requestAnimationFrame(step);
                } else {
                    this.stopCurrentCAnimation();
                    this.onAnimationFinished();
                    console.groupEnd();
                    resolve();
                }
            };
            this.currentCAnimationFrame = requestAnimationFrame(step);
        });
    }

    /**
     * Animates Julia from current C and zoom to target C and zoom
     *
     * @param {number} [targetZoom] Target zoom
     * @param {COMPLEX} [targetC] Defaults to default C
     * @param {number} [duration] in ms
     * @param {EASE_TYPE|Function} easeFunction
     * @return {Promise<void>}
     */
    async animateToZoomAndC(targetZoom, targetC = [...this.DEFAULT_C], duration = 500, easeFunction = EASE_TYPE.QUINT) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateToZoomAndC`, CONSOLE_GROUP_STYLE);
        this.stopCurrentCAnimation();

        await Promise.all([
            this.animateZoomTo(targetZoom, duration, easeFunction),
            this.animateToC(targetC, duration, easeFunction)
        ]);
        console.groupEnd();
    }

    /**
     * Animates travel to a preset.
     * @param {JULIA_PRESET} preset
     * @param {number} [duration] in ms
     * @return {Promise<void>}
     */
    async animateTravelToPreset(preset, duration = 500) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateTravelToPreset`, CONSOLE_GROUP_STYLE);
        this.stopAllNonColorAnimations();

        // Phase 1: Setting default params.
        await this.animatePanAndZoomTo(this.DEFAULT_PAN, this.DEFAULT_ZOOM, 1000);

        // Phase 2: Animating to preset.
        await Promise.all([
            this.animateZoomTo(preset.zoom, duration, EASE_TYPE.QUINT),
            this.animateToC(preset.c, duration),
            this.animateRotationTo(preset.rotation, duration, EASE_TYPE.QUINT),
            this.animatePanTo(preset.pan, duration, EASE_TYPE.QUINT)
        ]);

        this.currentPresetIndex = preset.id || 0;

        console.groupEnd();
    }

    /**
     * @inheritDoc
     */
    async animateTravelToPresetWithRandomRotation(preset, zoomOutDuration, panDuration, zoomInDuration) {
        return Promise.resolve(); // TODO implement someday if needed
    }

    /**
     * Infinite animation of the dive (c-param interpolations)
     * @param {DIVE} dive
     * @return {Promise<void>}
     */
    async animateDive(dive) {
        console.groupCollapsed(`%c ${this.constructor.name}: animateDive`, CONSOLE_GROUP_STYLE);
        this.stopCurrentCAnimation();

        console.log(`Diving to ${dive}.`);

        // Return a Promise that never resolves (continuous animation)
        await new Promise(() => {
            // Ensure phases are defined
            dive.phases ||= [1, 2, 3, 4];
            let phase = dive.phases[0];

            const diveStep = () => {
                const step = dive.step;
                // Phase 1: Animate cx (real part) toward endC[0]
                if (phase === 1) {
                    this.c[0] += dive.cxDirection * step;
                    if ((dive.cxDirection < 0 && this.c[0] <= dive.endC[0]) || (dive.cxDirection > 0 && this.c[0] >= dive.endC[0])) {
                        this.c[0] = dive.endC[0];
                        phase = 2;
                    }
                }
                // Phase 2: Animate cy (imaginary part) toward endC[1]
                else if (phase === 2) {
                    this.c[1] += dive.cyDirection * step;
                    if ((dive.cyDirection < 0 && this.c[1] <= dive.endC[1]) || (dive.cyDirection > 0 && this.c[1] >= dive.endC[1])) {
                        this.c[1] = dive.endC[1];
                        phase = 3;
                    }
                }
                // Phase 3: Animate cx back toward startC[0]
                else if (phase === 3) {
                    this.c[0] -= dive.cxDirection * step;
                    if ((dive.cxDirection < 0 && this.c[0] >= dive.startC[0]) || (dive.cxDirection > 0 && this.c[0] <= dive.startC[0])) {
                        this.c[0] = dive.startC[0];
                        phase = 4;
                    }
                }
                // Phase 4: Animate cy back toward startC[1]
                else if (phase === 4) {
                    this.c[1] -= dive.cyDirection * step;
                    if ((dive.cyDirection < 0 && this.c[1] >= dive.startC[1]) || (dive.cyDirection > 0 && this.c[1] <= dive.startC[1])) {
                        this.c[1] = dive.startC[1];
                        phase = 1; // Loop back to start phase.
                    }
                }

                this.markOrbitDirty();

                this.draw();
                updateInfo(true);
                updateJuliaSliders();

                this.currentCAnimationFrame = requestAnimationFrame(diveStep);
            };
            this.currentCAnimationFrame = requestAnimationFrame(diveStep);
        });
    }

    /**
     * Animates infinite demo loop with oscillating c between predefined values
     * @return {Promise<void>}
     */
    async animateDemo() {
        console.log(`%c ${this.constructor.name}: animateDemo`, CONSOLE_GROUP_STYLE);
        this.stopAllNonColorAnimations();

        this.demoActive = true; // Not used in Julia but the demo is active

        // Return a Promise that never resolves (continuous animation)
        await new Promise(() => {
            const step = () => {
                this.c = [
                    ((Math.sin(this.demoTime) + 1) / 2) * 1.5 - 1,   // Oscillates between -1 and 0.5
                    ((Math.cos(this.demoTime) + 1) / 2) * 1.4 - 0.7  // Oscillates between -0.7 and 0.7
                ];
                this.rotation = normalizeRotation(this.rotation - 0.001);
                this.demoTime += 0.0005; // Speed

                this.markOrbitDirty();

                this.draw();
                updateInfo(true);
                updateJuliaSliders();

                this.currentCAnimationFrame = requestAnimationFrame(step);
            };
            this.currentCAnimationFrame = requestAnimationFrame(step);
        });
    }

    // endregion--------------------------------------------------------------------------------------------------------
}