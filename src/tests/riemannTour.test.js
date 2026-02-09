/**
 * @jest-environment jsdom
 */
// src/tests/riemannTour.test.js
// Tests for Riemann zeta function tour functionality

describe('RiemannRenderer Tour', () => {
    let mockRenderer;
    let travelDurations;
    let holdDelays;

    beforeEach(() => {
        jest.useFakeTimers();
        travelDurations = [];
        holdDelays = [];

        // Create mock renderer with tour functionality
        mockRenderer = {
            PRESETS: [
                { id: 'Point 1', type: 'special', pan: [0, 0], zoom: 10 },
                { id: 'Point 2', type: 'nontrivial', pan: [0.5, 14], zoom: 8 },
                { id: 'Point 3', type: 'trivial', pan: [-2, 0], zoom: 12 },
            ],
            zeroTourActive: false,

            stopAllNonColorAnimations: jest.fn(),

            // Mock travel that resolves after specified duration
            animateTravelToPreset: jest.fn((preset, d1, d2, d3) => {
                const totalDuration = (d1 || 0) + (d2 || 0) + (d3 || 0);
                travelDurations.push(totalDuration);
                return new Promise(resolve => {
                    setTimeout(resolve, totalDuration);
                });
            }),

            // Implement the actual tour logic
            async animateZeroTour(onPointReached = null, holdDuration = 4000, onBeforeTravel = null) {
                this.stopAllNonColorAnimations();
                this.zeroTourActive = true;

                for (let i = 0; i < this.PRESETS.length && this.zeroTourActive; i++) {
                    const point = this.PRESETS[i];
                    const preset = {
                        pan: point.pan,
                        zoom: point.zoom || 8,
                        rotation: 0,
                        paletteId: point.paletteId || 'Default'
                    };

                    // Hide overlay/markers before starting travel
                    if (onBeforeTravel) {
                        onBeforeTravel();
                    }

                    await this.animateTravelToPreset(preset, 2000, 1000, 2500);

                    // Show overlay at the end of animation
                    if (onPointReached && this.zeroTourActive) {
                        onPointReached(point, i);
                    }

                    if (this.zeroTourActive) {
                        holdDelays.push(holdDuration);
                        await new Promise(resolve => setTimeout(resolve, holdDuration));
                    }
                }

                // Return to first point if tour completed normally
                if (this.zeroTourActive && this.PRESETS.length > 0) {
                    await this.animateTravelToPreset(this.PRESETS[0], 2000, 1000, 2500);
                }

                this.zeroTourActive = false;
            },

            stopZeroTour() {
                this.zeroTourActive = false;
                this.stopAllNonColorAnimations();
            }
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Tour Initialization', () => {
        test('should set zeroTourActive to true when tour starts', async () => {
            expect(mockRenderer.zeroTourActive).toBe(false);

            const tourPromise = mockRenderer.animateZeroTour();

            // After starting, zeroTourActive should be true
            expect(mockRenderer.zeroTourActive).toBe(true);

            // Clean up
            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;
        });

        test('should call stopAllNonColorAnimations when tour starts', async () => {
            const tourPromise = mockRenderer.animateZeroTour();

            expect(mockRenderer.stopAllNonColorAnimations).toHaveBeenCalled();

            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;
        });
    });

    describe('Tour Callbacks', () => {
        test('should call onBeforeTravel before each point travel', async () => {
            const onBeforeTravel = jest.fn();
            const onPointReached = jest.fn();

            const tourPromise = mockRenderer.animateZeroTour(onPointReached, 100, onBeforeTravel);

            // First onBeforeTravel should be called immediately
            expect(onBeforeTravel).toHaveBeenCalledTimes(1);

            // Advance through first travel (5500ms total)
            jest.advanceTimersByTime(5500);
            await Promise.resolve();

            // onPointReached should be called after travel
            expect(onPointReached).toHaveBeenCalledTimes(1);
            expect(onPointReached).toHaveBeenCalledWith(mockRenderer.PRESETS[0], 0);

            // Advance through hold duration
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            // Second onBeforeTravel should be called
            expect(onBeforeTravel).toHaveBeenCalledTimes(2);

            // Stop tour and clean up
            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;
        });

        test('should call onPointReached with correct point and index after each travel', async () => {
            const onPointReached = jest.fn();

            const tourPromise = mockRenderer.animateZeroTour(onPointReached, 100);

            // Complete all 3 points + return travel
            for (let i = 0; i < 3; i++) {
                jest.advanceTimersByTime(5500); // Travel time
                await Promise.resolve();
                jest.advanceTimersByTime(100); // Hold time
                await Promise.resolve();
            }

            // Complete return travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();
            await tourPromise;

            expect(onPointReached).toHaveBeenCalledTimes(3);
            expect(onPointReached).toHaveBeenNthCalledWith(1, mockRenderer.PRESETS[0], 0);
            expect(onPointReached).toHaveBeenNthCalledWith(2, mockRenderer.PRESETS[1], 1);
            expect(onPointReached).toHaveBeenNthCalledWith(3, mockRenderer.PRESETS[2], 2);
        });

        test('should not call onPointReached if tour is stopped during travel', async () => {
            const onPointReached = jest.fn();
            const onBeforeTravel = jest.fn();

            const tourPromise = mockRenderer.animateZeroTour(onPointReached, 100, onBeforeTravel);

            // onBeforeTravel called, travel started
            expect(onBeforeTravel).toHaveBeenCalledTimes(1);

            // Stop tour during travel (before it completes)
            jest.advanceTimersByTime(1000);
            mockRenderer.stopZeroTour();

            // Finish the travel animation
            jest.runAllTimers();
            await tourPromise;

            // onPointReached should not have been called since tour was stopped
            expect(onPointReached).toHaveBeenCalledTimes(0);
        });
    });

    describe('Tour Timing', () => {
        test('should use specified holdDuration between points', async () => {
            const holdDuration = 7000; // 7 seconds like in actual app

            const tourPromise = mockRenderer.animateZeroTour(null, holdDuration);

            // Complete first travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();

            // Complete first hold
            jest.advanceTimersByTime(holdDuration);
            await Promise.resolve();

            // Stop and verify
            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;

            expect(holdDelays[0]).toBe(holdDuration);
        });

        test('should use default holdDuration of 4000ms if not specified', async () => {
            const tourPromise = mockRenderer.animateZeroTour();

            // Complete first travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();

            // Verify default hold duration is being used
            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;

            expect(holdDelays[0]).toBe(4000);
        });

        test('should use correct travel durations (2000 + 1000 + 2500 = 5500ms)', async () => {
            const tourPromise = mockRenderer.animateZeroTour(null, 100);

            // Complete first travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();

            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;

            // animateTravelToPreset should be called with durations 2000, 1000, 2500
            expect(travelDurations[0]).toBe(5500);
        });
    });

    describe('Tour Stopping', () => {
        test('should stop tour when stopZeroTour is called', async () => {
            const tourPromise = mockRenderer.animateZeroTour();

            expect(mockRenderer.zeroTourActive).toBe(true);

            mockRenderer.stopZeroTour();

            expect(mockRenderer.zeroTourActive).toBe(false);
            expect(mockRenderer.stopAllNonColorAnimations).toHaveBeenCalledTimes(2); // Once at start, once at stop

            jest.runAllTimers();
            await tourPromise;
        });

        test('should not continue to next point after stopZeroTour', async () => {
            const onPointReached = jest.fn();

            const tourPromise = mockRenderer.animateZeroTour(onPointReached, 100);

            // Complete first point
            jest.advanceTimersByTime(5500);
            await Promise.resolve();
            expect(onPointReached).toHaveBeenCalledTimes(1);

            // Stop during hold
            jest.advanceTimersByTime(50);
            mockRenderer.stopZeroTour();

            // Run remaining timers
            jest.runAllTimers();
            await tourPromise;

            // Should only have reached 1 point
            expect(onPointReached).toHaveBeenCalledTimes(1);
        });

        test('should set zeroTourActive to false when tour completes normally', async () => {
            // Use short hold duration for faster test
            const tourPromise = mockRenderer.animateZeroTour(null, 10);

            // Complete all 3 points
            for (let i = 0; i < 3; i++) {
                jest.advanceTimersByTime(5500); // Travel
                await Promise.resolve();
                jest.advanceTimersByTime(10); // Hold
                await Promise.resolve();
            }

            // Complete return travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();
            await tourPromise;

            expect(mockRenderer.zeroTourActive).toBe(false);
        });
    });

    describe('Tour with Empty Presets', () => {
        test('should handle empty PRESETS array gracefully', async () => {
            mockRenderer.PRESETS = [];

            const onPointReached = jest.fn();
            const tourPromise = mockRenderer.animateZeroTour(onPointReached, 100);

            jest.runAllTimers();
            await tourPromise;

            expect(onPointReached).not.toHaveBeenCalled();
            expect(mockRenderer.zeroTourActive).toBe(false);
        });
    });

    describe('Tour Return to Start', () => {
        test('should return to first preset after completing all points', async () => {
            const tourPromise = mockRenderer.animateZeroTour(null, 10);

            // Complete all 3 points
            for (let i = 0; i < 3; i++) {
                jest.advanceTimersByTime(5500);
                await Promise.resolve();
                jest.advanceTimersByTime(10);
                await Promise.resolve();
            }

            // Final return travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();
            await tourPromise;

            // Should have 4 travels: 3 points + 1 return
            expect(mockRenderer.animateTravelToPreset).toHaveBeenCalledTimes(4);

            // Last call should be to first preset
            const lastCall = mockRenderer.animateTravelToPreset.mock.calls[3];
            expect(lastCall[0].pan).toEqual(mockRenderer.PRESETS[0].pan);
        });

        test('should not return to start if tour was stopped', async () => {
            const tourPromise = mockRenderer.animateZeroTour(null, 100);

            // Complete first travel
            jest.advanceTimersByTime(5500);
            await Promise.resolve();

            // Stop tour
            mockRenderer.stopZeroTour();
            jest.runAllTimers();
            await tourPromise;

            // Should only have 1 travel (first point), no return travel
            expect(mockRenderer.animateTravelToPreset).toHaveBeenCalledTimes(1);
        });
    });
});

describe('UI Tour Integration', () => {
    test.todo('should hide overlay before travel starts');
    test.todo('should show overlay after travel completes');
    test.todo('should reset tour state when reset() is called');
    test.todo('should stop tour when toggleDemo() is called during active tour');
});
