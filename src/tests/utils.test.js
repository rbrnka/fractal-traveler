// __tests__/utils.test.js

// Mock constants used in the file.
import {
    asyncDelay, calculatePanDelta,
    compareComplex,
    comparePalettes,
    easeInOut, easeInOutCubic, easeInOutQuint,
    expandComplexToString, getAnimationDuration,
    hsbToRgb,
    hslToRgb, lerp, normalizeRotation,
    rgbToHsl
} from "../global/utils";


describe('Utils', () => {
    describe('expandComplexToString', () => {
        test('returns formatted string for valid complex number', () => {
            const result = expandComplexToString([1.23456789, -0.987654321], 4, true);
            expect(result).toBe(`[1.2346, -0.9877i]`);
        });
        test('returns formatted string for nonstandard complex number', () => {
            const result = expandComplexToString([-0.5000000000, -0.00000000], 6, true);
            expect(result).toBe(`[-0.5, 0]`);
        });
        test('returns "[?, ?]" for invalid complex number', () => {
            const result = expandComplexToString([NaN, 0.5]);
            expect(result).toBe('[?, ?]');
        });
        test('returns "[0, 0]" for zero complex number', () => {
            const result = expandComplexToString([0, 0]);
            expect(result).toBe('[0, 0]');
        });
    });

    describe('compareComplex', () => {
        test('returns true for equal complex numbers with given precision', () => {
            const c1 = [1.234567, -0.987654];
            const c2 = [1.234568, -0.987653];
            expect(compareComplex(c1, c2, 5)).toBe(true);
        });
        test('returns false when complex numbers differ', () => {
            const c1 = [1.23, -0.98];
            const c2 = [1.24, -0.98];
            expect(compareComplex(c1, c2, 2)).toBe(false);
        });
    });

    describe('comparePalettes', () => {
        test('returns true for identical palettes', () => {
            const p1 = [0.1, 0.2, 0.3];
            const p2 = [0.1, 0.2, 0.3];
            expect(comparePalettes(p1, p2, 6)).toBe(true);
        });
        test('returns false for different palettes', () => {
            const p1 = [0.1, 0.2, 0.3];
            const p2 = [0.1, 0.2, 0.4];
            expect(comparePalettes(p1, p2, 6)).toBe(false);
        });
    });

    describe('hsbToRgb', () => {
        test('converts hsb to rgb correctly', () => {
            // Test with a known value.
            const rgb = hsbToRgb(0, 1, 1);
            // hsb (0,1,1) should be red: [1,0,0]
            expect(rgb.map(v => parseFloat(v.toFixed(2)))).toEqual([1, 0, 0]);
        });
    });

    describe('hslToRgb and rgbToHsl', () => {
        test('hslToRgb converts and rgbToHsl reverses', () => {
            const hsl = [0.33, 0.5, 0.5];
            const rgb = hslToRgb(...hsl);
            const hsl2 = rgbToHsl(...rgb);
            // Allow for small rounding differences.
            expect(hsl2.map(v => parseFloat(v.toFixed(2)))).toEqual(hsl.map(v => parseFloat(v.toFixed(2))));
        });
    });

    describe('easing functions', () => {
        test('easeInOut returns expected value', () => {
            expect(easeInOut(0)).toBe(0);
            expect(easeInOut(1)).toBe(1);
            // Intermediate value
            expect(easeInOut(0.5)).toBeCloseTo(0.5);
        });

        test('easeInOutCubic returns expected value', () => {
            expect(easeInOutCubic(0)).toBe(0);
            expect(easeInOutCubic(1)).toBe(1);
            expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 1);
        });

        test('easeInOutQuint returns expected value', () => {
            expect(easeInOutQuint(0)).toBe(0);
            expect(easeInOutQuint(1)).toBe(1);
            expect(easeInOutQuint(0.5)).toBeCloseTo(0.5, 1);
        });
    });

    describe('lerp', () => {
        test('lerp interpolates linearly', () => {
            expect(lerp(0, 10, 0.5)).toBe(5);
        });
    });

    describe('normalizeRotation', () => {
        test('returns a value between 0 and 2*PI', () => {
            const twoPi = 2 * Math.PI;
            expect(normalizeRotation(-1)).toBeGreaterThanOrEqual(0);
            expect(normalizeRotation(-1)).toBeLessThan(twoPi);
            expect(normalizeRotation(7)).toBeGreaterThanOrEqual(0);
            expect(normalizeRotation(7)).toBeLessThan(twoPi);
        });
    });

    describe('getAnimationDuration', () => {
        test('calculates duration for given parameters', () => {
            const current = {pan: [0, 0], zoom: 1, c: [0, 0]};
            const target = {pan: [3, 4], zoom: 2, c: [1, 1]};
            // For a seed of 100, duration should be roughly proportional to the weighted sum of differences.
            const duration = getAnimationDuration(100, current, target, {pan: 1, zoom: 1, c: 1});
            expect(typeof duration).toBe('number');
            expect(duration).toBeGreaterThan(0);
        });
    });

    describe('asyncDelay', () => {
        jest.useFakeTimers();

        test('resolves after delay', async () => {
            const promise = asyncDelay(1000);
            jest.advanceTimersByTime(1000);
            await expect(promise).resolves.toBeUndefined();
        });

        afterEach(() => {
            jest.useRealTimers();
        });
    });

    describe('calculatePanDelta', () => {
        test('calculates correct delta given movement', () => {
            const rect = {width: 800, height: 600};
            // No rotation, zoom 1.
            const [deltaX, deltaY] = calculatePanDelta(410, 310, 400, 300, rect, 0, 1);
            // Movement: 10,10; normalized: 10/800 and 10/600 respectively.
            expect(deltaX).toBeCloseTo(-10 / 800);
            expect(deltaY).toBeCloseTo(10 / 600);
        });
    });
});
