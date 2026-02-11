# Riemann Tour Audio

Place a music file here named `riemann-tour.mp3`.

## Requirements
- Format: MP3
- Filename: `riemann-tour.mp3`
- Duration: 3-10 minutes (will loop automatically)
- Style: Ambient/atmospheric (space, mathematical, contemplative)

## Recommended Sources (Royalty-Free)
- [Freesound.org](https://freesound.org) - Search "ambient atmospheric" or "space ambient"
- [Pixabay Music](https://pixabay.com/music/) - Free for commercial use
- [Free Music Archive](https://freemusicarchive.org/) - CC-licensed tracks
- [YouTube Audio Library](https://studio.youtube.com/channel/UC/music) - Royalty-free

## Feature Flag
The music is controlled by `FF_RIEMANN_TOUR_MUSIC` in `src/global/constants.js`.
Set to `false` to disable the feature.

## Behavior
- Fades in when the Riemann tour starts
- Loops continuously during the tour
- Fades out when the tour ends or is interrupted
