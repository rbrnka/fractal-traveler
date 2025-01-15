// src/__tests__/utils.test.js
import { updateURLParams, loadFractalParamsFromURL, clearURLParams, isMobile } from '../utils.js';

// Helper to set a fake URL for testing.
function setFakeURL(search) {
    Object.defineProperty(window, 'location', {
        value: {
            search,
            protocol: 'http:',
            host: 'localhost',
            pathname: '/index.html',
            hash: ''
        },
        writable: true,
    });
}

describe('Utils Module', () => {
    beforeEach(() => {
        // Reset URL parameters before each test
        setFakeURL('');
        window.history.replaceState({}, '', '/index.html');
    });

    test('updateURLParams should update URL parameters via pushState', () => {
        // Spy on window.history.pushState
        const pushStateSpy = jest.spyOn(window.history, 'pushState');

        updateURLParams(0.123456, 0.654321, 3.0);

        // Expect pushState to have been called with a query string that contains our values.
        // The order of parameters might vary, so we check that the string includes the expected parts.
        const callArgs = pushStateSpy.mock.calls[0];
        const updatedURL = callArgs[2]; // the third argument passed to pushState

        expect(updatedURL).toContain('cx=0.123456');
        expect(updatedURL).toContain('cy=0.654321');
        expect(updatedURL).toContain('zoom=3.000000');

        pushStateSpy.mockRestore();
    });

    test('loadFractalParamsFromURL should load parameters into fractalApp', () => {
        setFakeURL('?cx=0.111111&cy=0.222222&zoom=3.333333');

        const fractalApp = {
            pan: [0, 0],
            zoom: 0
        };

        loadFractalParamsFromURL(fractalApp);

        expect(fractalApp.pan[0]).toBeCloseTo(0.111111, 6);
        expect(fractalApp.pan[1]).toBeCloseTo(0.222222, 6);
        expect(fractalApp.zoom).toBeCloseTo(3.333333, 6);
    });

    test('clearURLParams should remove URL parameters if they were set', () => {
        // Set the flag so that clearURLParams doesn't return immediately.
        global.urlParamsSet = true;  // or, if urlParamsSet is exported from utils.js, assign it there.

        const replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation((state, title, url) => {
            window.location = new URL(url, window.location.origin);
        });

        clearURLParams();

        // Expect that replaceState was called.
        expect(replaceStateSpy).toHaveBeenCalled();

        replaceStateSpy.mockRestore();
    });

    test('isMobile should detect mobile user agents', () => {
        // Save the original userAgent
        const originalUserAgent = navigator.userAgent;

        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
            configurable: true
        });

        expect(isMobile()).toBe(true);

        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
            configurable: true
        });

        expect(isMobile()).toBe(false);

        // Restore original userAgent
        Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true
        });
    });
});
