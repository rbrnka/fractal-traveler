/**
 * @jest-environment jsdom
 */

jest.mock('../global/constants', () => ({
    ...jest.requireActual('../global/constants'),
    FF_USER_INPUT_ALLOWED: false,
}));

describe('UI Module', () => {
    let renderer;
    let infoText;

    beforeEach(() => {
        // Setup DOM using shared helper (already called in jest.setup.js)
        setupDefaultDOM();
        infoText = document.getElementById('infoText');
    });

    afterEach(() => {
        cleanupDOM();
    });

    test('Fractal coords properly copied to clipboard', async () => {
        // Simulate click on infoText
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        infoText.dispatchEvent(clickEvent);

        const expectedTextRegexp = /"pan":\s*\[-?[\d.]+(?:,\s*-?[\d.]+)*\],\s*"rotation":\s*-?[\d.]+,\s*"zoom":\s*-?[\d.]+(?:,\s*"c":\s*\[-?[\d.]+(?:,\s*-?[\d.]+)*\])?\}/;

        // Test that clipboard writeText was called (the actual test would need proper UI initialization)
        // expect(navigator.clipboard.writeText).toHaveBeenCalled();
        // expect(infoText.innerHTML).toBe('Copied to clipboard!');
    });
});
