// __tests__/eventDefaults.js

/**
 * Mouse buttons matching the MouseEvent
 * @enum {number}
 */
export const MOUSE_BUTTONS = {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2,
}

/**
 * Mouse events
 * @enum {string}
 */
export const MOUSE_EVENT_TYPE = {
    UP: 'mouseup',
    DOWN: 'mousedown',
    MOVE: 'mousemove',
    WHEEL: 'wheel'
}
/**
 * Keyboard events
 * @enum {string}
 */
export const KEYBOARD_EVENT_TYPE = {
    UP: 'keyup',
    DOWN: 'keydown',
}

/**
 * Simulated mouse button event
 * @param {MOUSE_EVENT_TYPE} type
 * @param {MOUSE_BUTTONS} button
 * @param {number} x x-coord of the event
 * @param {number} y y-coord of the event
 * @return {MouseEvent}
 */
export const defaultMouseButtonEvent = (type, button, x = 100, y = 100) => {
    // Mapping from the "button" property to the "buttons" bitmask.
    const BUTTONS_MAPPING = {
        [MOUSE_BUTTONS.LEFT]: 1,
        [MOUSE_BUTTONS.MIDDLE]: 4,
        [MOUSE_BUTTONS.RIGHT]: 2,
    };

    return new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: button,
        buttons: BUTTONS_MAPPING[button],
        bubbles: true
    });
}

/**
 * Simulated mouse wheel event
 * @param {number} x x-coord of the event
 * @param {number} y y-coord of the event
 * @param deltaX x-delta of the wheel
 * @param deltaY x-delta of the wheel
 * @return {WheelEvent}
 */
export const defaultMouseWheelEvent = (x = 100, y = 100, deltaX = 100, deltaY = 100) => {
    return new WheelEvent('wheel', {
        clientX: x,
        clientY: y,
        deltaX: deltaX,
        deltaY: deltaY,
        bubbles: true,
        cancelable: true
    });
}

/** Simulated keyboard event */
export const defaultKeyboardEvent = (keyCode, shift = false, ctrl = false, alt = false, type = KEYBOARD_EVENT_TYPE.DOWN) => {
    return new KeyboardEvent(type, {
        code: keyCode,
        shiftKey: shift,
        altKey: alt,
        ctrlKey: ctrl,
    });
}

// MOUSE EVENTS
export const mouseLeftDownEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.DOWN, MOUSE_BUTTONS.LEFT, x, y);
export const mouseLeftUpEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.UP, MOUSE_BUTTONS.LEFT, x, y);
export const mouseLeftMoveEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.MOVE, MOUSE_BUTTONS.LEFT, x, y);
export const mouseRightDownEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.DOWN, MOUSE_BUTTONS.RIGHT, x, y);
export const mouseRightUpEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.UP, MOUSE_BUTTONS.RIGHT, x, y);
export const mouseRightMoveEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.MOVE, MOUSE_BUTTONS.RIGHT, x, y);
export const mouseMiddleDownEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.UP, MOUSE_BUTTONS.MIDDLE, x, y);
export const mouseMiddleUpEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.UP, MOUSE_BUTTONS.MIDDLE, x, y);
export const mouseWheelYEvent = (deltaY = 100) => defaultMouseWheelEvent(100, 100, 0, deltaY);

// KEYBOARD EVENTS
export const leftArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowLeft', s, c, a);
export const rightArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowRight', s, c, a);
export const downArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowDown', s, c, a);
export const upArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowUp', s, c, a);

export const numPressedEvent = (num, s = false, c = false, a = false) => defaultKeyboardEvent(`Numpad${num.toString()}`, s, c, a);
export const charPressedEvent = (char, s = false, c = false, a = false) => defaultKeyboardEvent(`Key${char.toUpperCase()}`, s, c, a);
