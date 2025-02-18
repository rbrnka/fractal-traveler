# Synaptory Fractal Traveler
![image](https://github.com/user-attachments/assets/e3591847-c76d-46a2-bf01-4508a4bc7032)


Interactive fractal explorer that lets you explore the mesmerizing depths of the Mandelbrot and Julia sets. Built with modern JavaScript and WebGL, this app provides smooth animations and intuitive controls, allowing you to travel through intricate fractal landscapes with ease. Developed for the [Unmasking Chaos](https://open.substack.com/pub/synaptory/p/unmasking-chaos?r=2qbtpc&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false) article on my Substack blog.

> [!IMPORTANT]
**High-end GPU is recommended!**


### Live app is available [here](https://fractal.brnka.com).

## Features
- **Interactive Exploration:**
Explore the high resolution fractal plane via mouse, multi-touch gestures or keyboard. Fractals can be zoomed, panned, rotated and changed in real-time.

- **Smooth Animations:**
Enjoy smooth transitions with animations that dynamically interpolate between states.

- **Preset Views ad Dives:**
Instantly travel to a series of predefined fractal presets using dedicated buttons or enjoy animated dives into well selected intricate regions and watch them to evolve in real time. 

- **Responsive UI:**
Designed with both desktop and mobile users in mind, featuring touch-friendly controls and dynamic resizing.

- **Modern Development:**
Uses WebGL for rendering, ES6 for a modular codebase, and webpack for bundling and production optimization. Unit tests are implemented with Jest to ensure robust functionality.

- **Extensibility:**
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
- `npm run build` for production build (minified files, FTP deploy without maps using .env configuration)
- `npm run dev-nowatch` for local build without watch mode (incl. source maps)
- `npm run dev-watch` for local build with watch mode (incl. source maps)
- `npm run test` to run test suites
- `jsdoc -r ./src/ ./README.md -d ./doc/ ` to build documentation

## Changelog
### v1.8
- Fully asynchronous animations
- Improved controls (new hotkeys)
- Dev: Added full documentation
- Dev: Improved logging
- Bugs fixed:
  - URL presets with zero value params now work properly
  - Animation collisions are no longer happening
  - Normalized rotation
  - Keyboard controls now consider zoom depth and affect the properties proportionally

### v1.7
- Julia dives added (super smooth detailed animated c-transitions)
- Num hotkeys support for presets and dives
- Arrow hotkeys pan in Mandelbrot mode
- Bugs fixed:
  - Centering after resize

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
- `fractalRenderer.js`:
This module defines a fractalRenderer abstract class that encapsulates the WebGL code, including shader compilation, drawing, reset, and screenToFractal conversion. It also includes common animation methods.

- `mandelbrotRenderer.js`:
This module defines a MandelbrotRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Mandelbrot set fractal and sets preset zoom-ins.

- `juliaRenderer.js`:
  This module defines a JuliaRenderer class that inherits from fractalRenderer, implements the shader fragment code for the Julia set fractal and sets preset zoom-ins.

- `mouseEventHandlers.js`:
This module exports a function registerTouchEventHandlers that sets up all mouse events. It interacts directly with the fractalRenderer instance.

- `touchEventHandlers.js`:
This module exports a function registerTouchEventHandlers that sets up all touch events. It interacts directly with the fractalRenderer instance.

- `ui.js`:
Contains code to manage the UI (header interactions, buttons, infoText update, etc.).

- `utils.js`:
Contains helper functions for working with URL parameters, colors, etc.

- `main.js`:
The entry point that imports modules, creates the fractal renderer instance (passing the canvas ID), registers events, initializes the UI and the fractal.

## Controls:
### Mouse
- `Left Button Drag`: Pan
- `Right Button Drag`: Rotate
- `Wheel`: Zoom
- `Left Button Single Click`: Center & Generate URL link
- `Double click`: Zoom-in/out & Center
- `Middle Click`: Toggle guiding lines
### Keyboard
- `F11`: Toggle fullscreen
- `Enter`: Toggle controls
- `Q / W`: Rotate counter-clockwise/clockwise (Shift: Slower speed)
- `E`: Toggle guiding lines
- `Shift + R`: Reset
- `T`: Randomize color palette, (Shift: Cyclic color change, Alt: Reset colors)
- `Shift + S`: Take screenshot
- `Space`: Zoom-in (Ctrl: Zoom-out, Shift: Smoother step)
- `A`: Force resize
- `Left / Right`: Horizontal pan (Shift: Smoother step)
- `Up / Down`: Vertical pan (Shift: Smoother step)
- `Ctrl + Left / Right`: Julia: Real part (cx) stepping (Shift: Smoother step)
- `Ctrl + Up / Down`: Julia: Imaginary part (cy) stepping (Shift: Smoother step)
- `Num 1-9`: Load Preset (Shift: Start dive)

### Touch
- `One Finger Pan`: Pan
- `One Finger Tap`: Center & Generate URL link
- `One Finger Double-tap`: Zoom-in/out & Center
- `Pinch`: Pan & Zoom & Rotate

## License
MIT License. See for details.

*By Radim Brnka © 2025, Inspired by the intricate beauty of fractals, developed for interactive exploration and learning.*
