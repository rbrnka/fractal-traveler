import {ddValue, esc, isTouchDevice} from "../global/utils";
import {log, LOG_LEVEL} from "../global/constants";
import {getFractalMode, isAnimationActive, isJuliaMode} from "./ui";

/**
 * Debug Panel
 *
 * @author Radim Brnka
 * @description Provides an on-screen debugging panel for monitoring real-time application performance,
 * GPU capabilities, and rendering diagnostics related to WebGL fractal rendering.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */
export class DebugPanel {

    panelSelector = 'debugInfo';

    constructor(canvas, fractalApp) {
        this.canvas = canvas;
        this.fractalApp = fractalApp;
        this.gl = fractalApp?.gl;

        this.debugInfo = document.getElementById(this.panelSelector);
        if (!this.debugInfo) {
            console.warn(`DebugPanel: #${this.panelSelector} element not found.`);
            return;
        }

        if (isTouchDevice()) {
            let lastTap = 0;
            this.debugInfo.addEventListener("pointerdown", (e) => {
                const now = Date.now();
                if (now - lastTap < 300) { // Double tap detected
                    this.toggle();
                }
                lastTap = now;
                e.preventDefault();
            });
        }

        this.debugInfo.addEventListener("auxclick", (event) => {
            if (event.button === 1) {
                console.group('> DEBUG PANEL DUMP');
                log(this.debugInfo.innerText, this.constructor.name, LOG_LEVEL.DEBUG);
                console.groupEnd();

                let dump = this.debugInfo.innerText.substring(this.debugInfo.innerText.indexOf('FRAG'));

                navigator.clipboard.writeText(dump).then(function () {
                    log('Debug dump copied to clipboard!');
                }, function (err) {
                    log('Debug dump not copied to clipboard! ' + err.toString(), "", LOG_LEVEL.ERROR);
                });
            }
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

        // Toggle visibility on creation
        this.toggle();

        // Bind-safe update loop
        requestAnimationFrame(this.update);
    }

    setRenderer(renderer) {
        this.fractalApp = renderer || null;
        this.gl = renderer?.gl || null;
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

        const gl = this.gl;
        if (!gl || typeof gl.getShaderPrecisionFormat !== "function") return;

        const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

        const hpInfo = {precision: hp.precision, rangeMin: hp.rangeMin, rangeMax: hp.rangeMax};

        const viewPanX = ddValue(this.fractalApp.panDD.x);
        const viewPanY = ddValue(this.fractalApp.panDD.y);
        const cx = isJuliaMode() ? this.fractalApp.c[0] : 0;
        const cy = isJuliaMode() ? this.fractalApp.c[1] : 0;

        const refPanX = this.fractalApp.pan[0];
        const refPanY = this.fractalApp.pan[1];

        const zoom = this.fractalApp.zoom;
        const safeZoom = Math.max(zoom, 1e-300);

        // Scale diagnostics
        const pxPerUnit = this.canvas.width / safeZoom;

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

        // Animation state
        const animState = [];
        if (this.fractalApp.currentPanAnimationFrame) animState.push('pan');
        if (this.fractalApp.currentZoomAnimationFrame) animState.push('zoom');
        if (this.fractalApp.currentRotationAnimationFrame) animState.push('rotation');
        if (this.fractalApp.currentColorAnimationFrame) animState.push('color');
        if (this.fractalApp.currentCAnimationFrame) animState.push('c');
        const animStatus = animState.length > 0 ? animState.join(', ') : 'none';
        const isAnim = isAnimationActive();

        // Rotation (convert to degrees for readability)
        const rotationRad = this.fractalApp.rotation || 0;
        const rotationDeg = (rotationRad * 180 / Math.PI) % 360;

        // Color/palette info
        const paletteIdx = this.fractalApp.currentPaletteIndex;
        const paletteName = paletteIdx >= 0 && this.fractalApp.PALETTES?.[paletteIdx]?.id
            ? this.fractalApp.PALETTES[paletteIdx].id
            : (paletteIdx === -1 ? 'Random/Cycling' : 'n/a');
        const colorPalette = this.fractalApp.colorPalette || [0, 0, 0];

        // Mandelbrot-specific: frequency and phase
        const hasFreqPhase = this.fractalApp.frequency && this.fractalApp.phase;
        const freqStr = hasFreqPhase
            ? `[${this.fractalApp.frequency.map(v => v.toFixed(2)).join(', ')}]`
            : 'n/a';
        const phaseStr = hasFreqPhase
            ? `[${this.fractalApp.phase.map(v => v.toFixed(2)).join(', ')}]`
            : 'n/a';

        // DD precision breakdown
        const panDDx = this.fractalApp.panDD?.x;
        const panDDy = this.fractalApp.panDD?.y;
        const ddXhi = panDDx?.hi ?? 0;
        const ddXlo = panDDx?.lo ?? 0;
        const ddYhi = panDDy?.hi ?? 0;
        const ddYlo = panDDy?.lo ?? 0;

        // Last interaction time
        const lastInteraction = this.fractalApp._lastInteractionTime;
        const timeSinceInteraction = lastInteraction
            ? ((performance.now() - lastInteraction) / 1000).toFixed(1) + 's ago'
            : 'n/a';

        const gpuVendor = this.gpu.unmaskedVendor || this.gpu.vendor || "unknown";
        const gpuRenderer = this.gpu.unmaskedRenderer || this.gpu.renderer || "unknown";

        this.debugInfo.innerHTML = `
            <span class="dbg-title" id="copyDebugInfo">DEBUG PANEL</span><span class="dbg-dim"> ('L' to toggle, middle-click to copy)</span><br/>
            <span class="dbg-dim">───────────────────────────────────────────────────────</span><br/>
            <span class="dbg-title">FRAG highp</span>: precision=${esc(hpInfo.precision)} range=[${esc(hpInfo.rangeMin)}, ${esc(hpInfo.rangeMax)}]<br/>
            <span class="dbg-title">GPU</span>: ${esc(gpuRenderer)} <span class="dbg-dim">(${esc(gpuVendor)})</span><br/>
            <span class="dbg-title">Mode:</span> ${esc(getFractalMode())} <span class="dbg-dim">|</span> <span class="dbg-title">Canvas:</span> ${esc(this.canvas.width)}x${esc(this.canvas.height)} <span class="dbg-dim">(dpr=${esc(dpr)})</span><br/>
            <br/>
            <span class="dbg-title">———— Transform ————</span><br/>
            <span class="dbg-title">pan</span>=[${esc(viewPanX.toFixed(18))}, ${esc(viewPanY.toFixed(18))}]<br/>
            <span class="dbg-dim">  DD.x: hi=${esc(ddXhi.toExponential(6))} lo=${esc(ddXlo.toExponential(6))}</span><br/>
            <span class="dbg-dim">  DD.y: hi=${esc(ddYhi.toExponential(6))} lo=${esc(ddYlo.toExponential(6))}</span><br/>
            <span class="dbg-title">zoom</span>=${esc(zoom.toExponential(6))} <span class="dbg-dim">(1e-${esc(zoomBucket)})</span><br/>
            <span class="dbg-title">rotation</span>=${esc(rotationDeg.toFixed(2))}° <span class="dbg-dim">(${esc(rotationRad.toFixed(4))} rad)</span><br/>
            ${isJuliaMode() ? `<span class="dbg-title">c</span>=[${esc(cx.toFixed(12))}, ${esc(cy.toFixed(12))}]<br/>` : ''}
            <br/>
            <span class="dbg-title">———— Coloring ————</span><br/>
            <span class="dbg-title">palette</span>: <span class="${paletteIdx === -1 ? 'dbg-warn' : 'dbg-ok'}">${esc(paletteName)}</span> <span class="dbg-dim">(idx=${esc(paletteIdx)})</span><br/>
            <span class="dbg-title">theme</span>=[${colorPalette.map(v => v.toFixed(3)).join(', ')}]<br/>
            ${hasFreqPhase ? `<span class="dbg-title">freq</span>=${esc(freqStr)} <span class="dbg-title">phase</span>=${esc(phaseStr)}<br/>` : ''}
            <br/>
            <span class="dbg-title">———— State ————</span><br/>
            <span class="dbg-title">animations</span>: <span class="${animState.length > 0 ? 'dbg-warn' : 'dbg-ok'}">${esc(animStatus)}</span> ${isAnim ? '<span class="dbg-badge dbg-warn">ANIM</span>' : ''}<br/>
            <span class="dbg-title">iters</span>=${esc(this.fractalApp.iterations)} <span class="dbg-dim">(max=${esc(this.fractalApp.MAX_ITER)})</span><br/>
            <span class="dbg-title">orbit</span>=<span class="${this.fractalApp.orbitDirty ? 'dbg-warn' : 'dbg-ok'}">${esc(orbitStatus)}</span><br/>
            <span class="dbg-title">lastInput</span>: <span class="dbg-dim">${esc(timeSinceInteraction)}</span><br/>
            <br/>
            <span class="dbg-title">———— Precision ————</span><br/>
            <span class="dbg-title">health</span>:<span class="dbg-badge ${levelClass(healthLevel)}">${score}/100</span><span class="dbg-dim">${esc(worst)}</span><br/>
            px/unit=<span class="${levelClass(scaleLevel)}">${esc(pxPerUnit.toExponential(2))}</span> <span class="dbg-dim">|</span> log2(pan/z)=<span class="${levelClass(panLevel)}">${esc(mantissaUsedApprox.toFixed(1))}</span><br/>
            ref drift=<span class="${levelClass(driftLevel)}">${esc(driftViewUnits.toFixed(4))}</span> <span class="dbg-dim">view-units</span><br/>
            <br/>
            <span class="dbg-title">———— Performance ————</span><br/>
            <span class="dbg-title">FPS</span>=<span class="${levelClass(fpsLevel)}">${esc(this.perf.fps.toFixed(1))}</span> <span class="dbg-dim">(${esc(this.perf.frameMsSmoothed?.toFixed?.(1) ?? '?')}ms/frame)</span><br/>
            <span class="dbg-title">GPU</span>=<span class="${levelClass(gpuLevel)}">${esc(Number.isFinite(gpuSmooth) ? gpuSmooth.toFixed(2) + 'ms' : 'n/a')}</span> <span class="dbg-dim">${esc(gpuHint)}</span><br/>
            `;

        requestAnimationFrame(this.update);
    };

    /** Toggle the visibility of the debug panel. */
    toggle = () => {
        if (!this.debugInfo) return; // Safety check
        this.debugInfo.style.display = this.debugInfo.style.display === 'block' ? 'none' : 'block';
    }
}
