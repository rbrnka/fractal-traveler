<?php
    // index.php — Synaptory Fractal Gallery (PHP 8)
    // Reads ./library and builds an array of image filenames.

    $libraryFsPath = __DIR__ . DIRECTORY_SEPARATOR . 'library';
    $libraryWebPath = 'library/'; // relative URL from this file

    $allowedExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
    $images = [];

    if (is_dir($libraryFsPath) && is_readable($libraryFsPath)) {
        foreach (new DirectoryIterator($libraryFsPath) as $file) {
            if ($file->isFile()) {
                $ext = strtolower($file->getExtension());
                if (in_array($ext, $allowedExt, true)) {
                    $images[] = $file->getFilename();
                }
            }
        }
        // Natural-ish sort (fractal-2 before fractal-10)
        usort($images, fn($a, $b) => strnatcasecmp($a, $b));
    }
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Synaptory Fractal Gallery</title>

    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bruno+Ace+SC&display=swap" rel="stylesheet">

    <style>
        :root { --accent-color: #6366f1; }

        @keyframes glow-pulse {
            from { text-shadow: 0 0 4px var(--accent-color), 0 0 12px var(--accent-color); }
            to   { text-shadow: 0 0 6px var(--accent-color), 0 0 18px var(--accent-color); }
        }

        h1.gallery-h1 {
            padding: 0;
            margin: 6px auto;
            color: #fff;
            z-index: 1000;
            font-family: "Bruno Ace SC", sans-serif;
            font-size: 12pt;
            letter-spacing: 1px;
            font-style: italic;
            white-space: nowrap;
            animation: glow-pulse 2s ease-in-out infinite alternate;
        }

        [x-cloak] { display: none !important; }
        .blur-bg { filter: blur(60px) brightness(0.4); transform: scale(1.1); }
        body { background-color: #050505; }
        .no-scroll { overflow: hidden; }
    </style>

    <script>
        window.GALLERY_LIBRARY_PATH = <?php echo json_encode($libraryWebPath, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
        window.GALLERY_IMAGES = <?php echo json_encode($images, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;

        document.addEventListener('alpine:init', () => {
            Alpine.data('galleryApp', () => ({
                open: false,
                activeImg: '',
                libraryPath: window.GALLERY_LIBRARY_PATH || 'library/',
                images: window.GALLERY_IMAGES || [],

                show(img) {
                    this.activeImg = this.libraryPath + encodeURIComponent(img);
                    this.open = true;
                    document.body.classList.add('no-scroll');
                },

                hide() {
                    this.open = false;
                    document.body.classList.remove('no-scroll');
                }
            }));
        });
    </script>
</head>

<body class="text-zinc-400 font-sans selection:bg-indigo-500/30" x-data="galleryApp">

<header class="p-8 md:p-12 border-b border-white/5 flex justify-between items-end bg-zinc-950/50 backdrop-blur-md sticky top-0 z-40">
    <div>
        <h1 class="gallery-h1">Synaptory Fractal Traveler</h1>
        <p class="text-[10px] tracking-[0.4em] text-indigo-400 uppercase mt-2">Gallery</p>
    </div>
    <div class="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-3 py-1 rounded-full uppercase">
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
        <template x-for="img in images" :key="img">
            <div class="group relative aspect-square bg-zinc-900 rounded-sm overflow-hidden cursor-pointer ring-1 ring-white/5 hover:ring-indigo-500/50 transition-all duration-500 shadow-lg"
                 @click="show(img)">

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
     x-transition.opacity.duration.400ms
     @keydown.escape.window="hide()"
     class="fixed inset-0 z-50 flex items-center justify-center bg-black"
     @click="hide()">

    <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <img :src="activeImg" class="blur-bg w-full h-full object-cover opacity-60" alt="">
    </div>

    <div class="relative z-10 w-full h-full flex items-center justify-center p-4 md:p-12">
        <img :src="activeImg"
             class="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.9)] transition-transform duration-300"
             @click.stop
             alt="">
    </div>

    <div class="absolute top-6 right-8 text-white/30 text-[10px] tracking-widest uppercase pointer-events-none">
        Click anywhere to close
    </div>
</div>

</body>
</html>
