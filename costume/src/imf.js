/**
 * RO IMF File Parser (ES Module)
 * IMF defines per-frame layer priority (e.g. head in front or behind body)
 */

export class ImfFile {
  /**
   * @param {ArrayBuffer} arrayBuffer
   */
  constructor(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    let offset = 8; // skip ver (4) + checksum (4)
    const maxLayer = view.getUint32(offset, true);
    offset += 4;

    this.data = [];
    for (let l = 0; l <= maxLayer; l++) {
      const numActions = view.getUint32(offset, true);
      offset += 4;
      this.data[l] = [];
      for (let a = 0; a < numActions; a++) {
        const numFrames = view.getUint32(offset, true);
        offset += 4;
        this.data[l][a] = new Int32Array(numFrames);
        for (let f = 0; f < numFrames; f++) {
          this.data[l][a][f] = view.getInt32(offset, true);
          offset += 12; // priority (4) + cx (4) + cy (4)
        }
      }
    }
  }

  /**
   * Get layer priority for a specific action and frame
   * @param {number} layer 1 = head
   * @param {number} action
   * @param {number} frame
   * @returns {number} 0 = in front of body, 1 = behind body
   */
  getPriority(layer, action, frame) {
    if (!this.data[layer] || !this.data[layer][action]) return 0;
    return this.data[layer][action][frame] ?? 0;
  }
}
