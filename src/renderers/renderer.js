import {CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE, DEBUG_MODE} from "../global/constants";
import vertexShaderSource from '../shaders/vertexShaderInit.vert';

/**
 * Abstract base class for WebGL-based renderers.
 * Provides common WebGL context initialization, shader compilation,
 * program creation, and basic rendering infrastructure.
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

        /** @type {string} Vertex shader source code */
        this.vertexShaderSource = vertexShaderSource;

        /** @type {WebGLShader|null} */
        this.vertexShader = null;
        /** @type {WebGLShader|null} */
        this.fragmentShader = null;
        /** @type {WebGLProgram|null} */
        this.program = null;

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
     * Compiles shader code.
     * @param {string} source - Shader source code
     * @param {GLenum} type - Shader type (gl.VERTEX_SHADER or gl.FRAGMENT_SHADER)
     * @return {WebGLShader|null} Compiled shader or null on failure
     */
    compileShader(source, type) {
        if (DEBUG_MODE) {
            console.groupCollapsed(`%c ${this.constructor.name}: %c compileShader`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);
            console.log(`Shader GLenum type: ${type}\nShader code: ${source}`);
        }

        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            if (DEBUG_MODE) console.groupEnd();
            return null;
        }
        if (DEBUG_MODE) console.groupEnd();

        return shader;
    }

    /**
     * Creates the fragment shader source code.
     * Must be implemented by subclasses to define their specific shader.
     *
     * @abstract
     * @returns {string} Fragment shader source code
     * @throws {Error} Always throws an error if not implemented.
     */
    createFragmentShaderSource() {
        throw new Error('The createFragmentShaderSource method must be implemented in child classes');
    }

    /**
     * Initializes WebGL program, shaders, and full-screen quad.
     * Compiles vertex and fragment shaders, links the program,
     * and sets up the position attribute buffer.
     */
    initGLProgram() {
        if (DEBUG_MODE) console.groupCollapsed(`%c ${this.constructor.name}:%c initGLProgram`, CONSOLE_GROUP_STYLE, CONSOLE_MESSAGE_STYLE);

        if (this.program) this.gl.deleteProgram(this.program);
        if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);

        if (!this.vertexShader) {
            this.vertexShader = this.compileShader(this.vertexShaderSource, this.gl.VERTEX_SHADER);
        }
        this.fragmentShader = this.compileShader(this.createFragmentShaderSource(), this.gl.FRAGMENT_SHADER);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, this.vertexShader);
        this.gl.attachShader(this.program, this.fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(this.program));
        }
        this.gl.useProgram(this.program);

        // Full-screen quad
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        const positionLoc = this.gl.getAttribLocation(this.program, "a_position");
        this.gl.enableVertexAttribArray(positionLoc);
        this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);

        // Hook for subclasses to cache uniform locations
        this.onProgramCreated();

        if (DEBUG_MODE) console.groupEnd();
    }

    /**
     * Hook called after GL program is created and linked.
     * Subclasses can override to cache uniform locations.
     * Default implementation does nothing.
     */
    onProgramCreated() {
        // Empty by default - subclasses override
    }

    /**
     * Base draw operation: sets viewport, clears the canvas, and draws the quad.
     * Subclasses should call this after uploading their uniforms.
     */
    baseDraw() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.gl.viewport(0, 0, w, h);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
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
        // Clean up WebGL resources
        if (this.program) {
            this.gl.deleteProgram(this.program);
            this.program = null;
        }
        if (this.vertexShader) {
            this.gl.deleteShader(this.vertexShader);
            this.vertexShader = null;
        }
        if (this.fragmentShader) {
            this.gl.deleteShader(this.fragmentShader);
            this.fragmentShader = null;
        }

        this.gl = null;
        this.canvas = null;
    }
}

export default Renderer;