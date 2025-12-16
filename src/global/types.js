/**
 * @module Types
 * @author Radim Brnka
 * @description Data types & DDOs used in the application
 */
// ---------------------------------------------------------------------------------------------------------------------
// URL_PRESET
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} URL_PRESET
 *      @property {FRACTAL_TYPE} mode Defaults to FRACTAL_TYPE.MANDELBROT
 *      @property {number|null} [px] panX
 *      @property {number|null} [py] panY
 *      @property {number|null} [cx] Julia only
 *      @property {number|null} [cy] Julia only
 *      @property {number|null} [zoom]
 *      @property {number|null} [r] rotation
 * @description URL Preset is an object containing properties of specific point in the fractal on the scene compatible
 * with URL encoding.All array values (pan, c) are expanded
 */
// ---------------------------------------------------------------------------------------------------------------------
// PRESET
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} PRESET
 * @description Preset is an object containing properties of specific point in the fractal on the scene.
 */
// ---------------------------------------------------------------------------------------------------------------------
//  MANDELBROT_PRESET
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} MANDELBROT_PRESET
 *      @property {number} [id] If present, helps unique demo rotation
 *      @property {number} zoom
 *      @property {number} [rotation]
 *      @property {COMPLEX} pan
 *      @property {string} [title] HTML element title (on hover)
 * @extends PRESET
 * @see {@link JULIA_PRESET}
 * @description Mandelbrot-specific presets
 */
// ---------------------------------------------------------------------------------------------------------------------
// JULIA_PRESET
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} JULIA_PRESET
 *      @property {number} [id] If present, helps unique demo rotation
 *      @property {COMPLEX} c
 *      @property {number} zoom
 *      @property {number} [rotation]
 *      @property {COMPLEX} pan
 *      @property {string} [title] HTML element title (on hover)
 * @extends PRESET
 * @see {@link MANDELBROT_PRESET}
 * @description Julia-specific presets
 */
// ---------------------------------------------------------------------------------------------------------------------
// COMPLEX
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Array.<number>} COMPLEX
 *      @property {number} 0 The real part.
 *      @property {number} 1 The imaginary part.
 * @description The complex number c=x+yi as [x, yi], used as C in Julia or Pan in general.
 */
// ---------------------------------------------------------------------------------------------------------------------
// PALETTE
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Array.<number>} PALETTE
 * @description Color palette [R, G, B] (0-1)
 */
// ---------------------------------------------------------------------------------------------------------------------
// JULIA PALETTE
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} JULIA_PALETTE
 *      @property {Array<number, number, number, number, number>} theme 5 innerStops of RGB colors defining the Julia palette
 *      @property {string} id Identifier / title
 *      @property {string} [keyColor] Main theme color. If not set, 3. innerStop's color is used. Use hex #rrggbb notation.
 * @description Color palette defined by inner stops
 */
// ---------------------------------------------------------------------------------------------------------------------
// COLOR THEME
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} COLOR_THEME
 *      @property {string} ACCENT_COLOR
 *      @property {string} BG_COLOR
 * @description Color theme
 */
// ---------------------------------------------------------------------------------------------------------------------
// PHASES
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Array.<number>} PHASES
 *      @property {number} 0 1st phase
 *      @property {number} 1 2nd phase
 *      @property {number} 2 3rd phase
 *      @property {number} 3 4th phase
 * @description Quad array of phase order for a DIVE.
 */
// ---------------------------------------------------------------------------------------------------------------------
// DIVE
// ---------------------------------------------------------------------------------------------------------------------
/**
 * @typedef {Object} DIVE
 *      @property {number} cxDirection Use -1/+1 for negative/positive direction of the animation
 *      @property {number} cyDirection Use -1/+1 for negative/positive direction of the animation
 *      @property {PHASES} [phases]
 *           1: animate cx toward dive.endC[0],
 *           2: animate cy toward dive.endC[1],
 *           3: animate cx back toward dive.startC[0],
 *           4: animate cy back toward dive.startC[1]
 *      @property {COMPLEX} pan
 *      @property {COMPLEX} startC
 *      @property {COMPLEX} endC
 *      @property {number} zoom
 *      @property {number} step
 * @description Dive is a special animation loop that first animates cx in given direction and when it reaches a set threshold,
 * then it will start animating cy in given direction until its threshold is also hit. Then it loops in the opposite
 * direction. If phases are defined, it follows their order.
 */
// ---------------------------------------------------------------------------------------------------------------------
export {}