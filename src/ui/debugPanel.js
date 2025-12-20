import {ddValue} from "../global/utils";

/**
 * @author Radim Brnka
 * @description Provides an on-screen debugging panel for monitoring real-time application performance,
 * GPU capabilities, and rendering diagnostics related to WebGL fractal rendering.
 */
export class DebugPanel {

    panelSelector='debugInfo';

    constructor(canvas, fractalApp) {
        this.canvas = canvas;
        this.fractalApp = fractalApp;
        this.gl = fractalApp?.gl;

        this.debugInfo = document.getElementById(this.panelSelector);
        if (!this.debugInfo) {
            console.warn(`DebugPanel: #${this.panelSelector} element not found.`);
            return;
        }

        // Toggle visibility on creation (your original behavior)
        this.debugInfo.style.display =
            this.debugInfo.style.display === "block" ? "none" : "block";

        this.debugInfo.addEventListener("click", (e) => {
            console.log(this.debugInfo.innerText);
        });

        // ---- Extensions / GPU info (cached) ----
        this.extTimer =
            this.gl?.getExtension("EXT_disjoint_timer_query") ||
            this.gl?.getExtension("EXT_disjoint_timer_query_webgl2") ||
            null;

        // Renderer info (optional, blocked in some browsers unless allowed)
        this.extRendererInfo =
            this.gl?.getExtension("WEBGL_debug_renderer_info") || null;

        this.gpu = {
            vendor: "unknown",
            renderer: "unknown",
            unmaskedVendor: null,
            unmaskedRenderer: null,
            webglVersion: "unknown",
            shadingLanguageVersion: "unknown",
            maxTextureSize: null,
            maxVaryings: null,
            maxFragUniforms: null,
            maxVertUniforms: null,
            maxViewportDims: null,
        };

        this._initGpuInfo();

        // ---- Persistent perf state ----
        this.perf = {
            // rAF timing
            lastRafTs: performance.now(),
            fps: 0,
            frameMs: 0,
            frameMsSmoothed: NaN,

            // CPU timing of this panel update itself (not your fractal draw)
            panelCpuMs: 0,
            panelCpuMsSmoothed: NaN,

            // GPU timing via timer query (requires beginGpuTimer/endGpuTimer around draw)
            gpuSupported: !!this.extTimer,
            gpuMs: NaN,
            gpuMsSmoothed: NaN,
            gpuDisjoint: false,

            // Timer query bookkeeping
            queryInFlight: null,
            pendingQueries: [],
        };

        // Bind-safe update loop
        requestAnimationFrame(this.update);
    }

    _initGpuInfo() {
        const gl = this.gl;
        if (!gl) return;

        try {
            this.gpu.webglVersion = gl.getParameter(gl.VERSION) || "unknown";
            this.gpu.shadingLanguageVersion =
                gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || "unknown";
            this.gpu.vendor = gl.getParameter(gl.VENDOR) || "unknown";
            this.gpu.renderer = gl.getParameter(gl.RENDERER) || "unknown";

            this.gpu.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            this.gpu.maxVaryings = gl.getParameter(gl.MAX_VARYING_VECTORS);
            this.gpu.maxFragUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
            this.gpu.maxVertUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
            this.gpu.maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);

            if (this.extRendererInfo) {
                const v = gl.getParameter(
                    this.extRendererInfo.UNMASKED_VENDOR_WEBGL
                );
                const r = gl.getParameter(
                    this.extRendererInfo.UNMASKED_RENDERER_WEBGL
                );
                this.gpu.unmaskedVendor = v || null;
                this.gpu.unmaskedRenderer = r || null;
            }
        } catch (e) {
            // Some browsers throw on blocked params; keep defaults
            console.warn("DebugPanel: GPU info query failed:", e);
        }
    }

    // ---- GPU timer query helpers ----
    beginGpuTimer() {
        if (!this.extTimer || !this.gl) return;
        if (this.perf.queryInFlight) return; // keep it simple: one in flight

        // EXT_disjoint_timer_query is async; begin/end must bracket the draw call
        const q = this.extTimer.createQueryEXT();
        this.extTimer.beginQueryEXT(this.extTimer.TIME_ELAPSED_EXT, q);
        this.perf.queryInFlight = q;
    }

    endGpuTimer() {
        if (!this.extTimer || !this.gl) return;
        if (!this.perf.queryInFlight) return;

        this.extTimer.endQueryEXT(this.extTimer.TIME_ELAPSED_EXT);
        this.perf.pendingQueries.push(this.perf.queryInFlight);
        this.perf.queryInFlight = null;
    }

    pollGpuTimers() {
        if (!this.extTimer || !this.gl) return;

        // disjoint means the result is unreliable (clock reset / driver event)
        const disjoint = this.gl.getParameter(this.extTimer.GPU_DISJOINT_EXT);
        this.perf.gpuDisjoint = !!disjoint;

        if (this.perf.pendingQueries.length === 0) return;

        // Read the oldest query only (avoid stalls)
        const q = this.perf.pendingQueries[0];
        const available = this.extTimer.getQueryObjectEXT(
            q,
            this.extTimer.QUERY_RESULT_AVAILABLE_EXT
        );
        if (!available) return;

        const ns = this.extTimer.getQueryObjectEXT(q, this.extTimer.QUERY_RESULT_EXT);
        this.extTimer.deleteQueryEXT(q);
        this.perf.pendingQueries.shift();

        if (!this.perf.gpuDisjoint) {
            const ms = ns / 1e6;
            this.perf.gpuMs = ms;
            this.perf.gpuMsSmoothed = this.smooth(this.perf.gpuMsSmoothed, ms, 0.15);
        } else {
            this.perf.gpuMs = NaN;
            // keep previous smoothed value; disjoint is a transient condition
        }
    }

    smooth(prev, next, alpha) {
        if (!Number.isFinite(next)) return prev;
        if (!Number.isFinite(prev)) return next;
        return prev + (next - prev) * alpha;
    }

    update = (ts) => {
        if (!this.debugInfo || !this.fractalApp) return;

        const t0 = performance.now();

        // Poll GPU timers first (results arrive later)
        this.pollGpuTimers();

        // rAF timing / FPS
        const dt = ts - this.perf.lastRafTs;
        this.perf.lastRafTs = ts;
        this.perf.frameMs = dt;
        this.perf.frameMsSmoothed = this.smooth(this.perf.frameMsSmoothed, dt, 0.1);
        this.perf.fps = dt > 0 ? 1000 / dt : 0;

        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        const gl = this.fractalApp.gl;
        const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        const hpInfo = {precision: hp.precision, rangeMin: hp.rangeMin, rangeMax: hp.rangeMax};

        const viewPanX = ddValue(this.fractalApp.panDD.x);
        const viewPanY = ddValue(this.fractalApp.panDD.y);

        const refPanX = this.fractalApp.pan[0];
        const refPanY = this.fractalApp.pan[1];

        const zoom = this.fractalApp.zoom;
        const safeZoom = Math.max(zoom, 1e-300);

        // Scale diagnostics
        const pxPerUnit = this.canvas.width / safeZoom;
        const unitPerPx = safeZoom / this.canvas.width;

        // Precision stress heuristics
        const absPan = Math.hypot(viewPanX, viewPanY);
        const panOverZoom = absPan / safeZoom;
        const mantissaUsedApprox = Math.log2(Math.max(panOverZoom, 1e-300));

        // Perturbation drift
        const driftAbs = Math.hypot(viewPanX - refPanX, viewPanY - refPanY);
        const driftViewUnits = driftAbs / safeZoom;

        const orbitStatus = this.fractalApp.orbitDirty ? "DIRTY" : "cached";
        const zoomBucket = Math.floor(-Math.log10(safeZoom));

        // ---------- Coloring helpers ----------
        const esc = (s) =>
            String(s)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;");

        const levelClass = (level) => {
            if (level === "bad") return "dbg-bad";
            if (level === "warn") return "dbg-warn";
            return "dbg-ok";
        };

        // ---------- Precision health model ----------
        let score = 100;

        let panLevel = "ok";
        if (mantissaUsedApprox > 44) {
            panLevel = "bad";
            score -= 40;
        } else if (mantissaUsedApprox > 34) {
            panLevel = "warn";
            score -= 20;
        } else if (mantissaUsedApprox > 28) {
            panLevel = "warn";
            score -= 10;
        }

        let driftLevel = "ok";
        if (driftViewUnits > 1.0) {
            driftLevel = "bad";
            score -= 25;
        } else if (driftViewUnits > 0.5) {
            driftLevel = "warn";
            score -= 12;
        } else if (driftViewUnits > 0.25) {
            driftLevel = "warn";
            score -= 6;
        }

        let scaleLevel = "ok";
        if (pxPerUnit < 0.75) {
            scaleLevel = "warn";
            score -= 10;
        }
        if (pxPerUnit < 0.25) {
            scaleLevel = "bad";
            score -= 20;
        }

        score = Math.max(0, Math.min(100, Math.round(score)));

        let healthLevel = "ok";
        if (score < 70) healthLevel = "warn";
        if (score < 45) healthLevel = "bad";

        const worst =
            healthLevel === "bad" || healthLevel === "warn"
                ? ` (pan:${panLevel}, drift:${driftLevel}, scale:${scaleLevel})`
                : "";

        // ---------- Performance / bottleneck heuristics ----------
        // Typical: if GPU_ms_smooth is close to frame budget, you're GPU-bound.
        const frameBudgetMs = 1000 / 60; // 16.67ms
        const gpuSmooth = this.perf.gpuMsSmoothed;
        const gpuLevel =
            !Number.isFinite(gpuSmooth) ? "ok"
                : gpuSmooth > 22 ? "bad"
                    : gpuSmooth > 14 ? "warn"
                        : "ok";

        const fpsLevel =
            this.perf.fps < 30 ? "bad"
                : this.perf.fps < 50 ? "warn"
                    : "ok";

        // panel CPU time (debug UI overhead)
        const panelCpuMs = performance.now() - t0;
        this.perf.panelCpuMs = panelCpuMs;
        this.perf.panelCpuMsSmoothed = this.smooth(this.perf.panelCpuMsSmoothed, panelCpuMs, 0.2);

        const gpuHint =
            this.perf.gpuSupported
                ? (Number.isFinite(gpuSmooth)
                    ? (gpuSmooth > frameBudgetMs ? "Likely GPU-bound" : "GPU OK")
                    : "GPU timer available (wrap draw with begin/end)")
                : "No GPU timer support";

        // ---------- Output ----------
        const gpuVendor =
            this.gpu.unmaskedVendor || this.gpu.vendor || "unknown";
        const gpuRenderer =
            this.gpu.unmaskedRenderer || this.gpu.renderer || "unknown";

        this.debugInfo.innerHTML = `
            <span class="dbg-title">DEBUG PANEL</span><span class="dbg-dim"> ('L' to toggle, draggable)</span><br/>
            <span class="dbg-dim">———————————————————————————————————————————————————————————————————</span><br/>
            <span class="dbg-title">FRAG highp</span>: precision=${esc(hpInfo.precision)} range=[${esc(hpInfo.rangeMin)}, ${esc(hpInfo.rangeMax)}]<br/>
            <span class="dbg-title">css</span>=${esc(rect.width.toFixed(1))}x${esc(rect.height.toFixed(1))} <span class="dbg-dim">dpr=${esc(dpr)}</span><br/>
            <span class="dbg-title">buf</span>=${esc(this.canvas.width)}x${esc(this.canvas.height)}<br/>
            <br/>
            <span class="dbg-title">viewPan</span>=[${esc(viewPanX.toFixed(24))}, ${esc(viewPanY.toFixed(24))}]<br/>
            <span class="dbg-title">refPan</span>     =[${esc(refPanX.toFixed(24))}, ${esc(refPanY.toFixed(24))}]<br/>
            <span class="dbg-title">zoom</span>=${esc(zoom.toFixed(20))}<br/>
            <br/>
            <span class="dbg-title">———— Scale ————</span><br/>
            zoomExp=[${esc(zoom.toExponential(1))}]  <span class="dbg-dim">zoomBucket=1e-${esc(zoomBucket)}</span><br/>
            px/unit=<span class="${levelClass(scaleLevel)}">${esc(pxPerUnit.toExponential(3))}</span><br/>
            unit/px=<span class="${levelClass(scaleLevel)}">${esc(unitPerPx.toExponential(3))}</span><br/>
            <br/>
            <span class="dbg-title">———— Precision stress (heuristics) ————</span><br/>
            <span class="dbg-title">iters</span>=${esc(this.fractalApp.iterations.toFixed(0))} (MAX_ITER=${esc(this.fractalApp.MAX_ITER)})<br/>
            Precision health:<span class="dbg-badge ${levelClass(healthLevel)}">${score}/100</span><span class="dbg-dim">${esc(worst)}</span><br/>
            |pan|=${esc(absPan.toExponential(3))}<br/>
            |pan|/zoom=<span class="${levelClass(panLevel)}">${esc(panOverZoom.toExponential(3))}</span><br/>
            log2(|pan|/zoom)≈<span class="${levelClass(panLevel)}">${esc(mantissaUsedApprox.toFixed(1))}</span> <span class="dbg-dim">(larger ⇒ cancellation risk ↑)</span><br/>
            <br/>
            <span class="dbg-title">———— Perturbation ————</span><br/>
            ref drift (abs)=${esc(driftAbs.toExponential(3))}<br/>
            ref drift/zoom=<span class="${levelClass(driftLevel)}">${esc(driftViewUnits.toFixed(3))}</span> <span class="dbg-dim">view-units</span><br/>
            refPick=${esc(this.fractalApp ? (this.fractalApp.bestScore + "/" + this.fractalApp.probeIters) : "cached")}<br/>
            orbit=<span class="${this.fractalApp.orbitDirty ? "dbg-warn" : "dbg-ok"}">${esc(orbitStatus)}</span><br/>
            <br/>
            <span class="dbg-title">———— Performance ————</span><br/>
            FPS=<span class="${levelClass(fpsLevel)}">${esc(this.perf.fps.toFixed(1))}</span> <span class="dbg-dim">(frame ${esc(this.perf.frameMsSmoothed?.toFixed?.(2) ?? "n/a")} ms)</span><br/>
            debugUI=<span class="dbg-dim">${esc(this.perf.panelCpuMsSmoothed?.toFixed?.(2) ?? "n/a")} ms</span><br/>
            gpuTimer=${esc(this.perf.gpuSupported ? "yes" : "no")}<br/>
            gpuMs=<span class="${levelClass(gpuLevel)}">${esc(Number.isFinite(gpuSmooth) ? gpuSmooth.toFixed(2) : "n/a")}</span> <span class="dbg-dim">${esc(this.perf.gpuDisjoint ? "(disjoint)" : "")}</span><br/>
            hint=<span class="dbg-dim">${esc(gpuHint)}</span><br/>
            <br/>
            <span class="dbg-title">———— GPU ————</span><br/>
            ${esc(gpuVendor)}<br/>
            ${esc(gpuRenderer)}<br/>
            <span class="dbg-dim">${esc(this.gpu.webglVersion)}</span><br/>
            `;

        requestAnimationFrame(this.update);
    };

    toggle() {
        this.debugInfo.style.display = this.debugInfo.style.display === 'block' ? 'none' : 'block';
    }
}
