/**
 * @module AudioManager
 * @description Manages background audio for tours and demos
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {FF_RIEMANN_TOUR_MUSIC} from './constants';

/** @type {HTMLAudioElement|null} */
let tourAudio = null;

/** @type {boolean} */
let isMuted = false;

/** @type {number|null} */
let fadeInterval = null;

/** @type {boolean} */
let audioReady = false;

/** Default volume level (0-1) */
const DEFAULT_VOLUME = 0.4;

/** Fade duration in ms */
const FADE_DURATION = 2000;

/** Fade step interval in ms */
const FADE_STEP = 50;

/**
 * Initializes the audio element for the Riemann tour.
 * Call this once at app startup.
 * @param {string} audioSrc - Path to the audio file
 */
export function initTourAudio(audioSrc) {
    if (!FF_RIEMANN_TOUR_MUSIC) {
        console.log('AudioManager: Tour music disabled by feature flag');
        return;
    }

    if (tourAudio) {
        console.log('AudioManager: Tour audio already initialized');
        return;
    }

    try {
        tourAudio = new Audio(audioSrc);
        tourAudio.loop = true;
        tourAudio.volume = 0;
        tourAudio.preload = 'auto';

        tourAudio.addEventListener('canplaythrough', () => {
            audioReady = true;
            console.log('AudioManager: Audio loaded and ready to play');
        });

        tourAudio.addEventListener('error', (e) => {
            const error = tourAudio?.error;
            console.error('AudioManager: Failed to load tour audio', {
                code: error?.code,
                message: error?.message,
                src: audioSrc
            });
            tourAudio = null;
            audioReady = false;
        });

        tourAudio.addEventListener('loadstart', () => {
            console.log('AudioManager: Loading audio from', audioSrc);
        });

        // Force load
        tourAudio.load();

        console.log('AudioManager: Tour audio initialized');
    } catch (e) {
        console.error('AudioManager: Could not create audio element', e);
        tourAudio = null;
    }
}

/**
 * Starts playing the tour music with a fade-in effect.
 * @returns {Promise<void>}
 */
export async function startTourMusic() {
    console.log('AudioManager: startTourMusic called', {
        featureFlag: FF_RIEMANN_TOUR_MUSIC,
        tourAudio: !!tourAudio,
        audioReady,
        isMuted
    });

    if (!FF_RIEMANN_TOUR_MUSIC) {
        console.log('AudioManager: Feature flag disabled');
        return;
    }

    if (!tourAudio) {
        console.warn('AudioManager: No audio element available');
        return;
    }

    if (isMuted) {
        console.log('AudioManager: Audio is muted');
        return;
    }

    // Clear any existing fade
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }

    try {
        tourAudio.currentTime = 0;
        tourAudio.volume = 0.01; // Start with tiny volume (some browsers need non-zero)

        console.log('AudioManager: Attempting to play...');
        const playPromise = tourAudio.play();

        if (playPromise !== undefined) {
            await playPromise;
            console.log('AudioManager: Play started successfully');
        }

        // Fade in
        const targetVolume = DEFAULT_VOLUME;
        const steps = FADE_DURATION / FADE_STEP;
        const volumeStep = targetVolume / steps;

        fadeInterval = setInterval(() => {
            if (!tourAudio) {
                clearInterval(fadeInterval);
                fadeInterval = null;
                return;
            }
            if (tourAudio.volume < targetVolume - volumeStep) {
                tourAudio.volume = Math.min(targetVolume, tourAudio.volume + volumeStep);
            } else {
                tourAudio.volume = targetVolume;
                clearInterval(fadeInterval);
                fadeInterval = null;
                console.log('AudioManager: Fade-in complete, volume:', targetVolume);
            }
        }, FADE_STEP);

    } catch (e) {
        console.error('AudioManager: Could not play audio', e.name, e.message);
        // NotAllowedError = autoplay blocked, need user interaction
        if (e.name === 'NotAllowedError') {
            console.warn('AudioManager: Autoplay blocked - browser requires user interaction first');
        }
    }
}

/**
 * Stops the tour music with a fade-out effect.
 * @returns {Promise<void>}
 */
export async function stopTourMusic() {
    if (!tourAudio) {
        return;
    }

    // Clear any existing fade
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }

    if (tourAudio.paused) {
        return;
    }

    console.log('AudioManager: Stopping tour music');

    // Fade out
    const startVolume = tourAudio.volume;
    if (startVolume === 0) {
        tourAudio.pause();
        return;
    }

    const steps = FADE_DURATION / FADE_STEP;
    const volumeStep = startVolume / steps;

    return new Promise((resolve) => {
        fadeInterval = setInterval(() => {
            if (!tourAudio) {
                clearInterval(fadeInterval);
                fadeInterval = null;
                resolve();
                return;
            }
            if (tourAudio.volume > volumeStep) {
                tourAudio.volume = Math.max(0, tourAudio.volume - volumeStep);
            } else {
                tourAudio.volume = 0;
                tourAudio.pause();
                clearInterval(fadeInterval);
                fadeInterval = null;
                console.log('AudioManager: Fade-out complete');
                resolve();
            }
        }, FADE_STEP);
    });
}

/**
 * Toggles mute state for tour music.
 * @returns {boolean} New mute state
 */
export function toggleMute() {
    isMuted = !isMuted;

    if (tourAudio) {
        if (isMuted) {
            tourAudio.volume = 0;
        } else if (!tourAudio.paused) {
            tourAudio.volume = DEFAULT_VOLUME;
        }
    }

    console.log(`AudioManager: Tour music ${isMuted ? 'muted' : 'unmuted'}`);
    return isMuted;
}

/**
 * Returns current mute state.
 * @returns {boolean}
 */
export function isTourMusicMuted() {
    return isMuted;
}

/**
 * Returns whether tour music is currently playing.
 * @returns {boolean}
 */
export function isTourMusicPlaying() {
    return tourAudio && !tourAudio.paused;
}

/**
 * Sets the volume for tour music.
 * @param {number} volume - Volume level (0-1)
 */
export function setTourMusicVolume(volume) {
    if (tourAudio && !isMuted) {
        tourAudio.volume = Math.max(0, Math.min(1, volume));
    }
}

/**
 * Cleans up audio resources.
 */
export function destroyTourAudio() {
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }

    if (tourAudio) {
        tourAudio.pause();
        tourAudio.src = '';
        tourAudio = null;
    }
    audioReady = false;

    console.log('AudioManager: Tour audio destroyed');
}
