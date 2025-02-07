# Synaptory Fractal Traveler
Interactive, WebGL-powered fractal explorer that lets you pan, rotate, zoom, and explore the mesmerizing depths of the Mandelbrot and Julia sets. Built with modern JavaScript, ES6, and WebGL, this app provides smooth animations and intuitive touch/mouse controls—allowing you to travel through intricate fractal landscapes with ease.

Developed for the [Unmasking Chaos](https://open.substack.com/pub/synaptory/p/unmasking-chaos?r=2qbtpc&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false) article on my Substack blog.

## Features
- Interactive Exploration:
Explore the fractal plane via mouse drag, scroll wheel, or multi-touch gestures.

- Smooth Animations:
Enjoy smooth transitions when panning and zooming, with animations that dynamically interpolate between states.

- Preset Views:
Instantly travel to a series of predefined fractal regions (presets) using dedicated buttons.

- Responsive UI:
Designed with both desktop and mobile users in mind, featuring touch-friendly controls and dynamic resizing.

- Modern Development:
Uses WebGL for rendering, ES6 for a modular codebase, and webpack for bundling and production optimization. Unit tests are implemented with Jest to ensure robust functionality.

- Extensibility:
The architecture supports additional fractal types and further customization of rendering options.

## Getting Started

### Prerequisites
- Node.js (v12 or later)
- npm (or yarn)

### Installation
1. `git clone https://github.com/yourusername/fractal-traveler.git`
2. `cd fractal-traveler`
3. `npm install`

### Usage:
- `npm run start` to start localhost webserver and run the app (`localhost:8080`)
- `npm run build` for production build (minified files, FTP deploy using .env)
- `npm run dev` for local build (source maps)
- `npm run test` to run test suites

## Changelog
### v1.6
- Improved Julia coloring
- Improved Julia demo
- Proper defaulting of pan and centering on init
- Preparation for improved Julia color randomization
- Hotkeys Q-T to rotate, reset and randomize colors
- Arrow hotkeys to smoothly animate Julia set
- Default Julia state changed to more appealing and to less detailed in mobile version
- Disabled graphics of sliders during Julia demo
- Demo active color to more visible
- GL performance optimizations
- Dev: FTP upload in prod deploy using .env
- Bugs fixed: 
  - Off-center after screen resize
  - Aspect ratio on high DPR devices

### v1.5
- Julia set support
- Presets with transitions
- Sliders to control the Julia fractal added and updated with changing the set
- Screenshot adds fractal coords and settings into watermark
- Responsive header height

### v1.4
- Screenshot button added
- Touch device optimizations for simultaneous pan, zoom and rotate
- Added demo mode that takes you through all the Mandelbrot presets in a loop
- Added support for rotating the fractal
- Stops current animation when a new one is invoked
- CSS minification on prod build
- Nicer buttons

- Bugs fixed:
  - Double initialization of event listeners
  - infoText not updating properly
  - Header closing on click

### v1.3
- This version contains the directory and build structure, previous versions were simple PoCs

## Structure
- fractalRenderer.js:
This module defines a fractalRenderer abstract class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes common animation methods.

- mandelbrotRenderer.js:
This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.

- juliaRenderer.js:
  This module defines a JuliaRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Julia set fractal and sets preset zoom-ins.

- mouseEventHandlers.js:
This module exports a function registerTouchEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.

- touchEventHandlers.js:
This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.

- ui.js:
Contains code to manage the UI (header interactions, buttons, infoText update, etc.).

- utils.js:
Contains helper functions for working with URL parameters, etc.

- main.js:
The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), registers events, initializes the UI and the fractal.

## Controls:
### Mouse
- Left Drag: Pan
- Right Drag: Rotate
- Wheel: Zoom
- Left Single Click: Center & Generate URL link
- Double click: Zoom-in/out & Center
- Middle Click: Toggle guiding lines
### Keyboard
- F11: Toggle fullscreen
- Q: Rotate counter-clockwise
- W: Rotate clockwise
- E: Toggle guiding lines
- R: Reset
- T: Randomize color palette
- S: Take screenshot
- A: Force resize
- Left/Right arrow (Julia only): Real part (cs) smooth stepping
- Down/Up arrow (Julia only): Imaginary part (cs) smooth stepping
- Shift + arrows: Super smooth stepping

### Touch
- One finger pan: Pan
- One finger tap: Center & Generate URL link
- One finger double-tap: Zoom-in/out & Center
- Pinch: Pan & Zoom & Rotate

## License
MIT License. See  for details.

Radim Brnka © 2025, Inspired by the intricate beauty of fractals, developed for interactive exploration and learning.