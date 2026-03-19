/**
 * @module Dialogs
 * @description Save view and edit coordinates dialog controllers
 * @author Radim Brnka
 * @copyright Synaptory Fractal Traveler, 2025-2026
 * @license MIT
 */

import {FRACTAL_TYPE, log} from '../global/constants';
import {ddValue, normalizeRotation} from '../global/utils';

// ─────────────────────────────────────────────────────────────────────────────
// State and element references
// ─────────────────────────────────────────────────────────────────────────────

let fractalApp = null;
let fractalMode = FRACTAL_TYPE.MANDELBROT;

// Save View Dialog elements
let saveViewDialog = null;
let saveViewNameInput = null;
let saveViewConfirmBtn = null;
let saveViewCancelBtn = null;

// Edit Coords Dialog elements
let editCoordsDialog = null;
let editPanXInput = null;
let editPanYInput = null;
let editZoomInput = null;
let editRotationInput = null;
let editCxInput = null;
let editCyInput = null;
let editJsonInput = null;
let editCoordsError = null;
let editCoordsApplyBtn = null;
let editCoordsCancelBtn = null;
let juliaCInputs = null;

// Callbacks
let onPresetSaved = null;
let onCoordsApplied = null;

// ─────────────────────────────────────────────────────────────────────────────
// User Presets Storage
// ─────────────────────────────────────────────────────────────────────────────

const USER_PRESETS_KEY_MANDELBROT = 'u_mandelbrot_presets';
const USER_PRESETS_KEY_JULIA = 'u_julia_presets';
const USER_PRESETS_KEY_RIEMANN = 'u_riemann_presets';
const USER_PRESETS_KEY_ROSSLER = 'u_rossler_presets';

function getUserPresetsKey() {
    switch (fractalMode) {
        case FRACTAL_TYPE.JULIA:
            return USER_PRESETS_KEY_JULIA;
        case FRACTAL_TYPE.RIEMANN:
            return USER_PRESETS_KEY_RIEMANN;
        case FRACTAL_TYPE.ROSSLER:
            return USER_PRESETS_KEY_ROSSLER;
        default:
            return USER_PRESETS_KEY_MANDELBROT;
    }
}

/**
 * Gets user-saved presets from localStorage
 * @returns {Array}
 */
export function getUserPresets() {
    try {
        const key = getUserPresetsKey();
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('Failed to load user presets:', e);
        return [];
    }
}

function saveUserPresets(presets) {
    try {
        const key = getUserPresetsKey();
        localStorage.setItem(key, JSON.stringify(presets));
    } catch (e) {
        console.warn('Failed to save user presets:', e);
    }
}

function saveCurrentViewAsPreset(name) {
    if (!fractalApp) return null;

    const preset = {
        id: name,
        isUserPreset: true,
        pan: [...fractalApp.pan],
        zoom: fractalApp.zoom,
        rotation: normalizeRotation(fractalApp.rotation),
        paletteId: fractalApp.PALETTES?.[fractalApp.currentPaletteIndex]?.id || null
    };

    if (fractalMode === FRACTAL_TYPE.JULIA && fractalApp.c) {
        preset.c = [...fractalApp.c];
    }

    const presets = getUserPresets();

    // Check for duplicate names
    const existingIndex = presets.findIndex(p => p.id === name);
    if (existingIndex >= 0) {
        presets[existingIndex] = preset;
    } else {
        presets.push(preset);
    }

    saveUserPresets(presets);
    log(`Saved user preset: ${name}`);
    return preset;
}

/**
 * Deletes a user preset by ID
 * @param {string} presetId
 */
export function deleteUserPreset(presetId) {
    const presets = getUserPresets();
    const filtered = presets.filter(p => p.id !== presetId);
    saveUserPresets(filtered);
    log(`Deleted user preset: ${presetId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Save View Dialog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shows the save view dialog
 */
export function showSaveViewDialog() {
    if (!saveViewDialog) return;

    saveViewNameInput.value = '';
    saveViewDialog.showModal();
    saveViewNameInput.focus();
}

function hideSaveViewDialog() {
    if (saveViewDialog) {
        saveViewDialog.close();
    }
}

function handleSaveViewConfirm() {
    const name = saveViewNameInput.value.trim();
    if (!name) {
        saveViewNameInput.focus();
        return;
    }

    const preset = saveCurrentViewAsPreset(name);
    hideSaveViewDialog();

    if (onPresetSaved && preset) {
        onPresetSaved(preset);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Coords Dialog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shows the edit coordinates dialog
 */
export function showEditCoordsDialog() {
    if (!editCoordsDialog || !fractalApp) return;

    // Populate fields with current values
    const viewPanX = ddValue(fractalApp.panDD.x);
    const viewPanY = ddValue(fractalApp.panDD.y);

    editPanXInput.value = viewPanX.toFixed(16).replace(/\.?0+$/, '');
    editPanYInput.value = viewPanY.toFixed(16).replace(/\.?0+$/, '');
    editZoomInput.value = fractalApp.zoom.toString();
    editRotationInput.value = (fractalApp.rotation * 180 / Math.PI).toFixed(2).replace(/\.?0+$/, '');

    // Show/hide Julia C inputs
    if (juliaCInputs) {
        if (fractalMode === FRACTAL_TYPE.JULIA && fractalApp.c) {
            juliaCInputs.style.display = 'contents';
            editCxInput.value = fractalApp.c[0].toFixed(10).replace(/\.?0+$/, '');
            editCyInput.value = fractalApp.c[1].toFixed(10).replace(/\.?0+$/, '');
        } else {
            juliaCInputs.style.display = 'none';
        }
    }

    editJsonInput.value = '';
    editCoordsError.textContent = '';

    editCoordsDialog.showModal();
    editPanXInput.focus();
    editPanXInput.select();
}

function hideEditCoordsDialog() {
    if (editCoordsDialog) {
        editCoordsDialog.close();
    }
}

function parseEditCoordsInput() {
    const jsonText = editJsonInput.value.trim();

    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText);
            const result = {};

            if (parsed.pan && Array.isArray(parsed.pan) && parsed.pan.length >= 2) {
                result.panX = parseFloat(parsed.pan[0]);
                result.panY = parseFloat(parsed.pan[1]);
            }

            if (parsed.zoom !== undefined) {
                result.zoom = parseFloat(parsed.zoom);
            }

            if (parsed.rotation !== undefined) {
                result.rotation = parseFloat(parsed.rotation);
            }

            if (parsed.c && Array.isArray(parsed.c) && parsed.c.length >= 2) {
                result.cx = parseFloat(parsed.c[0]);
                result.cy = parseFloat(parsed.c[1]);
            }

            if (parsed.paletteId) {
                result.paletteId = parsed.paletteId;
            }

            return result;
        } catch (e) {
            return {error: 'Invalid JSON format'};
        }
    }

    // Parse individual fields
    const result = {};
    const panX = editPanXInput.value.trim();
    const panY = editPanYInput.value.trim();
    const zoom = editZoomInput.value.trim();
    const rotation = editRotationInput.value.trim();

    if (panX) {
        const val = parseFloat(panX);
        if (isNaN(val)) return {error: 'Invalid Pan X value'};
        result.panX = val;
    }

    if (panY) {
        const val = parseFloat(panY);
        if (isNaN(val)) return {error: 'Invalid Pan Y value'};
        result.panY = val;
    }

    if (zoom) {
        const val = parseFloat(zoom);
        if (isNaN(val) || val <= 0) return {error: 'Invalid Zoom value (must be positive)'};
        result.zoom = val;
    }

    if (rotation) {
        const val = parseFloat(rotation);
        if (isNaN(val)) return {error: 'Invalid Rotation value'};
        result.rotation = val * Math.PI / 180;
    }

    if (fractalMode === FRACTAL_TYPE.JULIA && juliaCInputs?.style.display !== 'none') {
        const cx = editCxInput.value.trim();
        const cy = editCyInput.value.trim();

        if (cx) {
            const val = parseFloat(cx);
            if (isNaN(val)) return {error: 'Invalid C Real value'};
            result.cx = val;
        }

        if (cy) {
            const val = parseFloat(cy);
            if (isNaN(val)) return {error: 'Invalid C Imag value'};
            result.cy = val;
        }
    }

    return result;
}

function validateEditCoordsInput() {
    const parsed = parseEditCoordsInput();

    if (parsed.error) {
        editCoordsError.textContent = parsed.error;
        return null;
    }

    if (Object.keys(parsed).length === 0) {
        editCoordsError.textContent = 'No values entered';
        return null;
    }

    editCoordsError.textContent = '';
    return parsed;
}

async function applyEditedCoords() {
    const parsed = validateEditCoordsInput();
    if (!parsed || !fractalApp) return;

    if (parsed.panX !== undefined) fractalApp.pan[0] = parsed.panX;
    if (parsed.panY !== undefined) fractalApp.pan[1] = parsed.panY;
    if (parsed.zoom !== undefined) fractalApp.zoom = parsed.zoom;
    if (parsed.rotation !== undefined) fractalApp.rotation = parsed.rotation;

    if (fractalMode === FRACTAL_TYPE.JULIA && fractalApp.c) {
        if (parsed.cx !== undefined) fractalApp.c[0] = parsed.cx;
        if (parsed.cy !== undefined) fractalApp.c[1] = parsed.cy;
    }

    if (parsed.paletteId && fractalApp.PALETTES) {
        const paletteIndex = fractalApp.PALETTES.findIndex(p => p.id === parsed.paletteId);
        if (paletteIndex >= 0) {
            await fractalApp.applyPaletteByIndex(paletteIndex, 0);
        }
    }

    fractalApp.draw();
    hideEditCoordsDialog();

    if (onCoordsApplied) {
        onCoordsApplied(parsed);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initializes the dialogs module
 * @param {Object} options
 * @param {Object} options.renderer - Fractal renderer instance
 * @param {FRACTAL_TYPE} options.mode - Current fractal mode
 * @param {Function} [options.onPresetSaved] - Callback when preset is saved
 * @param {Function} [options.onCoordsApplied] - Callback when coords are applied
 */
export function init(options) {
    fractalApp = options.renderer;
    fractalMode = options.mode;
    onPresetSaved = options.onPresetSaved || null;
    onCoordsApplied = options.onCoordsApplied || null;

    // Bind elements
    saveViewDialog = document.getElementById('saveViewDialog');
    saveViewNameInput = document.getElementById('saveViewName');
    saveViewConfirmBtn = document.getElementById('saveViewConfirm');
    saveViewCancelBtn = document.getElementById('saveViewCancel');

    editCoordsDialog = document.getElementById('editCoordsDialog');
    editPanXInput = document.getElementById('editPanX');
    editPanYInput = document.getElementById('editPanY');
    editZoomInput = document.getElementById('editZoom');
    editRotationInput = document.getElementById('editRotation');
    editCxInput = document.getElementById('editCx');
    editCyInput = document.getElementById('editCy');
    editJsonInput = document.getElementById('editJsonInput');
    editCoordsError = document.getElementById('editCoordsError');
    editCoordsApplyBtn = document.getElementById('editCoordsApply');
    editCoordsCancelBtn = document.getElementById('editCoordsCancel');
    juliaCInputs = document.getElementById('juliaCInputs');

    // Save View Dialog events
    if (saveViewConfirmBtn) {
        saveViewConfirmBtn.addEventListener('click', handleSaveViewConfirm);
    }

    if (saveViewCancelBtn) {
        saveViewCancelBtn.addEventListener('click', hideSaveViewDialog);
    }

    if (saveViewNameInput) {
        saveViewNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveViewConfirm();
            } else if (e.key === 'Escape') {
                hideSaveViewDialog();
            }
        });
    }

    if (saveViewDialog) {
        saveViewDialog.addEventListener('click', (e) => {
            if (e.target === saveViewDialog) {
                hideSaveViewDialog();
            }
        });
    }

    // Edit Coords Dialog events
    if (editCoordsApplyBtn) {
        editCoordsApplyBtn.addEventListener('click', applyEditedCoords);
    }

    if (editCoordsCancelBtn) {
        editCoordsCancelBtn.addEventListener('click', hideEditCoordsDialog);
    }

    const coordInputs = [editPanXInput, editPanYInput, editZoomInput, editRotationInput, editCxInput, editCyInput];
    coordInputs.forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyEditedCoords();
                } else if (e.key === 'Escape') {
                    hideEditCoordsDialog();
                }
            });
            input.addEventListener('input', validateEditCoordsInput);
        }
    });

    if (editJsonInput) {
        editJsonInput.addEventListener('input', validateEditCoordsInput);
        editJsonInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideEditCoordsDialog();
            }
        });
    }

    if (editCoordsDialog) {
        editCoordsDialog.addEventListener('click', (e) => {
            if (e.target === editCoordsDialog) {
                hideEditCoordsDialog();
            }
        });
    }

    log('Dialogs initialized');
}

/**
 * Updates the renderer and mode references
 * @param {Object} renderer
 * @param {FRACTAL_TYPE} mode
 */
export function setContext(renderer, mode) {
    fractalApp = renderer;
    fractalMode = mode;
}

/**
 * Cleans up event listeners
 */
export function destroy() {
    // Event listeners are on DOM elements, they'll be cleaned up if elements are removed
    // For now, just clear references
    fractalApp = null;
    onPresetSaved = null;
    onCoordsApplied = null;
}
