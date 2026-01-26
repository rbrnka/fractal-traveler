/**
 * @jest-environment jsdom
 */
// __tests__/hotKeyController.test.js

// Mock ui module before importing hotKeyController (which imports from ui)
import * as ui from "../ui/ui";
import {destroyHotKeys, initHotKeys} from '../ui/hotKeyController';
import {
    charPressedEvent,
    defaultKeyboardEvent,
    downArrowPressedEvent,
    leftArrowPressedEvent,
    numPressedEvent,
    rightArrowPressedEvent,
    upArrowPressedEvent
} from "./eventDefaults";
import {ROTATION_DIRECTION} from "../global/constants";

jest.mock('../ui/ui', () => ({
    isJuliaMode: jest.fn(() => true),
    travelToPreset: jest.fn(() => Promise.resolve()),
    startJuliaDive: jest.fn(() => Promise.resolve()),
    isAnimationActive: jest.fn(() => false),
    toggleHeader: jest.fn(),
    randomizeColors: jest.fn(),
    toggleCenterLines: jest.fn(),
    toggleDebugMode: jest.fn(),
    toggleDemo: jest.fn(() => Promise.resolve()),
    reset: jest.fn(() => Promise.resolve()),
    resetAppState: jest.fn(),
    switchFractalMode: jest.fn(() => Promise.resolve()),
    switchFractalTypeWithPersistence: jest.fn(() => Promise.resolve()),
    captureScreenshot: jest.fn(),
    updateColorTheme: jest.fn(),
    updatePaletteDropdownState: jest.fn(),
    copyInfoToClipboard: jest.fn(),
    showSaveViewDialog: jest.fn(),
}));

describe('HotKeyController', () => {
    let fractalApp;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock fractalApp using factory
        fractalApp = createMockFractalApp();
        fractalApp.c = [0.5, 0.5];

        // Attach hotkey handler with our mock app.
        initHotKeys(fractalApp);
    });

    afterEach(() => {
        cleanupDOM();
        destroyHotKeys();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('ArrowLeft without ctrl pans left', async () => {
        document.dispatchEvent(leftArrowPressedEvent());
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.animatePanBy).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('ArrowRight with Alt adjusts Julia c', async () => {
        document.dispatchEvent(rightArrowPressedEvent(false, false, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.animateToC).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('ArrowDown without ctrl pans down', async () => {
        document.dispatchEvent(downArrowPressedEvent());
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.animatePanBy).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('ArrowUp with Alt adjusts Julia c (imaginary part)', async () => {
        document.dispatchEvent(upArrowPressedEvent(false, false, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.animateToC).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Numkeys travel to preset', async () => {
        document.dispatchEvent(numPressedEvent(1));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(ui.travelToPreset).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Shift+Numkeys trigger dive in Julia mode or travel to preset otherwise', async () => {
        ui.isJuliaMode.mockReturnValue(false);

        // No Julia mode, Shift does not make a difference - travel to preset
        document.dispatchEvent(numPressedEvent(1, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(ui.travelToPreset).toHaveBeenCalled();

        // In Julia mode, dive is triggered
        ui.isJuliaMode.mockReturnValue(true);
        document.dispatchEvent(numPressedEvent(1, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(ui.startJuliaDive).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('W enter infinite rotation cw, stop, enter again with slower speed and opposite direction', async () => {
        document.dispatchEvent(charPressedEvent('w'));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.animateInfiniteRotation).toHaveBeenCalledWith(ROTATION_DIRECTION.CW, 0.1);

        document.dispatchEvent(charPressedEvent('w'));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.stopCurrentRotationAnimation).toHaveBeenCalled();

        document.dispatchEvent(charPressedEvent('q', true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(fractalApp.animateInfiniteRotation).toHaveBeenCalledWith(ROTATION_DIRECTION.CCW, 0.01);
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Space triggers zoom in', async () => {
        // Set current zoom to 1.0
        fractalApp.zoom = 1.0;

        // Define bounds so that any number between 0 and 10 is 'valid'
        // Deepest zoom (tiny number)
        fractalApp.MAX_ZOOM = 0.0000000001;
        // Furthest out (large number)
        fractalApp.MIN_ZOOM = 100.0;

        // Dispatch the event
        document.dispatchEvent(charPressedEvent(' ', false, false, false));

        // Use a slightly longer wait to ensure the async switch/case finishes
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(fractalApp.animateZoomToNoPan).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"Shift+R" resets the app', async () => {
        document.dispatchEvent(charPressedEvent('r', true));
        await Promise.resolve();
        expect(ui.reset).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"Alt+S" invokes the view save dialog', async () => {
        document.dispatchEvent(charPressedEvent('s', false, false, true));
        await Promise.resolve();
        expect(ui.showSaveViewDialog).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"Shift+S" captures the screenshot', async () => {
        document.dispatchEvent(charPressedEvent('s', true));
        await Promise.resolve();
        expect(ui.captureScreenshot).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"Shift+T" triggers palette cycling', async () => {
        document.dispatchEvent(charPressedEvent('t', true));
        await Promise.resolve();

        if (fractalApp.paletteCyclingActive) {
            expect(fractalApp.stopCurrentColorAnimations).toHaveBeenCalled();
        } else {
            expect(fractalApp.startPaletteCycling).toHaveBeenCalled();
        }
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"Alt+T" resets the palette', async () => {
        document.dispatchEvent(charPressedEvent('t', false, false, true));
        await Promise.resolve();

        expect(fractalApp.applyPaletteByIndex).toHaveBeenCalled();
        expect(ui.updatePaletteDropdownState).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"C" copies the text to clipboard', async () => {
        document.dispatchEvent(charPressedEvent('c'));
        await Promise.resolve();
        expect(ui.copyInfoToClipboard).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"E" toggles the guiding lines', async () => {
        document.dispatchEvent(charPressedEvent('e'));
        await Promise.resolve();
        expect(ui.toggleCenterLines).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"A" forces resize', async () => {
        document.dispatchEvent(charPressedEvent('a'));
        await Promise.resolve();
        expect(fractalApp.resizeCanvas).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('"L" toggles the debug panel', async () => {
        document.dispatchEvent(charPressedEvent('l'));
        await Promise.resolve();
        expect(ui.toggleDebugMode).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Enter key toggles the UI header', async () => {
        document.dispatchEvent(defaultKeyboardEvent('Enter'));
        await Promise.resolve();
        expect(ui.toggleHeader).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Ignore hotkeys when user is typing in an input field', async () => {
        // Setup a mock input target
        const input = document.createElement('input');
        document.body.appendChild(input);

        // Create event with the input as the target
        const event = charPressedEvent('t');
        Object.defineProperty(event, 'target', {value: input, enumerable: true});

        document.dispatchEvent(event);
        await Promise.resolve();

        // randomization should NOT have been called
        expect(ui.randomizeColors).not.toHaveBeenCalled();
    });
});
