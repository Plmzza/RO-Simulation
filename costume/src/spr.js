import { Palette } from './pal.js';

export class SprImage {
  /**
   * @param {number} type 0 = indexed, 1 = rgba
   * @param {number} width
   * @param {number} height
   * @param {Uint8Array} [rawIndices]
   * @param {Uint8ClampedArray} [rawRgba]
   */
  constructor(type, width, height, rawIndices = null, rawRgba = null) {
    this.type = type;
    this.width = width;
    this.height = height;
    this.rawIndices = rawIndices;
    this.rawRgba = rawRgba;
    this._cache = new Map(); // cache by palette reference / hash
  }

  /**
   * Render this image to an RGBA Uint8ClampedArray
   * @param {Palette} [palette]
   * @returns {Uint8ClampedArray} length width * height * 4
   */
  getPixels(palette = null) {
    if (this.type === 1) {
      return this.rawRgba;
    }

    if (!palette) {
      throw new Error('Palette required to render indexed sprite');
    }

    const cached = this._cache.get(palette);
    if (cached) return cached;

    const total = this.width * this.height;
    const rgba = new Uint8ClampedArray(total * 4);
    const palData = palette.data;
    const indices = this.rawIndices;

    for (let i = 0; i < total; i++) {
      const palId = indices[i];
      const out = i * 4;
      if (palId === 0) {
        rgba[out] = 0;
        rgba[out + 1] = 0;
        rgba[out + 2] = 0;
        rgba[out + 3] = 0;
      } else {
        const pOff = palId * 4;
        rgba[out] = palData[pOff];
        rgba[out + 1] = palData[pOff + 1];
        rgba[out + 2] = palData[pOff + 2];
        rgba[out + 3] = 255;
      }
    }

    this._cache.set(palette, rgba);
    return rgba;
  }

  /**
   * Returns an ImageData instance (or object with width, height, data in non-DOM environments)
   * @param {Palette} [palette]
   * @returns {ImageData|{width: number, height: number, data: Uint8ClampedArray}}
   */
  getImageData(palette = null) {
    const pixels = this.getPixels(palette);
    if (typeof ImageData !== 'undefined') {
      return new ImageData(pixels, this.width, this.height);
    }
    return { width: this.width, height: this.height, data: pixels };
  }

  /**
   * Returns an HTMLCanvasElement with this sub-image drawn onto it (cached per palette)
   * @param {Palette} [palette]
   * @returns {HTMLCanvasElement|null}
   */
  toCanvas(palette = null) {
    if (typeof document === 'undefined') return null;
    if (!this._canvasCache) this._canvasCache = new Map();

    const cacheKey = this.type === 1 ? 'rgba' : palette;
    const cached = this._canvasCache.get(cacheKey);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    const imgData = this.getImageData(palette);
    ctx.putImageData(imgData, 0, 0);

    this._canvasCache.set(cacheKey, canvas);
    return canvas;
  }
}

export class SprFile {
  /**
   * @param {ArrayBuffer|Uint8Array} buffer
   */
  constructor(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.length < 8) {
      throw new Error(`SPR file too small: ${bytes.length} bytes`);
    }

    // Header signature 'SP'
    const sig0 = bytes[0];
    const sig1 = bytes[1];
    if (sig0 !== 0x53 || sig1 !== 0x50) {
      throw new Error(`Invalid SPR signature: ${String.fromCharCode(sig0, sig1)}`);
    }

    // Version uint16 LE (e.g. 0x0201 -> 2.1)
    this.version = view.getUint16(2, true);
    this.majorVersion = bytes[3];
    this.minorVersion = bytes[2];
    this.versionStr = `${this.majorVersion}.${this.minorVersion}`;

    const palCount = view.getUint16(4, true);
    let rgbaCount = 0;
    if (this.version >= 0x0200) {
      rgbaCount = view.getUint16(6, true);
    }

    // Palette is the last 1024 bytes
    if (bytes.length < 1024) {
      throw new Error(`SPR file too small for palette: ${bytes.length} bytes`);
    }
    const palOffset = bytes.length - 1024;
    this.palette = new Palette(bytes.subarray(palOffset));

    this.palImages = [];
    this.rgbaImages = [];

    let offset = this.version >= 0x0200 ? 8 : 6;

    // Read indexed images
    for (let i = 0; i < palCount; i++) {
      if (offset + 4 > palOffset) {
        throw new Error(`SPR truncated while reading indexed image ${i}`);
      }
      const width = view.getUint16(offset, true);
      const height = view.getUint16(offset + 2, true);
      offset += 4;

      const totalPixels = width * height;
      const rawIndices = new Uint8Array(totalPixels);

      if (this.version >= 0x0201) {
        if (offset + 2 > palOffset) {
          throw new Error(`SPR truncated while reading RLE size for image ${i}`);
        }
        const encSize = view.getUint16(offset, true);
        offset += 2;

        if (offset + encSize > palOffset) {
          throw new Error(`SPR truncated while reading RLE data for image ${i}`);
        }

        let p = 0;
        let outIdx = 0;
        while (p < encSize && outIdx < totalPixels) {
          const palId = bytes[offset + p++];
          if (palId === 0) {
            const runLen = bytes[offset + p++];
            // Fill runLen pixels with 0 (already 0 in new Uint8Array, but advance outIdx)
            outIdx += runLen;
          } else {
            rawIndices[outIdx++] = palId;
          }
        }
        offset += encSize;
      } else {
        // Uncompressed 8-bit indexed
        if (offset + totalPixels > palOffset) {
          throw new Error(`SPR truncated while reading uncompressed image ${i}`);
        }
        rawIndices.set(bytes.subarray(offset, offset + totalPixels));
        offset += totalPixels;
      }

      this.palImages.push(new SprImage(0, width, height, rawIndices, null));
    }

    // Read RGBA images
    if (this.version >= 0x0200) {
      for (let i = 0; i < rgbaCount; i++) {
        if (offset + 4 > palOffset) {
          throw new Error(`SPR truncated while reading RGBA image ${i}`);
        }
        const width = view.getUint16(offset, true);
        const height = view.getUint16(offset + 2, true);
        offset += 4;

        const totalPixels = width * height;
        const totalBytes = totalPixels * 4;
        if (offset + totalBytes > palOffset) {
          throw new Error(`SPR truncated while reading RGBA data for image ${i}`);
        }

        // Stored bottom-to-top as [A, B, G, R]
        const rawRgba = new Uint8ClampedArray(totalBytes);
        for (let y = 0; y < height; y++) {
          const srcY = height - 1 - y;
          for (let x = 0; x < width; x++) {
            const srcIdx = offset + (srcY * width + x) * 4;
            const destIdx = (y * width + x) * 4;
            rawRgba[destIdx + 0] = bytes[srcIdx + 3]; // R
            rawRgba[destIdx + 1] = bytes[srcIdx + 2]; // G
            rawRgba[destIdx + 2] = bytes[srcIdx + 1]; // B
            rawRgba[destIdx + 3] = bytes[srcIdx + 0]; // A
          }
        }
        offset += totalBytes;

        this.rgbaImages.push(new SprImage(1, width, height, null, rawRgba));
      }
    }
  }

  /**
   * Get image by index and sprite type (0 = indexed, 1 = rgba)
   * @param {number} sprId
   * @param {number} [sprType=0]
   * @returns {SprImage|null}
   */
  getImage(sprId, sprType = 0) {
    if (sprType === 0) {
      return this.palImages[sprId] || null;
    } else if (sprType === 1) {
      return this.rgbaImages[sprId] || null;
    }
    return null;
  }
}
