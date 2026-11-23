/**
 * RO Asset Loader with memory cache
 */
import { SprFile } from './spr.js';
import { ActFile } from './act.js';
import { Palette } from './pal.js';
import { ImfFile } from './imf.js';
import { decompress as zstdDecompress } from './vendor/fzstd.js';

export class AssetLoader {
  constructor(resolver) {
    this.resolver = resolver;
    this.sprCache = new Map();
    this.actCache = new Map();
    this.palCache = new Map();
    this.imfCache = new Map();
    this.packCache = new Map();
  }

  /**
   * Load a zstd pack (several files stored together) once and keep it in memory.
   * @param {string} url
   * @returns {Promise<Uint8Array>}
   */
  loadPack(url) {
    if (!this.packCache.has(url)) {
      const p = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
        return res.arrayBuffer();
      }).then((buf) => zstdDecompress(new Uint8Array(buf)));
      p.catch(() => this.packCache.delete(url));
      this.packCache.set(url, p);
    }
    return this.packCache.get(url);
  }

  async fetchBuffer(url) {
    const targetUrl = this.resolver?.resolveUrl ? this.resolver.resolveUrl(url) : url;

    // Packed entry: "<pack>.zst#<offset>:<length>"
    const packed = targetUrl.match(/^(.*\.zst)#(\d+):(\d+)$/);
    if (packed) {
      const data = await this.loadPack(packed[1]);
      const start = Number(packed[2]);
      return data.slice(start, start + Number(packed[3])).buffer;
    }
    const res = await fetch(targetUrl);
    if (!res.ok) {
      throw new Error(`Failed to load ${targetUrl} (HTTP ${res.status})`);
    }

    if (targetUrl.endsWith('.gz') && typeof DecompressionStream !== 'undefined') {
      const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).arrayBuffer();
    }
    return res.arrayBuffer();
  }

  async loadSpr(basePath) {
    const url = `${basePath}.spr`;
    if (this.sprCache.has(url)) return this.sprCache.get(url);

    const buf = await this.fetchBuffer(url);
    const spr = new SprFile(buf);
    this.sprCache.set(url, spr);
    return spr;
  }

  async loadAct(basePath) {
    const url = `${basePath}.act`;
    if (this.actCache.has(url)) return this.actCache.get(url);

    const buf = await this.fetchBuffer(url);
    const act = new ActFile(buf);
    this.actCache.set(url, act);
    return act;
  }

  async loadPalette(url) {
    if (!url) return null;
    if (this.palCache.has(url)) return this.palCache.get(url);

    try {
      const buf = await this.fetchBuffer(url);
      const pal = new Palette(buf);
      this.palCache.set(url, pal);
      return pal;
    } catch (e) {
      console.warn('Could not load palette:', url, e);
      return null;
    }
  }

  async loadImf(url) {
    if (!url) return null;
    if (this.imfCache.has(url)) return this.imfCache.get(url);

    try {
      const buf = await this.fetchBuffer(url);
      const imf = new ImfFile(buf);
      this.imfCache.set(url, imf);
      return imf;
    } catch (e) {
      return null;
    }
  }

  /**
   * Load all assets for a requested character configuration
   * @param {Object} req
   */
  async loadCharacter(req) {
    const {
      job = 0,
      gender = 1,
      outfit = 0,
      head = 1,
      headPalette = -1,
      bodyPalette = -1,
      headgear = [0, 0, 0],
      garment = 0,
      mount = 0,
      mado = 0,
      enableShadow = false
    } = req;

    const char = {
      body: null,
      head: null,
      headgears: [],
      garment: null,
      shadow: null,
      imf: null
    };

    const promises = [];

    // 0. IMF
    const imfUrl = this.resolver.getImfPath(job, gender, mado);
    if (imfUrl) {
      promises.push((async () => {
        char.imf = await this.loadImf(imfUrl);
      })());
    }

    // 1. Body
    const bodyBase = this.resolver.getBodyPath(job, gender, outfit, Boolean(mount), mado);
    const bodyPalUrl = this.resolver.getBodyPalettePath(job, gender, bodyPalette, outfit, mado);

    promises.push((async () => {
      try {
        const [spr, act, palette] = await Promise.all([
          this.loadSpr(bodyBase),
          this.loadAct(bodyBase),
          bodyPalUrl ? this.loadPalette(bodyPalUrl) : null
        ]);
        char.body = { spr, act, palette };
      } catch (err) {
        console.error('Failed to load body:', bodyBase, err);
      }
    })());

    // 2. Head
    if (head > 0) {
      const headBase = this.resolver.getHeadPath(head, gender, job);
      const headPalUrl = this.resolver.getHeadPalettePath(head, gender, headPalette, job);

      promises.push((async () => {
        try {
          const [spr, act, palette] = await Promise.all([
            this.loadSpr(headBase),
            this.loadAct(headBase),
            headPalUrl ? this.loadPalette(headPalUrl) : null
          ]);
          char.head = { spr, act, palette };
        } catch (err) {
          console.warn('Failed to load head:', headBase, err);
        }
      })());
    }

    // 3. Headgears (up to 3)
    if (headgear && headgear.length > 0) {
      headgear.forEach((hgView, slot) => {
        if (!hgView) return;
        const hgBase = this.resolver.getHeadgearPath(hgView, gender);
        if (!hgBase) return;

        promises.push((async () => {
          try {
            const [spr, act] = await Promise.all([
              this.loadSpr(hgBase),
              this.loadAct(hgBase)
            ]);
            char.headgears.push({ spr, act, slot });
          } catch (err) {
            console.warn('Failed to load headgear:', hgBase, err);
          }
        })());
      });
    }

    // 4. Garment
    if (garment > 0 && !this.resolver.isMadogear(job)) {
      const gPaths = this.resolver.getGarmentPath(garment, gender, job);
      if (gPaths) {
        promises.push((async () => {
          let act = null;
          try {
            act = await this.loadAct(gPaths.primary);
          } catch (e) {
            if (gPaths.fallback) {
              try { act = await this.loadAct(gPaths.fallback); } catch (e2) {}
            }
          }

          let spr = null;
          try {
            spr = await this.loadSpr(gPaths.primary);
          } catch (e) {
            if (gPaths.fallback) {
              try { spr = await this.loadSpr(gPaths.fallback); } catch (e2) {}
            }
          }

          if (act && spr) {
            char.garment = { spr, act, isTopLayer: this.resolver.isRobeTopLayer(garment) };
          }
        })());
      }
    }

    // 5. Shadow
    if (enableShadow) {
      const shadowBase = this.resolver.getShadowPath();
      promises.push((async () => {
        try {
          const [spr, act] = await Promise.all([
            this.loadSpr(shadowBase),
            this.loadAct(shadowBase)
          ]);
          char.shadow = { spr, act };
        } catch (err) {
          console.warn('Failed to load shadow:', err);
        }
      })());
    }

    await Promise.all(promises);
    return char;
  }
}
