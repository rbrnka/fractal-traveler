# Synaptory Fractal Traveler
Interactive, WebGL-powered fractal explorer that lets you pan, zoom, and explore the mesmerizing depths of the Mandelbrot set (and optionally other fractal types). Built with modern JavaScript, ES6 modules, and WebGL, this app provides smooth animations and intuitive touch/mouse controls—allowing users to travel through intricate fractal landscapes with ease.

Developed for the [Unmasking Chaos](https://open.substack.com/pub/synaptory/p/unmasking-chaos?r=2qbtpc&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false) article on my Substack blog.

## Features
- Interactive Exploration:
Pan and zoom across the fractal plane via mouse drag, scroll wheel, or multi-touch gestures.

- Smooth Animations:
Enjoy smooth transitions when panning and zooming, with animations that dynamically interpolate between states.

- Preset Views:
Instantly travel to a series of predefined fractal regions (presets) using dedicated buttons.

- Responsive UI:
Designed with both desktop and mobile users in mind, featuring touch-friendly controls and dynamic header behavior.

- Modern Development:
Uses WebGL for rendering, ES6 modules for a modular codebase, and webpack for bundling and production optimization. Unit tests are implemented with Jest to ensure robust functionality.

- Extensibility:
The architecture supports additional fractal types (e.g., Julia sets) and further customization of rendering options.

## Getting Started

### Prerequisites
- Node.js (v12 or later)
- npm (or yarn)

### Installation
1. Clone the repository: `git clone https://github.com/yourusername/fractal-traveler.git`
 
2. Navigate to the directory:  `cd fractal-traveler`

3. Install the dependencies:
`npm install`

4. Usage
- `npm run start` to start localhost webserver and run the app (`localhost:8080`)
- `npm run build` for production build (minified files)
- `npm run dev` for local build (source maps)
- `npm run test` to run test suites

## Changelog
### v1.3 (latest)
- This version contains the directory and build structure, previous versions were plain apps

## Structure
- fractalRenderer.js:
This module defines a fractalRenderer abstract class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes animation methods.

- mandelbrotRenderer.js:
This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.

- mouseEventHandlers.js:
This module exports a function registerTouchEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.

- touchEventHandlers.js:
This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.

- ui.js:
Contains code to manage the UI (header interactions, infoText update, etc.).

- utils.js:
Contains helper functions for working with URL parameters, etc.

- main.js:
The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), registers events, initializes the UI and the fractal.

## Controls:
- Drag: pan
- Wheel: zoom
- Left Click: center & URL link
- Right Click: Guiding lines
- Double click: zoom-in/out & center
- F11: fullscreen

## License
This project is licensed under the MIT License. See  for details.


Radim Brnka © 2025, Inspired by the intricate beauty of fractals, developed for interactive exploration and learning.

