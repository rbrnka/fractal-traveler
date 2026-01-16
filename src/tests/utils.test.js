// __tests__/utils.test.js

// Mock constants used in the file.
import {
    asyncDelay,
    calculatePanDelta,
    compareComplex,
    comparePalettes,
    ddAdd,
    ddMake,
    ddSet,
    ddValue,
    easeInOut,
    easeInOutCubic,
    easeInOutQuint,
    expandComplexToString,
    getAnimationDuration,
    hexToRGBArray,
    hsbToRgb,
    hslToRgb,
    lerp,
    normalizeRotation,
    quickTwoSum,
    rgbToHsl,
    twoSum
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

    describe('hexToRgb', () => {
        test('converts hex to rgb correctly', () => {
            // Test with a known value.
            const hex = '#f00';
            // hsb (0,1,1) should be red: [1,0,0]
            expect(hexToRGBArray(hex)).toEqual([1, 0, 0]);
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

    // -----------------------------------------------------------------------------------------
    // Double-Double Precision Arithmetic Tests (critical for deep zoom panning)
    // -----------------------------------------------------------------------------------------
    describe('Double-Double Arithmetic', () => {
        describe('twoSum', () => {
            test('computes error-free sum for normal values', () => {
                const result = twoSum(1.0, 2.0);
                expect(result.s).toBe(3.0);
                expect(result.err).toBe(0);
            });

            test('captures rounding error when adding values with different magnitudes', () => {
                // When adding a tiny value to a large value, precision is lost
                // twoSum captures this lost precision in the error term
                const large = 1.0;
                const tiny = 1e-17;
                const result = twoSum(large, tiny);

                // The sum rounds to 1.0 (tiny is lost)
                expect(result.s).toBe(1.0);
                // But the error captures what was lost
                expect(result.err).toBe(tiny);
            });

            test('captures error when adding nearly equal values of opposite sign', () => {
                const a = 1.0000000000000002;
                const b = -1.0;
                const result = twoSum(a, b);

                // The sum + error should equal the exact mathematical result
                expect(result.s + result.err).toBeCloseTo(a + b, 15);
            });
        });

        describe('quickTwoSum', () => {
            test('computes error-free sum when |a| >= |b|', () => {
                const result = quickTwoSum(10.0, 1.0);
                expect(result.s).toBe(11.0);
                expect(result.err).toBe(0);
            });

            test('captures error for values with different magnitudes', () => {
                const result = quickTwoSum(1.0, 1e-17);
                expect(result.s).toBe(1.0);
                expect(result.err).toBe(1e-17);
            });
        });

        describe('ddMake', () => {
            test('creates DD number with default values', () => {
                const dd = ddMake();
                expect(dd.hi).toBe(0);
                expect(dd.lo).toBe(0);
            });

            test('creates DD number with specified values', () => {
                const dd = ddMake(-0.5, 1e-17);
                expect(dd.hi).toBe(-0.5);
                expect(dd.lo).toBe(1e-17);
            });
        });

        describe('ddSet', () => {
            test('sets DD value and clears lo component', () => {
                const dd = ddMake(1.0, 0.5);
                ddSet(dd, -0.5);
                expect(dd.hi).toBe(-0.5);
                expect(dd.lo).toBe(0);
            });
        });

        describe('ddValue', () => {
            test('returns combined hi + lo value', () => {
                const dd = ddMake(1.0, 1e-17);
                const value = ddValue(dd);
                expect(value).toBe(1.0 + 1e-17);
            });
        });

        describe('ddAdd', () => {
            test('adds value to DD number preserving precision in lo component', () => {
                const dd = ddMake(-0.5, 0);
                const tinyDelta = 1e-17;

                ddAdd(dd, tinyDelta);

                // The lo component should capture the tiny delta
                // (ddValue() may still return -0.5 due to float64 addition limits,
                // but the hi/lo pair preserves the full precision for shader use)
                expect(dd.lo).not.toBe(0);
                expect(dd.lo).toBeCloseTo(tinyDelta, 30);
            });

            test('accumulates multiple tiny additions correctly', () => {
                const dd = ddMake(0, 0);
                const tinyDelta = 1e-17;
                const numAdditions = 1000;

                for (let i = 0; i < numAdditions; i++) {
                    ddAdd(dd, tinyDelta);
                }

                // The accumulated value should be approximately 1000 * 1e-17 = 1e-14
                const expected = numAdditions * tinyDelta;
                expect(Math.abs(ddValue(dd) - expected)).toBeLessThan(1e-28);
            });

            test('preserves precision when adding to large negative value (Mandelbrot pan scenario)', () => {
                // This is the exact scenario that was broken: panX starts at -0.5
                // and tiny deltas from deep zoom panning were being lost
                const dd = ddMake(-0.5, 0);
                const movements = [1e-16, -5e-17, 2e-16, -1e-16];
                const expectedSum = movements.reduce((a, b) => a + b, 0);

                for (const delta of movements) {
                    ddAdd(dd, delta);
                }

                // The DD value (hi + lo) should accurately represent -0.5 + sum(movements)
                const actualValue = ddValue(dd);
                const expectedValue = -0.5 + expectedSum;
                // Allow for floating-point tolerance
                expect(Math.abs(actualValue - expectedValue)).toBeLessThan(1e-20);
            });

            test('DD lo component captures precision that standard float64 loses', () => {
                // Compare DD arithmetic vs standard float64
                const startValue = -0.5;
                const tinyDelta = 1e-17;

                // Standard float64: loses precision
                const standardResult = startValue + tinyDelta;
                expect(standardResult).toBe(startValue); // Delta is lost!

                // DD arithmetic: preserves precision in lo component
                const dd = ddMake(startValue, 0);
                ddAdd(dd, tinyDelta);

                // The lo component captures what was lost
                expect(dd.lo).not.toBe(0);
                expect(dd.lo).toBeCloseTo(tinyDelta, 30);

                // When shader uses hi and lo separately, full precision is available
                // The test verifies that the split components are correct
                expect(dd.hi).toBe(startValue);
            });
        });
    });
});
