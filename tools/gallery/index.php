<?php
// index.php — Synaptory Fractal Gallery (PHP 8)
// Scans ./library, sorts images by last modification time (newest -> oldest).

$libraryFsPath = __DIR__ . DIRECTORY_SEPARATOR . 'library';
$libraryWebPath = 'library/'; // relative URL from this file

$allowedExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
$items = [];

if (is_dir($libraryFsPath) && is_readable($libraryFsPath)) {
    foreach (new DirectoryIterator($libraryFsPath) as $file) {
        if (!$file->isFile()) continue;

        $ext = strtolower($file->getExtension());
        if (!in_array($ext, $allowedExt, true)) continue;

        $items[] = [
            'name'  => $file->getFilename(),
            'mtime' => $file->getMTime(),
        ];
    }

    // Sort newest first by file modification time, tie-breaker: name descending
    usort($items, function($a, $b) {
        if ($a['mtime'] === $b['mtime']) {
            return strnatcasecmp($b['name'], $a['name']);
        }
        return $b['mtime'] <=> $a['mtime']; // descending
    });

    $images = array_map(fn($x) => $x['name'], $items);
} else {
    $images = [];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="author" content="Radim Brnka">
  <meta name="description" content="Synaptory Fractal Traveler Picture Gallery ">
  <meta property="og:title" content="Synaptory Fractal Traveler Gallery">
  <meta property="og:description" content="Gallery of fractals captured in Synaptory fractal gallery.">
  <meta property="og:image" content="img/icon.png">
  <meta name="theme-color" content="#000000">

  <title>Synaptory Fractal Gallery</title>

  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bruno+Ace+SC&display=swap" rel="stylesheet">

  <link rel="icon" href="img/icon.png" type="image/png">
  <link rel="apple-touch-icon" href="img/icon.png">


  <style>
    :root { --accent-color: rgba(180, 255, 106, 1); }

    @keyframes glow-pulse {
      from { text-shadow: 0 0 4px var(--accent-color), 0 0 12px var(--accent-color); }
      to   { text-shadow: 0 0 6px var(--accent-color), 0 0 18px var(--accent-color); }
    }

    .brand-font { font-family: "Bruno Ace SC", sans-serif; }

    h1.gallery-h1 {
      padding: 0;
      margin: 6px auto;
      color: var(--accent-color);
      z-index: 1000;
      font-family: "Bruno Ace SC", sans-serif;
      font-size: clamp(11pt, 4vw, 20pt);
      letter-spacing: 1px;
      font-style: italic;
      animation: glow-pulse 2s ease-in-out infinite alternate;
    }

    [x-cloak] { display: none !important; }
    .blur-bg { filter: blur(60px) brightness(0.4); transform: scale(1.1); }
    body { background-color: #050505; }
    .no-scroll { overflow: hidden; }
  </style>

  <script>
    // PHP -> JS
    window.GALLERY_LIBRARY_PATH = <?php echo json_encode($libraryWebPath, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
    window.GALLERY_IMAGES = <?php echo json_encode($images, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;

    document.addEventListener('alpine:init', () => {
        Alpine.data('galleryApp', () => ({
          open: false,
          activeImg: '',
          activeIndex: -1,
          zoomed: false,

          libraryPath: window.GALLERY_LIBRARY_PATH || 'library/',
          images: window.GALLERY_IMAGES || [],

          imgUrl(i) {
            if (i < 0 || i >= this.images.length) return '';
            return this.libraryPath + encodeURIComponent(this.images[i]);
          },

          showByIndex(i) {
            if (!this.images.length) return;
            if (i < 0) i = 0;
            if (i >= this.images.length) i = this.images.length - 1;

            this.activeIndex = i;
            this.activeImg = this.imgUrl(i);
            this.open = true;
            this.zoomed = false;              // reset on new image
            document.body.classList.add('no-scroll');
          },

          hide() {
            this.open = false;
            this.zoomed = false;              // reset on close
            document.body.classList.remove('no-scroll');
          },

          next() {
            if (!this.open || !this.images.length) return;
            const i = (this.activeIndex + 1) % this.images.length;
            this.showByIndex(i);
          },

          prev() {
            if (!this.open || !this.images.length) return;
            const i = (this.activeIndex - 1 + this.images.length) % this.images.length;
            this.showByIndex(i);
          },

          toggleZoom() {
            if (!this.open) return;
            this.zoomed = !this.zoomed;

            // optional: when switching back to fit, scroll to center nicely
            if (!this.zoomed) {
              this.$nextTick(() => {
                const el = document.getElementById('zoomContainer');
                if (el) {
                  el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
                  el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2;
                }
              });
            }
          },

          onKeydown(e) {
            if (!this.open) return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;

            if (e.key === 'Escape') {
              e.preventDefault();
              this.hide();
            } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
              e.preventDefault();
              this.next();
            } else if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'H') {
              e.preventDefault();
              this.prev();
            } else if (e.key === ' ' || e.key === 'Enter') {
              // Optional: space/enter toggles zoom
              e.preventDefault();
              this.toggleZoom();
            }
          }
        }));
    });
  </script>
</head>

<body class="text-zinc-400 font-sans selection:bg-indigo-500/30"
      x-data="galleryApp"
      @keydown.window="onKeydown($event)">

  <header class="px-4 py-2 sm:px-8 sm:py-3 md:px-12 md:py-4 border-b border-white/5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-4 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-40">
    <a href="https://fractal.brnka.com" class="min-w-0 no-underline hover:opacity-80 transition-opacity">
      <h1 class="gallery-h1">Synaptory Fractal Traveler</h1>
      <p class="brand-font text-[8pt] sm:text-[10pt] tracking-[0.18em] text-white italic uppercase mt-0.5 sm:mt-1">Gallery</p>
    </a>
    <div class="text-[12px] sm:text-[14px] font-mono text-zinc-400 border border-zinc-800 px-3 py-1 rounded-full uppercase self-start sm:self-auto shrink-0">
      <span x-text="images.length"></span> Images
    </div>
  </header>

  <main class="max-w-[1800px] mx-auto p-4 md:p-8">
    <template x-if="images.length === 0">
      <div class="text-center text-zinc-500 text-sm py-16">
        No images found in <span class="font-mono">./library/</span> (or the folder isn’t readable).
      </div>
    </template>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      <template x-for="(img, idx) in images" :key="img">
        <div class="group relative aspect-square bg-zinc-900 rounded-sm overflow-hidden cursor-pointer ring-1 ring-white/5 hover:ring-indigo-500/50 transition-all duration-500 shadow-lg"
             @click="showByIndex(idx)">

          <img :src="libraryPath + encodeURIComponent(img)"
               class="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
               loading="lazy"
               alt="">

          <div class="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-sm translate-y-full group-hover:translate-y-0 transition-transform">
            <p class="text-[9px] font-mono truncate text-zinc-300" x-text="img"></p>
          </div>
        </div>
      </template>
    </div>
  </main>

  <!-- Modal -->
  <div x-show="open"
       x-cloak
       x-transition.opacity.duration.200ms
       class="fixed inset-0 z-50 flex items-center justify-center bg-black"
       @click="hide()">

    <!-- Blurred background -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <img :src="activeImg" class="blur-bg w-full h-full object-cover opacity-60" alt="">
    </div>

    <!-- Left / Right buttons (unchanged) -->
    <!-- ... keep your prev/next buttons here ... -->

    <!-- Main image area -->
    <div class="relative z-10 w-full h-full p-4 md:p-12">
      <!-- Scroll container for "real size" mode -->
      <div id="zoomContainer"
           class="w-full h-full flex items-center justify-center"
           :class="zoomed ? 'overflow-auto' : 'overflow-hidden'">

        <img :src="activeImg"
             @click.stop="toggleZoom()"
             :class="zoomed
                ? 'max-w-none max-h-none object-none cursor-zoom-out'
                : 'max-w-full max-h-full object-contain cursor-zoom-in'"
             class="shadow-[0_0_100px_rgba(0,0,0,0.9)] select-none"
             alt="">
      </div>

      <!-- filename + hint -->
      <div class="mt-4 text-center" @click.stop>
        <div class="text-[10px] font-mono text-white/60" x-text="images[activeIndex] ?? ''"></div>
        <div class="text-[10px] tracking-widest uppercase text-white/25 mt-1">
          Click image: <span x-text="zoomed ? 'fit screen' : 'real size'"></span>
          • ←/H prev • →/L next • Esc close
        </div>
      </div>
    </div>

    <div class="absolute top-6 right-8 text-white/30 text-[10px] tracking-widest uppercase pointer-events-none">
      Click outside to close
    </div>
  </div>

</body>
</html>
