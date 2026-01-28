// jest.setup.js - Centralized test mocks and factory functions

// =============================================================================
// Mock WebGL Context
// =============================================================================
import {FRACTAL_TYPE} from "../global/constants";

const mockWebGLContext = {
    uniform1f: jest.fn(),
    uniform2f: jest.fn(),
    uniform2fv: jest.fn(),
    uniform3fv: jest.fn(),
    useProgram: jest.fn(),
    viewport: jest.fn(),
    clear: jest.fn(),
    clearColor: jest.fn(),
    createShader: jest.fn(() => ({})),
    shaderSource: jest.fn(),
    compileShader: jest.fn(),
    getShaderParameter: jest.fn(() => true),
    createProgram: jest.fn(() => ({})),
    attachShader: jest.fn(),
    linkProgram: jest.fn(),
    getProgramParameter: jest.fn(() => true),
    createBuffer: jest.fn(() => ({})),
    bindBuffer: jest.fn(),
    bufferData: jest.fn(),
    enableVertexAttribArray: jest.fn(),
    vertexAttribPointer: jest.fn(),
    drawArrays: jest.fn(),
    getUniformLocation: jest.fn(() => ({})),
    getAttribLocation: jest.fn(() => ({})),
};

// Store original getContext if it exists
const originalGetContext = HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return mockWebGLContext;
    }
    return originalGetContext ? originalGetContext.call(this, type) : null;
};

// =============================================================================
// Mock Clipboard API
// =============================================================================
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
    },
    writable: true,
});

// =============================================================================
// Mock Touch and TouchEvent for JSDOM
// =============================================================================
global.Touch = class {
    constructor({identifier, target, clientX, clientY}) {
        this.identifier = identifier;
        this.target = target;
        this.clientX = clientX;
        this.clientY = clientY;
    }
};

global.TouchEvent = class extends Event {
    constructor(type, {touches = [], changedTouches = [], bubbles = true, cancelable = true}) {
        super(type, {bubbles, cancelable});
        this.touches = touches;
        this.changedTouches = changedTouches;
    }
};

// =============================================================================
// Mock requestAnimationFrame / cancelAnimationFrame
// =============================================================================
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = jest.fn();

// =============================================================================
// Factory: Create Mock Canvas
// =============================================================================
global.createMockCanvas = (width = 800, height = 600, id = 'fractalCanvas') => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.id = id;
    return canvas;
};

// =============================================================================
// Factory: Create Mock FractalApp (with DD Precision for deep zoom tests)
// =============================================================================
global.createMockFractalApp = (canvas = null) => {
    const mockCanvas = canvas || global.createMockCanvas();

    // DD arithmetic helpers
    const twoSum = (a, b) => {
        const s = a + b;
        const bb = s - a;
        const err = (a - (s - bb)) + (b - bb);
        return {s, err};
    };

    const quickTwoSum = (a, b) => {
        const s = a + b;
        const err = b - (s - a);
        return {s, err};
    };

    const ddAdd = (dd, n) => {
        const t = twoSum(dd.hi, n);
        const lo = dd.lo + t.err;
        const r = quickTwoSum(t.s, lo);
        dd.hi = r.s;
        dd.lo = r.err;
    };

    // DD precision pan tracking
    const panDD = {
        x: {hi: -0.5, lo: 0},
        y: {hi: 0, lo: 0}
    };

    const fractalApp = {
        canvas: mockCanvas,
        pan: [-0.5, 0],
        panDD: panDD,
        c: [0, 0],
        rotation: 0,
        zoom: 1e-15, // Deep zoom level

        MAX_ZOOM: 1e-17,
        MIN_ZOOM: 400,
        DIVES: [{}, {}, {}],

        // Animation methods
        animatePanTo: jest.fn(() => Promise.resolve()),
        animateZoomTo: jest.fn(() => Promise.resolve()),
        animateZoomToNoPan: jest.fn(() => Promise.resolve()),
        animatePanBy: jest.fn(() => Promise.resolve()),
        animatePanAndZoomTo: jest.fn(() => Promise.resolve()),
        animatePanByAndZoomTo: jest.fn(() => Promise.resolve()),
        animateToC: jest.fn(() => Promise.resolve()),
        animateInfiniteRotation: jest.fn(() => Promise.resolve()),
        animateTravelToPreset: jest.fn(() => Promise.resolve()),
        animateDive: jest.fn(() => Promise.resolve()),

        // Control methods
        stopCurrentRotationAnimation: jest.fn(),
        stopAllNonColorAnimations: jest.fn(),
        stopCurrentColorAnimations: jest.fn(),
        startPaletteCycling: jest.fn(),
        applyPaletteByIndex: jest.fn(),

        noteInteraction: jest.fn(),
        markOrbitDirty: jest.fn(),
        // Rendering methods
        resizeCanvas: jest.fn(),
        draw: jest.fn(),
        updateInfo: jest.fn(),
        updateInfoOnAnimationFinished: jest.fn(),
        updateJuliaSliders: jest.fn(),

        // DD-aware addPan that preserves precision
        addPan: jest.fn((dx, dy) => {
            ddAdd(panDD.x, dx);
            ddAdd(panDD.y, dy);
            fractalApp.pan[0] = panDD.x.hi + panDD.x.lo;
            fractalApp.pan[1] = panDD.y.hi + panDD.y.lo;
        }),

        screenToFractal: jest.fn((x, y) => [x / 100, y / 100]),
        screenToViewVector: jest.fn((x, y) => {
            // Simulate view vector calculation
            const normX = x / 800;
            const normY = y / 600;
            return [normX - 0.5, (1 - normY) - 0.5];
        }),
        screenToPanDelta: jest.fn(function (x, y) {
            // Returns pan delta needed to center on screen point
            const [vx, vy] = this.screenToViewVector(x, y);
            return [vx * this.zoom, vy * this.zoom];
        }),
        setZoomKeepingAnchor: jest.fn((targetZoom, anchorX, anchorY) => {
            const [vx, vy] = fractalApp.screenToViewVector(anchorX, anchorY);
            const deltaZoom = fractalApp.zoom - targetZoom;
            fractalApp.addPan(vx * deltaZoom, vy * deltaZoom);
            fractalApp.zoom = targetZoom;
        }),
    };

    return fractalApp;
};

// =============================================================================
// Factory: Create Mock UI Module
// =============================================================================
global.createMockUI = () => {
    // Create the object structure first
    // Default to Julia mode to match expected test behavior (tests can override with mockReturnValue)
    const mockUI = {
        fractalMode: FRACTAL_TYPE.JULIA,

        // Mode management
        getFractalMode: jest.fn(() => 'mandelbrot'),
        switchFractalMode: jest.fn(() => Promise.resolve()),
        switchFractalTypeWithPersistence: jest.fn(() => Promise.resolve()),
        isJuliaMode: jest.fn(() => mockUI.fractalMode === FRACTAL_TYPE.JULIA),
        enableJuliaMode: jest.fn(() => {
            mockUI.fractalMode = FRACTAL_TYPE.JULIA;
        }),
        enableMandelbrotMode: jest.fn(() => {
            mockUI.fractalMode = FRACTAL_TYPE.MANDELBROT;
        }),
        enableRiemannMode: jest.fn(),

        // Palette/color management
        updatePaletteDropdownState: jest.fn(),
        updateColorTheme: jest.fn(),
        updatePaletteCycleButtonState: jest.fn(),
        randomizeColors: jest.fn(),

        // State management
        resetAppState: jest.fn(),
        updateInfo: jest.fn(),
        isAnimationActive: jest.fn(() => false),

        // Demo and presets
        toggleDemo: jest.fn(() => Promise.resolve()),
        startJuliaDive: jest.fn(() => Promise.resolve()),
        travelToPreset: jest.fn(() => Promise.resolve()),
        resetPresetAndDiveButtonStates: jest.fn(),
        resetActivePresetIndex: jest.fn(),
        getUserPresets: jest.fn(() => []),

        // UI toggles
        toggleDebugMode: jest.fn(),
        toggleCenterLines: jest.fn(),
        toggleHeader: jest.fn(),

        // Screenshots and dialogs
        captureScreenshot: jest.fn(),
        showSaveViewDialog: jest.fn(),
        showEditCoordsDialog: jest.fn(),
        copyInfoToClipboard: jest.fn(),

        // Reset
        reset: jest.fn(() => Promise.resolve()),

        // Init
        initUI: jest.fn(() => Promise.resolve()),
    };

    return mockUI;
};

// =============================================================================
// Global UI Module Mock (for jest.mock usage)
// Uses createMockUI() to avoid duplication - single source of truth
// =============================================================================
global.mockUIModule = global.createMockUI();

// =============================================================================
// Setup Default DOM Structure
// =============================================================================
global.setupDefaultDOM = () => {
    document.body.innerHTML = `
        <div id="headerContainer"></div>
        <h1 id="logo"></h1>
        <div id="mandelbrotSwitch"></div>
        <div id="juliaSwitch"></div>
        <div id="persistSwitch"></div>
        <button id="reset"></button>
        <button id="randomize"></button>
        <button id="screenshot"></button>
        <button id="demo"></button>
        <div id="infoLabel"></div>
        <div id="infoText"></div>
    `;
};

// =============================================================================
// Helper: Append Canvas to DOM
// =============================================================================
global.appendCanvasToDOM = (canvas) => {
    document.body.appendChild(canvas);
    return canvas;
};

// =============================================================================
// Helper: Clean up DOM
// =============================================================================
global.cleanupDOM = () => {
    document.body.innerHTML = '';
};

// =============================================================================
// Factory: Create Mock Adaptive Quality Renderer
// =============================================================================
/**
 * Creates a mock renderer for testing adaptive quality logic.
 * @param {Function} getGpuMs - Getter function that returns the current GPU timing value
 * @param {Object} constants - Object containing adaptive quality constants
 * @returns {Object} Mock renderer with adjustAdaptiveQuality method
 */
global.createMockAdaptiveQualityRenderer = (getGpuMs, constants) => {
    const {
        ADAPTIVE_QUALITY_COOLDOWN,
        ADAPTIVE_QUALITY_MIN,
        ADAPTIVE_QUALITY_STEP,
        ADAPTIVE_QUALITY_THRESHOLD_HIGH,
        ADAPTIVE_QUALITY_THRESHOLD_LOW,
    } = constants;

    return {
        extraIterations: 0,
        adaptiveQualityLastAdjustment: 0,
        interactionActive: false,

        adjustAdaptiveQuality() {
            const gpuMsValue = getGpuMs();

            // Check if perf data is available
            if (gpuMsValue === null || gpuMsValue === undefined) return;

            const gpuMs = gpuMsValue;
            if (!Number.isFinite(gpuMs)) return;

            if (this.interactionActive) return;

            const now = performance.now();
            if (now - this.adaptiveQualityLastAdjustment < ADAPTIVE_QUALITY_COOLDOWN) return;

            if (gpuMs > ADAPTIVE_QUALITY_THRESHOLD_HIGH) {
                const newExtra = Math.max(ADAPTIVE_QUALITY_MIN, this.extraIterations - ADAPTIVE_QUALITY_STEP);
                if (newExtra !== this.extraIterations) {
                    this.extraIterations = newExtra;
                    this.adaptiveQualityLastAdjustment = now;
                }
            }
            else if (gpuMs < ADAPTIVE_QUALITY_THRESHOLD_LOW && this.extraIterations < 0) {
                const newExtra = Math.min(0, this.extraIterations + ADAPTIVE_QUALITY_STEP);
                if (newExtra !== this.extraIterations) {
                    this.extraIterations = newExtra;
                    this.adaptiveQualityLastAdjustment = now;
                }
            }
        }
    };
};

// Initialize default DOM structure
global.setupDefaultDOM();
