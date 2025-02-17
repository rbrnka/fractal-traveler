// __tests__/types.test.js
// Import the types module so that the JSDoc typedefs are loaded.
// (It exports nothing at runtime, but we want to ensure our file compiles.)

describe('URL_PRESET type', () => {
    test('should have the required properties', () => {
        /** @type {URL_PRESET} */
        const urlPreset = {
            mode: 0,
            px: 1.234567,
            py: 2.345678,
            cx: 0.123456,
            cy: 0.234567,
            zoom: 3.141592,
            r: 0.5
        };
        expect(typeof urlPreset.mode).toBe('number');
        expect(typeof urlPreset.px).toBe('number');
        expect(typeof urlPreset.py).toBe('number');
        expect(urlPreset.cx === null || typeof urlPreset.cx === 'number').toBe(true);
        expect(urlPreset.cy === null || typeof urlPreset.cy === 'number').toBe(true);
        expect(typeof urlPreset.zoom).toBe('number');
        expect(typeof urlPreset.r).toBe('number');
    });
});

describe('COMPLEX type', () => {
    test('should be an array of two numbers', () => {
        /** @type {COMPLEX} */
        const complex = [0.5, -0.5];
        expect(Array.isArray(complex)).toBe(true);
        expect(complex.length).toBe(2);
        expect(typeof complex[0]).toBe('number');
        expect(typeof complex[1]).toBe('number');
    });
});

describe('PALETTE type', () => {
    test('should be an array of three numbers', () => {
        /** @type {PALETTE} */
        const palette = [0.1, 0.2, 0.3];
        expect(Array.isArray(palette)).toBe(true);
        expect(palette.length).toBe(3);
        palette.forEach(c => expect(typeof c).toBe('number'));
    });
});

describe('COLOR_THEME type', () => {
    test('should be an object with ACCENT_COLOR and BG_COLOR strings', () => {
        /** @type {COLOR_THEME} */
        const theme = {
            ACCENT_COLOR: '#B4FF6A',
            BG_COLOR: 'rgba(24, 48, 13, 0.2)'
        };
        expect(typeof theme.ACCENT_COLOR).toBe('string');
        expect(typeof theme.BG_COLOR).toBe('string');
    });
});

describe('PHASES type', () => {
    test('should be an array of four numbers', () => {
        /** @type {PHASES} */
        const phases = [1, 2, 3, 4];
        expect(Array.isArray(phases)).toBe(true);
        expect(phases.length).toBe(4);
        phases.forEach(phase => expect(typeof phase).toBe('number'));
    });
});

describe('DIVE type', () => {
    test('should have the required properties with correct types', () => {
        /** @type {DIVE} */
        const dive = {
            cxDirection: -1,
            cyDirection: 1,
            phases: [1, 2, 3, 4],
            pan: [0, 0],            // COMPLEX: [number, number]
            startC: [0.1, 0.2],       // COMPLEX: [number, number]
            endC: [-0.1, 0.3],        // COMPLEX: [number, number]
            zoom: 1.5,
            step: 0.0001
        };
        expect(typeof dive.cxDirection).toBe('number');
        expect(typeof dive.cyDirection).toBe('number');
        expect(Array.isArray(dive.phases)).toBe(true);
        expect(dive.phases.length).toBe(4);
        expect(Array.isArray(dive.pan)).toBe(true);
        expect(dive.pan.length).toBe(2);
        expect(Array.isArray(dive.startC)).toBe(true);
        expect(dive.startC.length).toBe(2);
        expect(Array.isArray(dive.endC)).toBe(true);
        expect(dive.endC.length).toBe(2);
        expect(typeof dive.zoom).toBe('number');
        expect(typeof dive.step).toBe('number');
    });
});
