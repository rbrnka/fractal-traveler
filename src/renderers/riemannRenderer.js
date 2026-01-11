import FractalRenderer from "./fractalRenderer";
/** @type {string} */
import fragmentShaderRaw from '../shaders/riemann.frag';

class RiemannRenderer extends FractalRenderer {

    constructor(canvas) {
        super(canvas);

        this.termCount = 100;

        this.useAnalyticExtension = true;

        this.init();
    }

    updateUniforms() {
        this.termCountLoc = this.gl.getUniformLocation(this.program, 'u_termCount');
        this.useAnalyticExtensionLoc = this.gl.getUniformLocation(this.program, 'u_useAnalyticExtension');

        super.updateUniforms();
    }

    draw() {
        this.gl.uniform1i(this.termCountLoc, this.termCount);
        this.gl.uniform1i(this.useAnalyticExtensionLoc, this.useAnalyticExtension ? 1 : 0);

        super.draw();
    }

    createFragmentShaderSource() {
        return fragmentShaderRaw;

    }

    onProgramCreated() {

    }
}

export default RiemannRenderer;