/**
 * RO Palette (.pal) Parser
 * 256 colors x 4 bytes (RGBA) = 1024 bytes.
 */
export class Palette {
  /**
   * @param {ArrayBuffer|Uint8Array} buffer
   */
  constructor(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 1024) {
      throw new Error(`Invalid PAL data: expected at least 1024 bytes, got ${bytes.length}`);
    }
    // Copy the 1024 bytes
    this.data = new Uint8Array(bytes.slice(0, 1024));
  }

  /**
   * Get RGBA color for palette index (0..255).
   * Note: Index 0 is always transparent in RO sprites.
   * @param {number} index
   * @returns {[number, number, number, number]} [r, g, b, a]
   */
  getColor(index) {
    if (index < 0 || index >= 256) return [0, 0, 0, 0];
    const off = index * 4;
    return [
      this.data[off],
      this.data[off + 1],
      this.data[off + 2],
      index === 0 ? 0 : 255
    ];
  }

  /**
   * Returns a copy of the 1024-byte raw buffer
   * @returns {Uint8Array}
   */
  cloneData() {
    return new Uint8Array(this.data);
  }
}
