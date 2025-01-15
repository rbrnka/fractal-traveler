# Synaptory Fractal Traveler
Developed for the [Unmasking Chaos](https://open.substack.com/pub/synaptory/p/unmasking-chaos?r=2qbtpc&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false) article.

## Changelog
### v1.3 (Latest)
tbd


## Controls:
- Drag: pan
- Wheel: zoom
- Left Click: center & URL link
- Right Click: Guiding lines
- Double click: zoom-in/out & center
- F11: fullscreen

Radim Brnka © 2025

## Structure
### mandelbrotRenderer.js:
This module defines a MandelbrotRenderer class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes animation methods.

### touchEventHandlers.js:
This module exports a function registerEventHandlers that sets up all mouse and touch events. It uses properties on the fractalApp instance (such as isDragging, dragThreshold, etc.) to manage state.

### ui.js:
Contains code to manage the UI (header interactions, toggling, etc.) via pointer events.

### utils.js:
Contains helper functions for working with URL parameters.

### main.js:
The entry point that imports all modules, creates the fractal renderer instance (passing the canvas ID), registers events, initializes the UI, loads URL parameters, and then calls reset() to render the initial fractal.