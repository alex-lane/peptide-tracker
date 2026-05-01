# Icons

`icon.svg` and `maskable.svg` are referenced from the PWA manifest and
`<link rel="icon">`. Modern browsers (Chrome / Edge / Firefox / Safari ≥ 16)
accept SVG manifest icons.

## Why also a PNG?

iOS Safari ignores SVG `apple-touch-icon` and falls back to a screenshot of
the page when the user does **Add to Home Screen**. For a clean home-screen
icon on iOS, generate a 180×180 PNG and drop it at:

```
public/icons/apple-touch-icon-180.png
```

`index.html` already has the `<link rel="apple-touch-icon" href="/icons/icon.svg">`;
when you add the PNG, change the `href` to `/icons/apple-touch-icon-180.png`.

## How to generate

The simplest path:

1. Open `icon.svg` in any vector editor (Figma, Inkscape, Affinity).
2. Export as PNG at 180×180 with the dark `#1C1A17` background filling
   the whole canvas (no transparent corners — iOS clips to its own mask).
3. Save as `apple-touch-icon-180.png` in this directory.

Or run `npx @vite-pwa/assets-generator` against `icon.svg` if you'd rather
auto-generate the full PNG icon set (192/512/maskable/apple-touch).
