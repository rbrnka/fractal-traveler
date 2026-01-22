/**
 * @module utils.fractal
 * @author Radim Brnka
 * @description Contains mathematical functions for fractal analysis and calculations.
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

/**
 * Analyzes a point c to determine its relationship to the Mandelbrot set.
 * Uses distance estimation and period detection to find appropriate zoom level.
 *
 * @param {number} cx - Real part of c
 * @param {number} cy - Imaginary part of c
 * @param {number} maxIter - Maximum iterations
 * @returns {{escaped: boolean, iterations: number, distance: number, period: number, recommendedZoom: number}}
 */
export function analyzeMandelbrotPoint(cx, cy, maxIter = 1000) {
    let zx = 0, zy = 0;
    // Derivative dz/dc for distance estimation
    let dzx = 0, dzy = 0;

    // Period detection: store orbit points to detect cycles
    const orbitHistory = [];
    const PERIOD_CHECK_START = 50;
    const PERIOD_TOLERANCE = 1e-10;

    let escaped = false;
    let escapeIter = maxIter;
    let finalMag = 0;
    let finalDerivMag = 0;

    for (let i = 0; i < maxIter; i++) {
        // Track derivative: d(z²+c)/dc = 2z * dz/dc + 1
        const newDzx = 2 * (zx * dzx - zy * dzy) + 1;
        const newDzy = 2 * (zx * dzy + zy * dzx);
        dzx = newDzx;
        dzy = newDzy;

        // z = z² + c
        const newZx = zx * zx - zy * zy + cx;
        const newZy = 2 * zx * zy + cy;
        zx = newZx;
        zy = newZy;

        const mag2 = zx * zx + zy * zy;

        // Period detection for interior points
        if (i >= PERIOD_CHECK_START && i % 10 === 0) {
            for (let j = 0; j < orbitHistory.length; j++) {
                const [hx, hy, hi] = orbitHistory[j];
                const dx = zx - hx, dy = zy - hy;
                if (dx * dx + dy * dy < PERIOD_TOLERANCE) {
                    // Found period
                    const period = i - hi;
                    // Period correlates with feature size: smaller period = larger feature
                    // Main cardioid (period 1) -> zoom ~1.0
                    // Period 2 bulb -> zoom ~0.3
                    // Higher periods -> smaller features
                    const recommendedZoom = Math.max(0.01, Math.min(1.5, 1.5 / Math.pow(period, 0.7)));
                    return { escaped: false, iterations: maxIter, distance: 0, period, recommendedZoom };
                }
            }
            orbitHistory.push([zx, zy, i]);
            if (orbitHistory.length > 100) orbitHistory.shift();
        }

        if (mag2 > 1e8) { // Use larger bailout for better distance estimation
            escaped = true;
            escapeIter = i;
            finalMag = Math.sqrt(mag2);
            finalDerivMag = Math.sqrt(dzx * dzx + dzy * dzy);
            break;
        }
    }

    if (escaped && finalDerivMag > 0) {
        // Distance estimation: d = |z| * log(|z|) / |dz/dc|
        const distance = (finalMag * Math.log(finalMag)) / finalDerivMag;

        // High iteration count = close to boundary = deep structure
        // Use iteration-based zoom: more iters = deeper zoom needed
        // At 100 iters -> zoom ~0.1, at 500 iters -> zoom ~0.001, at 1000+ -> zoom ~0.0001
        const iterZoom = Math.pow(10, -escapeIter / 300);

        // Also use distance - but squared for more aggressive scaling
        const distZoom = Math.pow(distance, 0.7);

        // Take the smaller (deeper) of the two estimates
        const recommendedZoom = Math.max(1e-8, Math.min(2.0, Math.min(iterZoom, distZoom)));

        return { escaped: true, iterations: escapeIter, distance, period: 0, recommendedZoom };
    }

    // Didn't escape and no period found - deep interior, use moderate zoom
    return { escaped: false, iterations: maxIter, distance: 0, period: 0, recommendedZoom: 0.5 };
}

/**
 * Calculates the appropriate zoom level when switching from Julia to Mandelbrot.
 * Combines the point analysis with the current Julia zoom factor.
 *
 * @param {number} cx - Real part of c (Julia parameter)
 * @param {number} cy - Imaginary part of c (Julia parameter)
 * @param {number} currentJuliaZoom - Current zoom level in Julia mode
 * @param {number} juliaDefaultZoom - Default Julia zoom level (typically 3.5)
 * @returns {number} Recommended zoom level for Mandelbrot
 */
export function calculateMandelbrotZoomFromJulia(cx, cy, currentJuliaZoom, juliaDefaultZoom = 3.5) {
    const analysis = analyzeMandelbrotPoint(cx, cy, 2000);

    // Factor in current Julia zoom: if deeply zoomed in Julia, scale Mandelbrot zoom deeper
    // Julia default zoom is ~3.5, so juliaZoomFactor > 1 means zoomed in
    const juliaZoomFactor = juliaDefaultZoom / Math.max(currentJuliaZoom, 0.001);

    // Combine distance-based zoom with Julia zoom influence
    // Use geometric mean to balance both factors
    let finalZoom = analysis.recommendedZoom;
    if (juliaZoomFactor > 1) {
        // User is zoomed into Julia - scale Mandelbrot zoom proportionally
        // But don't go too extreme - use sqrt to dampen the effect
        finalZoom = analysis.recommendedZoom / Math.sqrt(juliaZoomFactor);
    }

    // Clamp to reasonable range
    return Math.max(1e-6, Math.min(2.0, finalZoom));
}
