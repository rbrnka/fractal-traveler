# Synaptory Fractal Traveler
![Release](https://img.shields.io/github/v/release/rbrnka/fractal-traveler)
![Status](https://img.shields.io/badge/Status-stable-darkgreen)
![https://github.com/rbrnka/fractal-traveler?tab=MIT-1-ov-file](https://img.shields.io/github/license/rbrnka/fractal-traveler)
![GitHub Release Date](https://img.shields.io/github/release-date/rbrnka/fractal-traveler)

![fractal-2025-12-14_23-12-50](https://github.com/user-attachments/assets/9bc0e53e-a084-4284-812f-64747bf74323)


Interactive fractal explorer that lets you explore the mesmerizing depths of the Mandelbrot and Julia sets. Built with modern JavaScript and WebGL, this app provides smooth animations and intuitive controls, allowing you to travel through intricate fractal landscapes with ease. Developed for the [Unmasking Chaos](https://open.substack.com/pub/synaptory/p/unmasking-chaos?r=2qbtpc&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false) article on my Substack blog.

> [!IMPORTANT]
**High-end GPU is recommended!**

### Live app is available [here](https://fractal.brnka.com).

---
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
---
## Controls
### Buttons
- `Mandelbrot/Julia`: Switches between Mandelbrot and Julia fractals. When pressed with Shift, the fractal variables are persisted so you can see the equivalent sets. (Same as the `Z`)
- `Presets`: Pre-programmed interesting zooms for you to explore (`Num 0-9`)
- `Dives`: Pre-programmed interesting animated loops in Julia set for you to explore (`Shift+Num 0-9`)
- `cx/cy`: Sliders to adjust the C value in Julia set (`Alt+Arrows`)
- `Reset`: Resets current fractal to default view (`Shift+R`)
- `Recolor`: Randomizes color palette (Mandelbrot mode) / Switches color palette to the next predefined theme (Julia mode) (`T`)
- `Screenshot`: Takes screenshot of the canvas without the controls. Includes watermark of the current coordinates. (`Shift+S`)
- `Demo/Stop`: Enables demo mode / Stops current animation (`D`) 
- `Bottom bar click`: Copy current coordinates to clipboard

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
- `Space`: Zoom-in (Option/Ctrl: Zoom-out, Shift: Smoother step)
- `A`: Force resize
- `Z`: Switch fractals with persisting params (Shows respective fractal counterpart). Julia `c` translates to Mandelbrot `p` and vice versa. (CTRL + Switch Fractal Mode Button has the same effect)
- `Left / Right`: Horizontal pan (Shift: Smoother step)
- `Up / Down`: Vertical pan (Shift: Smoother step)
- `Alt + Left / Right`: Julia: Real part (cx) stepping (Shift: Smoother step)
- `Alt + Up / Down`: Julia: Imaginary part (cy) stepping (Shift: Smoother step)
- `Num 1-9`: Load Preset (Shift: Start dive in Julia mode)
### Touch
- `One Finger Pan`: Pan
- `One Finger Tap`: Center & Generate URL link
- `One Finger Double-tap`: Zoom-in/out & Center
- `Pinch`: Pan & Zoom & Rotate

---
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

---
## Documentation
Available [here](https://fractal.brnka.com/docs).

---
## Changelog
![GitHub package.json version](https://img.shields.io/github/package-json/v/rbrnka/fractal-traveler)
![GitHub commit activity](https://img.shields.io/github/commit-activity/t/rbrnka/fractal-traveler)
### v1.8
- Fully asynchronous animations
- Improved controls (new hotkeys)
- Allows switching between Mandelbrot and Julia sets matching each other
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

---
*By Radim Brnka © 2025, Inspired by the intricate beauty of fractals, developed for interactive exploration and learning.*
