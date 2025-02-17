// __tests__/eventDefaults.js1

export const MOUSE_BUTTONS = {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2,
}

export const MOUSE_EVENT_TYPE = {
    UP: 'mouseup',
    DOWN: 'mousedown',
    MOVE: 'mousemove',
    WHEEL: 'wheel'
}
export const KEYBOARD_EVENT_TYPE = {
    UP: 'keyup',
    DOWN: 'keydown',
}


/** Simulated mosue button event */
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

/** Simulated wheel event */
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
export const mouseRightDownEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.DOWN, MOUSE_BUTTONS.RIGHT, x, y);
export const mouseLeftUpEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.UP, MOUSE_BUTTONS.LEFT, x, y);
export const mouseRightUpEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.UP, MOUSE_BUTTONS.RIGHT, x, y);
export const mouseLeftMoveEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.MOVE, MOUSE_BUTTONS.LEFT, x, y);
export const mouseRightMoveEvent = (x, y) => defaultMouseButtonEvent(MOUSE_EVENT_TYPE.MOVE, MOUSE_BUTTONS.RIGHT, x, y);
export const mouseWheelYEvent = (deltaY = 100) => defaultMouseWheelEvent(100, 100, 0, deltaY);

// KEYBOARD EVENTS
export const leftArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowLeft', s, c, a);
export const rightArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowRight', s, c, a);
export const downArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowDown', s, c, a);
export const upArrowPressedEvent = (s = false, c = false, a = false) => defaultKeyboardEvent('ArrowUp', s, c, a);

export const NumPressedEvent = (num, s = false, c = false, a = false) => defaultKeyboardEvent(`Numpad${num.toString()}`, s, c, a);
