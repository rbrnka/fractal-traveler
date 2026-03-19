 <h1 align="center"><img width="829" height="84" alt="image" src="https://github.com/user-attachments/assets/f7403a8c-304e-4996-8aae-a68412b19f63" /></h1>


<p align="center">
  <a href="https://fractal.brnka.com/" title="Open the live app">
   <img width="1376" height="524" alt="image" src="https://github.com/user-attachments/assets/471e02df-2c16-473a-ae03-ed60a097847f" />
  </a>
</p>
<p align="center">
  A real-time chaos explorer built with modern JavaScript + WebGL.<br/>
  Smooth deep-zoom navigation, palette play, curated presets, animated dives and tours.
</p>

<p align="center">
  🎮 <a href="https://fractal.brnka.com/">Live App</a> ·
  📜 <a href="https://synaptory.substack.com/p/unmasking-chaos">Article: Unmasking Chaos</a> ·
  ⌨️ <a href="https://github.com/rbrnka/fractal-traveler/wiki/Controls">Controls</a> ·
  🖼️ <a href="https://fractal.brnka.com/gallery/">Gallery</a> ·
  📖 <a href="https://fractal.brnka.com/docs/">Docs</a> ·
  🗃️ <a href="https://fractal.brnka.com/archive">Archive of older versions</a> ·  
  🎨 <a href="https://fractal.brnka.com/editor">Palette editor</a>  
</p>

---
<p align="center">
  <img alt="GitHub release" src="https://img.shields.io/github/v/release/rbrnka/fractal-traveler" />
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/rbrnka/fractal-traveler" />
  <img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/rbrnka/fractal-traveler" />
</p>

> [!IMPORTANT]
> This is GPU-first, real-time rendering. A high-end GPU is strongly recommended for the best experience (optimal: RTX 3070 or equivalent)

---

## About

**Synaptory Chaos Explorer** is an interactive exploration and learning experience for the **Mandelbrot set**, its
companion **Julia sets**, the **Riemann Zeta function**, and the **Rössler Attractor**. It is designed around one simple goal:

> Make the beauty of chaos and fractal travel available for everyone to enjoy. 

You can zoom, pan, rotate, recolor, take screenshots, share coordinates/links, and jump through curated presets that highlight interesting locations.

Read more in [Wiki](https://github.com/rbrnka/fractal-traveler/wiki).

---

## Features

- **Modern & responsive UI** optimized for 60 FPS experience on a wide range of devices, including mobile.
- **Double-double precision rendering** (~10⁻¹⁵ regular zoom, up to ~10⁻³⁵ in Re=0 locations)
- **Real-time exploration**: zoom, pan, and rotate with mouse, keyboard, or touch
- **Demo/Tour mode**: Sit back and enjoy a guided tour through the fractal world
- **Palette support**: Multiple color schemes with optional cyclic animation
- **Shareable exploration**: Generate links, copy coordinates, save favorite views locally
- **Controls**: Mouse, keyboard, and touch — see [full controls reference](https://github.com/rbrnka/fractal-traveler/wiki/Controls)
- **Screenshots**: Clean exports with watermark coordinates

### Fractal Modes

#### Mandelbrot Set
- Deep zoom exploration with double-double precision (up to ~10⁻³⁵)
- Two rendering modes: Perturbation and Series Approximation
- Curated views highlighting interesting locations

#### Julia Sets
- Interactive C parameter control via sliders
- Live Julia preview on middle-click in Mandelbrot mode
- Animated "dives" through c-parameter space

#### Riemann Zeta Function
- Domain coloring visualization with multiple shader modes
- Zero Tour: animated journey through critical line zeros
- Mathematical annotations (trivial zeros, pole, Basel Problem, Apéry's constant, etc.)

#### Rössler Attractor
- 3D chaotic system visualization
- Adjustable parameters (a, b, c coefficients)
- Phase space exploration

Check out the latest [release notes](https://github.com/rbrnka/fractal-traveler/releases).

---

## Try it now

Live app: **https://fractal.brnka.com/**

If you find something beautiful:
1. Hit `C` for a clean screenshot.
2. Hit `S`to save it locally.
3. Hit `D` to copy coordinates and share it in the discussion (or anywhere you like).

or fork and deploy your own instance.

