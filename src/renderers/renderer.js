import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE} from "../global/constants";

/**
 * Abstract base class for WebGL-based renderers.
 * Provides common WebGL context initialization and management functionality.
 * 
 * @abstract
 */
class Renderer {
    /**
     * Creates a new Renderer instance and initializes the WebGL context.
     *
     * @param {HTMLCanvasElement} canvas - The canvas element to render to.
     */
    constructor(canvas) {
        this.canvas = canvas;

        this.gl = this.canvas.getContext("webgl", {
            antialias: false,
            alpha: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
        });

        if (!this.gl) {
            alert('WebGL is not supported by your browser or crashed.');
            return;
        }

        this.onWebGLContextLost = this.onWebGLContextLost.bind(this);
        this.canvas.addEventListener('webglcontextlost', this.onWebGLContextLost);
    }

    /**
     * Handles WebGL context lost events and attempts to recover the context.
     *
     * @param {WebGLContextEvent} event - The context lost event.
     */
    onWebGLContextLost(event) {
        event.preventDefault();
        console.error(
            `%c ${this.constructor.name}: onWebGLContextLost %c WebGL context lost. Attempting to recover...`,
            CONSOLE_GROUP_STYLE,
            CONSOLE_MESSAGE_STYLE
        );
        this.init();
    }

    /**
     * Initializes the renderer. Must be implemented by subclasses.
     *
     * @abstract
     * @throws {Error} Always throws an error if not implemented.
     */
    init() {
        throw new Error('Not implemented');
    }

    /**
     * Performs the rendering operation. Must be implemented by subclasses.
     *
     * @abstract
     * @throws {Error} Always throws an error if not implemented.
     */
    draw() {
        throw new Error('Not implemented');
    }

    /**
     * Resets the renderer to its initial state. Must be implemented by subclasses.
     *
     * @abstract
     * @throws {Error} Always throws an error if not implemented.
     */
    reset() {
        throw new Error('Not implemented');
    }

    /**
     * Cleans up renderer resources and releases references.
     */
    destroy() {
        this.gl = null;
        this.canvas = null;
    }
}

export default Renderer;