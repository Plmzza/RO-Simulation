export class ActSprite {
  constructor(data) {
    this.x = data.x;
    this.y = data.y;
    this.sprId = data.sprId;
    this.flags = data.flags;
    this.mirror = (data.flags & 1) !== 0;
    this.tint = data.tint; // [r, g, b, a]
    this.xScale = data.xScale;
    this.yScale = data.yScale;
    this.rotation = data.rotation; // in degrees
    this.sprType = data.sprType;   // 0 = indexed, 1 = rgba
    this.width = data.width || 0;
    this.height = data.height || 0;
  }
}

export class ActAttachPoint {
  constructor(x, y, attr) {
    this.x = x;
    this.y = y;
    this.attr = attr;
  }
}

export class ActFrame {
  constructor(sprites = [], eventId = -1, attachPoints = []) {
    this.sprites = sprites;
    this.eventId = eventId;
    this.attachPoints = attachPoints;
  }
}

export class ActAction {
  constructor(frames = [], interval = 4.0) {
    this.frames = frames;
    this.interval = interval;
  }

  get delayMs() {
    return this.interval * 25.0;
  }
}

export class ActFile {
  /**
   * @param {ArrayBuffer|Uint8Array} buffer
   */
  constructor(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.length < 16) {
      throw new Error(`ACT file too small: ${bytes.length} bytes`);
    }

    const sig0 = bytes[0];
    const sig1 = bytes[1];
    if (sig0 !== 0x41 || sig1 !== 0x43) {
      throw new Error(`Invalid ACT signature: ${String.fromCharCode(sig0, sig1)}`);
    }

    this.version = view.getUint16(2, true);
    this.majorVersion = bytes[3];
    this.minorVersion = bytes[2];
    this.versionStr = `${this.majorVersion}.${this.minorVersion}`;

    const actionCount = view.getUint16(4, true);
    let offset = 16; // 2 sig + 2 ver + 2 actions + 10 reserved

    this.actions = [];

    // Parse Actions
    for (let a = 0; a < actionCount; a++) {
      if (offset + 4 > bytes.length) {
        throw new Error(`ACT truncated at action ${a} header`);
      }
      const frameCount = view.getUint32(offset, true);
      offset += 4;

      const frames = [];
      for (let f = 0; f < frameCount; f++) {
        // Skip 32 bytes (attackRange & fitRange: 8 * int32)
        offset += 32;

        if (offset + 4 > bytes.length) {
          throw new Error(`ACT truncated at action ${a} frame ${f} sprite count`);
        }
        const spriteCount = view.getUint32(offset, true);
        offset += 4;

        const sprites = [];
        for (let s = 0; s < spriteCount; s++) {
          const x = view.getInt32(offset, true);
          const y = view.getInt32(offset + 4, true);
          const sprId = view.getInt32(offset + 8, true);
          const flags = view.getUint32(offset + 12, true);
          offset += 16;

          const tint = [
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3]
          ];
          offset += 4;

          const xScale = view.getFloat32(offset, true);
          offset += 4;

          let yScale = xScale;
          if (this.version >= 0x0204) {
            yScale = view.getFloat32(offset, true);
            offset += 4;
          }

          const rotation = view.getInt32(offset, true);
          const sprType = view.getInt32(offset + 4, true);
          offset += 8;

          let width = 0;
          let height = 0;
          if (this.version >= 0x0205) {
            width = view.getInt32(offset, true);
            height = view.getInt32(offset + 4, true);
            offset += 8;
          }

          sprites.push(new ActSprite({
            x, y, sprId, flags, tint, xScale, yScale, rotation, sprType, width, height
          }));
        }

        let eventId = -1;
        const attachPoints = [];

        if (this.version >= 0x0200) {
          if (offset + 4 <= bytes.length) {
            eventId = view.getInt32(offset, true);
            offset += 4;
          }

          if (this.version >= 0x0203 && offset + 4 <= bytes.length) {
            const attachCount = view.getUint32(offset, true);
            offset += 4;

            for (let ap = 0; ap < attachCount; ap++) {
              offset += 4; // skip reserved 4 bytes
              const ax = view.getInt32(offset, true);
              const ay = view.getInt32(offset + 4, true);
              const attr = view.getInt32(offset + 8, true);
              offset += 12;
              attachPoints.push(new ActAttachPoint(ax, ay, attr));
            }
          }
        }

        frames.push(new ActFrame(sprites, eventId, attachPoints));
      }

      this.actions.push(new ActAction(frames, 4.0));
    }

    // Parse Events (v2.1+)
    this.events = [];
    if (this.version >= 0x0201 && offset + 4 <= bytes.length) {
      const eventCount = view.getUint32(offset, true);
      offset += 4;

      const textDecoder = new TextDecoder('ascii');
      for (let e = 0; e < eventCount; e++) {
        if (offset + 40 > bytes.length) break;
        const eventBytes = bytes.subarray(offset, offset + 40);
        let nullIdx = eventBytes.indexOf(0);
        if (nullIdx === -1) nullIdx = 40;
        this.events.push(textDecoder.decode(eventBytes.subarray(0, nullIdx)));
        offset += 40;
      }
    }

    // Parse Delays / Intervals per Action (v2.2+)
    if (this.version >= 0x0202 && offset + (actionCount * 4) <= bytes.length) {
      for (let a = 0; a < actionCount; a++) {
        this.actions[a].interval = view.getFloat32(offset, true);
        offset += 4;
      }
    }
  }

  getAction(actionIndex) {
    return this.actions[actionIndex] || null;
  }

  getFrame(actionIndex, frameIndex) {
    const action = this.actions[actionIndex];
    if (!action) return null;
    return action.frames[frameIndex] || null;
  }
}
