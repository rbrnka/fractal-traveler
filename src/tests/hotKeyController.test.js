// __tests__/hotKeyController.test.js
import {destroyHotKeys, initHotKeys} from '../ui/hotKeyController';

// Use actual constants if needed:
import * as UI from "../ui/ui";
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
    let fractalApp;
    let originalIsJuliaMode;

    beforeEach(() => {
        // Save original isJuliaMode to restore later
        originalIsJuliaMode = UI.isJuliaMode;

        // Mock isJuliaMode to return true for tests that require it.
        UI.isJuliaMode = jest.fn(() => true);
        UI.travelToPreset = jest.fn(() => Promise.resolve());
        UI.startJuliaDive = jest.fn(() => Promise.resolve());

        // Create a mock fractalApp object with necessary properties/methods.
        fractalApp = {
            pan: [0, 0],
            c: [0.5, 0.5],
            rotation: 0,
            zoom: 1,
            DIVES: [{}, {}, {}],
            animatePanTo: jest.fn(() => Promise.resolve()),
            animatePanBy: jest.fn(() => Promise.resolve()),
            animateToC: jest.fn(() => Promise.resolve()),
            animateInfiniteRotation: jest.fn(() => Promise.resolve()),
            animateTravelToPreset: jest.fn(() => Promise.resolve()),
            animateDive: jest.fn(() => Promise.resolve()),
            stopCurrentRotationAnimation: jest.fn(),
            stopAllNonColorAnimations: jest.fn(),
            noteInteraction: jest.fn(),
            draw: jest.fn(),
            updateInfo: jest.fn(),
            updateInfoOnAnimationFinished: jest.fn(),
        };

        // Attach hotkey handler with our mock app.
        initHotKeys(fractalApp);
    });

    afterEach(() => {
        UI.isJuliaMode = originalIsJuliaMode;
        // Remove keydown listeners by replacing document's event listeners
        // (Depending on your implementation, you might need to remove them explicitly.)
        document.body.innerHTML = '';
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
        expect(UI.travelToPreset).toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------------------------------------------------
    test('Shift+Numkeys trigger dive in Julia mode or travel to preset otherwise', async () => {
        UI.isJuliaMode = jest.fn(() => false);

        // No Julia mode, Shift does not make a difference - travel to preset
        document.dispatchEvent(numPressedEvent(1, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(UI.travelToPreset).toHaveBeenCalled();

        // In Julia mode, dive is triggered
        UI.isJuliaMode = jest.fn(() => true);
        document.dispatchEvent(numPressedEvent(1, true));
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(UI.startJuliaDive).toHaveBeenCalled();
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
});
