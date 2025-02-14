/**
 * @module Types
 * @author Radim Brnka
 * @description Data types DDOs used in the application
 */
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @description Enum Fractal Types
 * @readonly
 * @global
 * @enum {number}
 */
export const FRACTAL_TYPE = {
    MODE_MANDELBROT: 0,
    MODE_JULIA: 1
};
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef URL_PRESET {Object}
 *      @property {FRACTAL_TYPE} mode Defaults to FRACTAL_TYPE.MODE_MANDELBROT
 *      @property {number|null} [px] panX
 *      @property {number|null} [py] panY
 *      @property {number|null} [cx] Julia only
 *      @property {number|null} [cy] Julia only
 *      @property {number|null} [zoom]
 *      @property {number|null} [rotation]
 * @global
 * @description URL Preset is an object containing properties of specific point in the fractal on the scene compatible
 * with URL encoding.All array values (pan, c) are expanded
  */
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef PRESET {Object}
 * @global
 * @description Preset is an object containing properties of specific point in the fractal on the scene.
 */
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef MANDELBROT_PRESET {Object}
 *      @property {number} zoom
 *      @property {number} [rotation]
 *      @property {COMPLEX} pan
 *      @global
 * @see {@link JULIA_PRESET}
 * @description Mandelbrot-specific presets
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef JULIA_PRESET {Object}
 *      @property {COMPLEX} c
 *      @property {number} zoom
 *      @property {number} [rotation]
 *      @property {COMPLEX} pan
 * @global
 * @see {@link MANDELBROT_PRESET}
 * @description Julia-specific presets
 */
// ---------------------------------------------------------------------------------------------------------------------
/**
  * @typedef COMPLEX {Array.<{cX, cY}>}
 *      @property {number} cX x
 *      @property {number} cY yi
 * @global
 * @description The complex number c=x+yi, used as C in Julia or Pan in general.
 */
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Float32List} PALETTE
 *      @property {number} R Red
 *      @property {number} G Green
 *      @property {number} B Blue
 * @global
 * @description Color palette
 */
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} DIVE
 *      @property {number} cxDirection Use -1/+1 for negative/positive direction of the animation
 *      @property {number} cyDirection Use -1/+1 for negative/positive direction of the animation
 *      @property {Array.<{number, number, number, number}>} [phases]
 *            1: animate cx toward dive.endC[0],
 *            2: animate cy toward dive.endC[1],
 *            3: animate cx back toward dive.startC[0],
 *            4: animate cy back toward dive.startC[1]
 *      @property {COMPLEX} pan
 *      @property {COMPLEX} startC
 *      @property {COMPLEX} endC
 *      @property {number} zoom
 *      @property {number} step
 * @global
 * @description Dive is a special animation loop that first animates cx in given direction and when it reaches set threshold,
 * then it will start animating cy in given direction until its threshold is also hit. Then it loops in the opposite
 * direction. If phases are defined, it follows their order.
 */
// ---------------------------------------------------------------------------------------------------------------------
export {}