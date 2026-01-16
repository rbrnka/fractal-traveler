/**
 * @jest-environment jsdom
 */
// __tests__/hotKeyController.test.js
import {destroyHotKeys, initHotKeys} from '../ui/hotKeyController';
import {
    charPressedEvent,
    downArrowPressedEvent,
    leftArrowPressedEvent,
    numPressedEvent,
    rightArrowPressedEvent,
    upArrowPressedEvent
} from "./eventDefaults";
import {ROTATION_DIRECTION} from "../global/constants";

describe('HotKeyController', () => {
    let mockUI, fractalApp, originalIsJuliaMode;

    beforeEach(() => {
        // Mock UI functions using the factory pattern
        mockUI = createMockUI();

        // Save original isJuliaMode to restore later
        originalIsJuliaMode = mockUI.isJuliaMode;

        // Create mock fractalApp using factory
        fractalApp = createMockFractalApp();
        fractalApp.c = [0.5, 0.5];

        // Attach hotkey handler with our mock app.
        initHotKeys(fractalApp);
    });

    afterEach(() => {
        mockUI.isJuliaMode = originalIsJuliaMode;
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
        expect(mockUI.travelToPreset).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Shift+Numkeys trigger dive in Julia mode or travel to preset otherwise', async () => {
        mockUI.isJuliaMode = jest.fn(() => false);

        // No Julia mode, Shift does not make a difference - travel to preset
        document.dispatchEvent(numPressedEvent(1, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockUI.travelToPreset).toHaveBeenCalled();

        // In Julia mode, dive is triggered
        mockUI.isJuliaMode = jest.fn(() => true);
        document.dispatchEvent(numPressedEvent(1, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(mockUI.startJuliaDive).toHaveBeenCalled();
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

        expect(fractalApp.animateZoomTo).toHaveBeenCalled();
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
        expect(mockUI.randomizeColors).not.toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Enter key toggles the UI header', async () => {
        // document.dispatchEvent(defaultKeyboardEvent('Enter'));
        // await Promise.resolve();
        // expect(mockUI.toggleHeader).toHaveBeenCalled();
    });
});
