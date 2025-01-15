// src/__tests__/utils.test.js
import { updateURLParams, loadFractalParamsFromURL, clearURLParams, isMobile } from '../utils.js';

describe('Utils Module', () => {
    // Helper: Setup a fake URL on window.location
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

    beforeEach(() => {
        // Reset location
        setFakeURL('');
        window.history.replaceState({}, '', '/index.html');
    });

    test('updateURLParams should update URL parameters', () => {
        // Mock pushState to update window.location.search
        const pushStateMock = jest.spyOn(window.history, 'pushState').mockImplementation((state, title, url) => {
            // Simulate updating the URL's search string
            window.location.search = url.split('?')[1] || '';
        });

        updateURLParams(0.123456, 0.654321, 3.0);

        const params = new URLSearchParams(window.location.search);
        expect(params.get('cx')).toBe('0.123456');
        expect(params.get('cy')).toBe('0.654321');
        expect(params.get('zoom')).toBe('3.000000');

        pushStateMock.mockRestore();
    });

    test('loadFractalParamsFromURL should load parameters into fractalApp', () => {
        setFakeURL('?cx=0.111111&cy=0.222222&zoom=3.333333');
        const fractalAppMock = {
            pan: [0, 0],
            zoom: 0
        };

        loadFractalParamsFromURL(fractalAppMock);
        expect(fractalAppMock.pan[0]).toBeCloseTo(0.111111, 6);
        expect(fractalAppMock.pan[1]).toBeCloseTo(0.222222, 6);
        expect(fractalAppMock.zoom).toBeCloseTo(3.333333, 6);
    });

    test('clearURLParams should remove URL parameters if they were set', () => {
        // First, we call updateURLParams so that the flag is set.
        const pushStateMock = jest.spyOn(window.history, 'pushState').mockImplementation((state, title, url) => {
            window.location.search = url.split('?')[1] || '';
        });
        updateURLParams(0.123456, 0.654321, 3.0);
        pushStateMock.mockRestore();

        // Now, mock replaceState to update window.location.
        const replaceStateMock = jest.spyOn(window.history, 'replaceState').mockImplementation((state, title, url) => {
            window.location = new URL(url, 'http://localhost');
        });
        clearURLParams();
        expect(window.location.search).toBe('');
        replaceStateMock.mockRestore();
    });

    test('isMobile returns correct values based on userAgent', () => {
        const originalUserAgent = navigator.userAgent;

        // Mobile UA test.
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
            configurable: true
        });
        expect(isMobile()).toBe(true);

        // Desktop UA test.
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
            configurable: true
        });
        expect(isMobile()).toBe(false);

        // Restore the original UA.
        Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true
        });
    });
});