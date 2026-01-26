 <h1 align="center"><img width="1080" height="110" alt="image" src="https://github.com/user-attachments/assets/d22da54b-adc4-4fcf-882e-8d7bd2187661" /></h1>

<p align="center">
  <a href="https://fractal.brnka.com/" title="Open the live app">
   <img width="1376" height="524" alt="image" src="https://github.com/user-attachments/assets/471e02df-2c16-473a-ae03-ed60a097847f" />
  </a>
</p>
<p align="center">
  A real-time Mandelbrot & Julia explorer built with modern JavaScript + WebGL.<br/>
  Smooth deep-zoom navigation, palette play, curated presets, and animated “dives”.
</p>

<p align="center">
  <a href="https://fractal.brnka.com/">Live App</a> ·
  <a href="https://synaptory.substack.com/p/unmasking-chaos">Article: Unmasking Chaos</a> ·
  <a href="https://github.com/rbrnka/fractal-traveler/wiki/Controls">Controls</a> ·
  <a href="https://fractal.brnka.com/docs/">Docs</a> ·
  <a href="https://fractal.brnka.com/archive">Archive of older versions</a> ·  
  <a href="https://fractal.brnka.com/editor">Palette editor</a>  
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

**Synaptory Fractal Traveler** is an interactive exploration and learning experience for the **Mandelbrot set** and its 
companion **Julia sets**. It renders on the GPU (WebGL) and is designed around one simple goal:

> Make the beauty of “fractal travel” available for everyone to enjoy. 

You can zoom, pan, rotate, recolor, take screenshots, share coordinates/links, and jump through curated presets that highlight the set’s interesting locations.

Read more in [Wiki](https://github.com/rbrnka/fractal-traveler/wiki).

---

## Features

- **Modern & responsive UI** optimized for 60 FPS experience in wide range of devices, including mobile.
- **Double-double precision fractal rendering** (~1e-15 regular zoom, up to ~1e-35 in Re=0 locations)
- **Mandelbrot + Julia modes** with fast switching, optional relative switching, and live Julia preview
- **Real-time exploration**: zoom / pan / rotate with mouse, keyboard, or touch
- **Views & Dives**
    - Views: instant jumps to interesting locations
    - Dives: looped animated “tours” (Julia-only)
- **Demo**: Automatic vacation plan for you to sit back and enjoy guided tour through the fractal world.
- **Palette support**
    - Several attractive palettes for you to choose from
    - Recolor / theme switching
    - Optional cyclic palette animation
    - Palette editor is available in case you want to create your own
- **Shareable exploration**
    - Generate a link and share
    - Copy exact coordinates to clipboard
    - Save your favorite locations locally
- **Rich controls**
   - Use one hand, a keyboard, or both at the same time to fully control the entire experience.
- **Utilities**
  - Clean screenshots without UI (with watermark coordinates)
  - Optional debug panel / guides
- **Development Support**
  - npm packaged
  - Ready for local deployment and experimentation
  - Palette editor available

Check out the latest [release notes](https://github.com/rbrnka/fractal-traveler/releases/tag/2.0).

---

## Try it now

Live app: **https://fractal.brnka.com/**

If you find something beautiful:
1. Hit `Shift+S` for a clean screenshot.
2. Hit `Alt+S`to save it locally.
3. Hit `C` to copy coordinates and share it in the discussion (or anywhere you like).

