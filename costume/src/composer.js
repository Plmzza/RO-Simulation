/**
 * RO Character Sprite Composer
 * Pure JavaScript ES Module to compose and render RO characters to HTML5 Canvas
 */

// Helper: Round away from zero (matching D std.math.round)
function roundAway(x) {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

// Convert client headdir (0: straight, 1: right, 2: left) to ACT frame index (0: straight, 1: frame 2, 2: frame 1)
function getHeadActFrame(headdir) {
  if (headdir === 1) return 2; // right
  if (headdir === 2) return 1; // left
  return 0; // straight
}

function isStandOrSit(action) {
  const motion = Math.floor(action / 8);
  return motion === 0 || motion === 2; // 0 = Stand, 2 = Sit
}

export class CharacterComposer {
  /**
   * @param {Object} [options]
   * @param {number} [options.canvasWidth=220]
   * @param {number} [options.canvasHeight=220]
   * @param {number} [options.originX=110]
   * @param {number} [options.originY=180]
   */
  constructor(options = {}) {
    this.canvasWidth = options.canvasWidth ?? 220;
    this.canvasHeight = options.canvasHeight ?? 220;
    this.originX = options.originX ?? 110;
    this.originY = options.originY ?? 180;
  }

  /**
   * Parse canvas string like "220x220+110+180"
   * @param {string} canvasStr
   */
  setCanvasFromString(canvasStr) {
    if (!canvasStr) return;
    const m = canvasStr.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
    if (m) {
      this.canvasWidth = parseInt(m[1], 10);
      this.canvasHeight = parseInt(m[2], 10);
      this.originX = parseInt(m[3], 10);
      this.originY = parseInt(m[4], 10);
    }
  }

  drawTransformedSprite(ctx, img, s, palette, parentOffsetX, parentOffsetY) {
    const pal = palette || img.palette;
    const imgCanvas = img.toCanvas(pal);
    if (!imgCanvas) return;

    const srcCtx = imgCanvas.getContext('2d');
    const srcImgData = srcCtx.getImageData(0, 0, img.width, img.height);
    const srcPixels = new Uint32Array(srcImgData.data.buffer);

    const mirrored = (s.flags & 1) !== 0;
    const w = img.width - (mirrored ? 0.5 : 0);
    const h = img.height;

    const ox = roundAway(-w * 0.5);
    const oy = roundAway(-h * 0.5);

    const sx = s.xScale * (mirrored ? -1 : 1);
    const sy = s.yScale;
    const rot = (s.rotation * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const tx = s.x + parentOffsetX;
    const ty = s.y + parentOffsetY;

    // Transformation matrix components:
    const a = cos * sx;
    const b = sin * sx;
    const c = -sin * sy;
    const d = cos * sy;
    const e = a * ox + c * oy + tx;
    const f = b * ox + d * oy + ty;

    const c0x = e, c0y = f;
    const c1x = a * img.width + e, c1y = b * img.width + f;
    const c2x = c * img.height + e, c2y = d * img.height + f;
    const c3x = a * img.width + c * img.height + e, c3y = b * img.width + d * img.height + f;

    const bx1 = Math.trunc(Math.min(c0x, c1x, c2x, c3x));
    const bx2 = Math.trunc(Math.max(c0x, c1x, c2x, c3x));
    const by1 = Math.trunc(Math.min(c0y, c1y, c2y, c3y));
    const by2 = Math.trunc(Math.max(c0y, c1y, c2y, c3y));

    const bw = Math.abs(bx2 - bx1);
    const bh = Math.abs(by2 - by1);
    if (bw === 0 || bh === 0) return;

    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return;
    const invA = d / det;
    const invB = -b / det;
    const invC = -c / det;
    const invD = a / det;
    const invE = (c * f - d * e) / det;
    const invF = (b * e - a * f) / det;

    const startX = this.originX + bx1;
    const startY = this.originY + by1;

    // Read current canvas pixels for clipping and blending
    const outData = ctx.getImageData(startX, startY, bw, bh);
    const outPixels = new Uint32Array(outData.data.buffer);

    for (let y = 0; y < bh; y++) {
      const srcOffY = y + by1;
      const rowOffset = y * bw;
      for (let x = 0; x < bw; x++) {
        const srcOffX = x + bx1;
        const px = Math.round(invA * srcOffX + invC * srcOffY + invE);
        const py = Math.round(invB * srcOffX + invD * srcOffY + invF);

        if (px >= 0 && px < img.width && py >= 0 && py < img.height) {
          const srcPix = srcPixels[py * img.width + px];
          if ((srcPix & 0xff000000) !== 0) {
            outPixels[rowOffset + x] = srcPix;
          }
        }
      }
    }
    ctx.putImageData(outData, startX, startY);
  }

  /**
   * Draw a single ACT layer/sprite onto the 2D context
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./act.js').ActSprite} s
   * @param {import('./spr.js').SprFile} spr
   * @param {import('./pal.js').Palette} [palette]
   * @param {number} [parentOffsetX=0]
   * @param {number} [parentOffsetY=0]
   */
  drawSpriteLayer(ctx, s, spr, palette = null, parentOffsetX = 0, parentOffsetY = 0) {
    if (s.sprId < 0) return;
    const img = spr.getImage(s.sprId, s.sprType);
    if (!img) return;

    // Use default palette if none provided
    const pal = palette || spr.palette;
    if (s.tint && s.tint[3] === 0) return;

    if (s.xScale !== 1 || s.yScale !== 1 || s.rotation !== 0) {
      this.drawTransformedSprite(ctx, img, s, pal, parentOffsetX, parentOffsetY);
      return;
    }

    const imgCanvas = img.toCanvas(pal);
    if (!imgCanvas) return;

    const mirrored = (s.flags & 1) !== 0;
    // Mirrored sprites: even-width sprites require +1px alignment to match zrenderer / RO rasterization
    const mirrorShift = (mirrored && (img.width % 2 === 0)) ? 1 : 0;
    const posX = this.originX + s.x + parentOffsetX + mirrorShift;
    const posY = this.originY + s.y + parentOffsetY;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(posX, posY);

    const scaleX = mirrored ? -1 : 1;
    if (scaleX !== 1) {
      ctx.scale(scaleX, 1);
    }

    // Sizing and origin alignment
    const offsetX = roundAway(-img.width * 0.5);
    const offsetY = roundAway(-img.height * 0.5);

    ctx.drawImage(imgCanvas, offsetX, offsetY);
    ctx.restore();
  }

  /**
   * Draw all sprites of a specific frame of an ACT
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./spr.js').SprFile} spr
   * @param {import('./act.js').ActFile} act
   * @param {number} actionIndex
   * @param {number} frameIndex
   * @param {import('./pal.js').Palette} [palette]
   * @param {number} [parentOffsetX=0]
   * @param {number} [parentOffsetY=0]
   */
  drawFrame(ctx, spr, act, actionIndex, frameIndex, palette = null, parentOffsetX = 0, parentOffsetY = 0) {
    const action = act.getAction(actionIndex);
    if (!action || action.frames.length === 0) return;

    const fIdx = frameIndex % action.frames.length;
    const frame = action.frames[fIdx];
    if (!frame) return;

    for (let i = 0; i < frame.sprites.length; i++) {
      this.drawSpriteLayer(ctx, frame.sprites[i], spr, palette, parentOffsetX, parentOffsetY);
    }
  }

  /**
   * Determine total animation frames for a character configuration
   * @param {Object} char
   * @param {number} action
   * @param {number} [headdir=0]
   * @param {boolean} [anim=true]
   * @returns {number}
   */
  getFrameCount(char, action, headdir = 0, anim = true) {
    if (!char.body || !char.body.act) return 1;

    const bodyAction = char.body.act.getAction(action);
    if (!bodyAction) return 1;

    // Stand or sit with fixed head direction and no anim
    if (isStandOrSit(action) && !anim) {
      return 1;
    }

    let maxFrames = bodyAction.frames.length;
    if (isStandOrSit(action)) {
      // In stand/sit, body has 3 frames for head directions, so the motion itself is static
      maxFrames = 1;
    }

    // Animated headgears or garment
    if (char.garment && char.garment.act) {
      const gAct = char.garment.act.getAction(action);
      if (gAct && gAct.frames.length > 1) {
        maxFrames = Math.max(maxFrames, gAct.frames.length);
      }
    }

    if (char.headgears) {
      for (const hg of char.headgears) {
        if (!hg || !hg.act) continue;
        const hgAct = hg.act.getAction(action);
        if (hgAct && hgAct.frames.length > 3) {
          maxFrames = Math.max(maxFrames, hgAct.frames.length);
        }
      }
    }

    return Math.max(1, maxFrames);
  }

  /**
   * Alias for getFrameCount
   */
  getMaxFrames(char, action, headdir = 0, anim = true) {
    return this.getFrameCount(char, action, headdir, anim);
  }

  /**
   * Determine animation delay (ms) for an action
   * @param {Object} char
   * @param {number} action
   * @returns {number}
   */
  getDelayMs(char, action) {
    if (char.body && char.body.act) {
      const act = char.body.act.getAction(action);
      if (act && act.delayMs) return act.delayMs;
    }
    return 100;
  }

  /**
   * Render complete character onto canvas
   * @param {HTMLCanvasElement} canvas
   * @param {Object} char Character setup
   * @param {Object} char.body { spr, act, palette }
   * @param {Object} [char.head] { spr, act, palette }
   * @param {Array<Object>} [char.headgears] Array of { spr, act, slot }
   * @param {Object} [char.garment] { spr, act }
   * @param {Object} [char.shadow] { spr, act }
   * @param {number} [action=0] Action index (motion * 8 + dir)
   * @param {number} [frame=0] Current frame index
   * @param {number} [headdir=0] Head direction (0: straight, 1: right, 2: left)
   */
  renderCharacter(canvas, char, action = 0, frame = 0, headdir = 0) {
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dir = action % 8;
    const topLeft = dir >= 2 && dir <= 5;
    const standSit = isStandOrSit(action);

    // Frame indices calculation
    const bodyAction = char.body?.act?.getAction(action);
    const bodyNumFrames = bodyAction ? bodyAction.frames.length : 1;

    let bodyFrameIdx = frame % bodyNumFrames;
    let headFrameIdx = frame;

    if (standSit) {
      const headActFrame = getHeadActFrame(headdir);
      bodyFrameIdx = headActFrame % bodyNumFrames;
      headFrameIdx = headActFrame;
    }

    // Get body anchor point for neck attachment
    let bodyAnchor = { x: 0, y: 0 };
    if (bodyAction && bodyAction.frames[bodyFrameIdx]) {
      const bFr = bodyAction.frames[bodyFrameIdx];
      if (bFr.attachPoints && bFr.attachPoints.length > 0) {
        bodyAnchor = bFr.attachPoints[0];
      }
    }

    // Collect layers with their z-index
    const layers = [];

    // Shadow
    if (char.shadow && char.shadow.spr && char.shadow.act) {
      layers.push({
        zIndex: -1,
        type: 'shadow',
        spr: char.shadow.spr,
        act: char.shadow.act,
        actIdx: 0,
        frameIdx: 0,
        pal: null,
        offsetX: 0,
        offsetY: 0
      });
    }

    // Garment
    if (char.garment && char.garment.spr && char.garment.act) {
      const gAct = char.garment.act.getAction(action);
      const gNumFrames = gAct ? gAct.frames.length : 1;
      const gFrameIdx = frame % gNumFrames;
      // Garment z-index: by default behind body (5); onTop for dirs 3..5, or stand/sit dir 2
      const dir = action % 8;
      const isTopLayer = Boolean(char.garment?.isTopLayer);
      const standSit = isStandOrSit(action);
      let onTop = false;
      if (char.garmentOnTop !== undefined) {
        onTop = char.garmentOnTop;
      } else if (dir >= 3 && dir <= 5) {
        onTop = true;
      } else if (standSit && dir === 2) {
        onTop = true;
      }
      let gZIndex = 5;
      if (onTop) {
        if (isTopLayer) {
          gZIndex = 25;
        } else if (topLeft) {
          gZIndex = 16;
        } else {
          gZIndex = 11;
        }
      }
      layers.push({
        zIndex: gZIndex,
        type: 'garment',
        spr: char.garment.spr,
        act: char.garment.act,
        actIdx: action,
        frameIdx: gFrameIdx,
        pal: null,
        offsetX: 0,
        offsetY: 0
      });
    }

    // Body
    if (char.body && char.body.spr && char.body.act) {
      layers.push({
        zIndex: topLeft ? 15 : 10,
        type: 'body',
        spr: char.body.spr,
        act: char.body.act,
        actIdx: action,
        frameIdx: bodyFrameIdx,
        pal: char.body.palette,
        offsetX: 0,
        offsetY: 0
      });
    }

    // Head
    if (char.head && char.head.spr && char.head.act) {
      const hAct = char.head.act.getAction(action);
      const hNumFrames = hAct ? hAct.frames.length : 1;
      const hf = headFrameIdx % hNumFrames;
      let headAnchor = { x: 0, y: 0 };
      if (hAct && hAct.frames[hf] && hAct.frames[hf].attachPoints?.length > 0) {
        headAnchor = hAct.frames[hf].attachPoints[0];
      }
      let headZIndex = topLeft ? 20 : 15;
      if (char.imf) {
        const p = char.imf.getPriority(1, action, bodyFrameIdx);
        if (p === 1) {
          headZIndex = topLeft ? 14 : 9; // Before body
        }
      }
      layers.push({
        zIndex: headZIndex,
        type: 'head',
        spr: char.head.spr,
        act: char.head.act,
        actIdx: action,
        frameIdx: hf,
        pal: char.head.palette,
        offsetX: bodyAnchor.x - headAnchor.x,
        offsetY: bodyAnchor.y - headAnchor.y
      });
    }

    // Headgears
    if (char.headgears) {
      char.headgears.forEach((hg, slot) => {
        if (!hg || !hg.spr || !hg.act) return;
        const hgAct = hg.act.getAction(action);
        const hgNumFrames = hgAct ? hgAct.frames.length : 1;

        let hgFrameIdx = frame % hgNumFrames;
        if (standSit) {
          if (hgNumFrames >= 3) {
            const subFrames = Math.floor(hgNumFrames / 3);
            const dirIdx = getHeadActFrame(headdir);
            hgFrameIdx = dirIdx * subFrames + (frame % subFrames);
          } else {
            hgFrameIdx = frame % hgNumFrames;
          }
        }

        let hgAnchor = { x: 0, y: 0 };
        if (hgAct && hgAct.frames[hgFrameIdx] && hgAct.frames[hgFrameIdx].attachPoints?.length > 0) {
          hgAnchor = hgAct.frames[hgFrameIdx].attachPoints[0];
        }

        const zBase = topLeft ? 22 : 17;
        const actualSlot = hg.slot ?? slot;
        layers.push({
          zIndex: zBase + actualSlot,
          type: 'headgear',
          spr: hg.spr,
          act: hg.act,
          actIdx: action,
          frameIdx: hgFrameIdx,
          pal: null,
          offsetX: bodyAnchor.x - hgAnchor.x,
          offsetY: bodyAnchor.y - hgAnchor.y
        });
      });
    }

    // Sort by z-index ascending
    layers.sort((a, b) => a.zIndex - b.zIndex);

    // Render layers
    for (const l of layers) {
      this.drawFrame(ctx, l.spr, l.act, l.actIdx, l.frameIdx, l.pal, l.offsetX, l.offsetY);
    }
  }

  /**
   * Helper: render only body
   */
  renderBody(canvas, bodySpr, bodyAct, actionIndex, frameIndex = 0, bodyPal = null) {
    this.renderCharacter(canvas, {
      body: { spr: bodySpr, act: bodyAct, palette: bodyPal }
    }, actionIndex, frameIndex, 0);
  }
}
