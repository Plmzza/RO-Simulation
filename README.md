# RO-Simulation

Ragnarok Online simulators and calculators that run entirely in the browser (HTML5 Canvas + vanilla JavaScript ES Modules, no backend).

**Live site:** https://plmzza.github.io/RO-Simulation/

| Tool | Path | Status |
|---|---|---|
| Costume Simulator | [`costume/`](costume/) | Available |
| RO Simulator | [`sim/`](sim/) | Available |

---

## Costume Simulator

### Features

- **Pure Client-Side Rendering**: Operates entirely in the browser using HTML5 Canvas 2D without requiring any server-side rendering engines.
- **Full Character Customization**:
  - **78 Job Classes**: Comprehensive support for 1st, 2nd, Transcendent, 3rd, and 4th job classes, plus Doram.
  - **Alternative Outfits (Second Costume)**: One-click outfit switching.
  - **Job Mounts**: Support for Mount classes (Peco, Dragon, Gryphon, Madogear, etc.).
  - **Gender Selection**: Male and female character sprites.
  - **Hairstyles & Dyes**: 45 hairstyles with customizable hair colors and outfit dye palettes.
  - **Costumes & Headgears**: Upper, Middle, Lower headgear slots and Garment (Robe) equipment.
- **Animation & Motion Control**:
  - **Actions**: Stand, Sit, Walk, Ready (Combat Stance), Attack 1, Attack 2, Attack 3.
  - **Direction**: Full 8-directional rotation.
  - **Head Direction**: Turn head (Straight, Right, Left) in Stand and Sit stances.
  - **Playback Controls**: Scrub frame slider, Play/Pause, speed adjustment (0.5x, 0.75x, 1x, 1.25x, 1.5x).
  - **Export**: Instant PNG image capture of current character pose.
- **Optimized Performance**:
  - Client-side streaming decompression for high performance.
  - Fast asset caching and layer priority ordering.

---

### Architecture & Source Code

The project is structured into modular JavaScript components located in `costume/src/`:

- **`costume/src/composer.js`**: Core character sprite composer. Combines body, head, hair, headgears, and garments with accurate anchor offsets and z-index layer ordering.
- **`costume/src/spr.js`**: Parser for sprite (`.spr`) files (Indexed color and RGBA frames).
- **`costume/src/act.js`**: Parser for action (`.act`) files (Frame definitions, anchor coordinates, and animation timing).
- **`costume/src/pal.js`**: Palette (`.pal`) reader for 256-color palette swapping (hair & body dyes).
- **`costume/src/imf.js`**: Layer priority rules resolver.
- **`costume/src/loader.js`**: Memory-cached asset loader.
- **`costume/src/resolver.js`**: Maps job IDs, item IDs, and equipment slots to asset paths.

---

#### Files

```text
costume/
├── index.html         # Costume Simulator page
├── src/               # ES Modules rendering engine (vendor/fzstd.js for packed sprites)
├── assets/            # Compressed sprite assets (assets/rp = packed garment sprites)
├── thumbs/            # Equipment preview thumbnails
├── manifest.json      # Game path -> asset file mapping
├── resolver.json      # Job and equipment definition tables
└── sim-data.json      # Costume and color palette database
```

---

## Repository Layout

```text
├── index.html         # Landing page that links to every tool
├── costume/           # Costume Simulator
├── sim/               # RO Simulator
└── .nojekyll          # Serve files as-is on GitHub Pages
```

New tools go in their own folder (for example `newtool/`) and get a card on the landing page.

---

## Disclaimer & License

Ragnarok Online is a trademark of Gravity Co., Ltd. All game sprites, artwork and related assets in `costume/assets/` and `costume/thumbs/` are © Gravity Co., Ltd. and their licensors, and are used here for non-commercial fan purposes only.

This is a non-commercial fan project. It is not affiliated with, endorsed by or sponsored by Gravity Co., Ltd. If you are a rights holder and want any content removed, please open an issue.

`costume/src/vendor/fzstd.js` is © Arjun Barrett, MIT License (see `costume/src/vendor/fzstd.LICENSE`). The rest of the source code is provided for community educational and simulation purposes.
