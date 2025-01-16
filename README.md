# Synaptory Fractal Traveler
Developed for the [Unmasking Chaos](https://open.substack.com/pub/synaptory/p/unmasking-chaos?r=2qbtpc&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false) article.

## Usage
- `npm run start` to start localhost webserver and run the app (`localhost:8080`)
- `npm run build` for production build (minified files)
- `npm run dev` for local build (source maps)
- `npm run test` to run test suites

## Changelog
### v1.3 (latest)
- This version contains the directory and build structure, previous versions were plain apps

## Structure
### fractalRenderer.js:
This module defines a fractalRenderer abstract class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes animation methods.

### mandelbrotRenderer.js:
This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.
### mouseEventHandlers.js:
This module exports a function registerTouchEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.

### touchEventHandlers.js:
This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.

### ui.js:
Contains code to manage the UI (header interactions, infoText update, etc.).

### utils.js:
Contains helper functions for working with URL parameters, etc.

### main.js:
The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), registers events, initializes the UI and the fractal.

## TODOs:
- [ ] Zoom limits properly implemented
- [ ] Touch event handlers only loaded for touch devices

## Controls:
- Drag: pan
- Wheel: zoom
- Left Click: center & URL link
- Right Click: Guiding lines
- Double click: zoom-in/out & center
- F11: fullscreen

Radim Brnka © 2025
