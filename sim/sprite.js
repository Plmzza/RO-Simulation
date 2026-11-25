// Character sprite for the equipment window: draws the job with the worn headgears / garment,
// using the renderer and data in ../costume (loaded only when this is first used).
const BASE = '../costume';
let ready = null;          // Promise<{ loader, composer, views, hair }>
let seq = 0;

function init() {
  if (ready) return ready;
  const json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });
  ready = Promise.all([
    import(`${BASE}/src/index.js`),
    json(`${BASE}/resolver.json`),
    json(`${BASE}/manifest.json`).catch(() => null),
    json('../data/views.json'),
    json(`${BASE}/sim-data.json`).then((d) => d.hair).catch(() => ({})),
  ]).then(([m, res, man, views, hair]) => {
    const resolver = new m.ResourceResolver(res, BASE);
    if (man) resolver.setManifest(man);
    return {
      loader: new m.AssetLoader(resolver),
      composer: new m.CharacterComposer({ canvasWidth: 100, canvasHeight: 130, originX: 50, originY: 118 }),
      views, hair,
    };
  });
  ready.catch((e) => console.warn('sprite renderer unavailable:', e));
  return ready;
}

/** hair styles for a gender: [[style, [[palette, '#rgb'], …]], …] */
export async function hairStyles(gender) {
  try { return (await init()).hair[String(gender)] || []; } catch { return []; }
}

/** view ids of what is worn: costume slots take priority over the normal ones */
function viewsOf(worn, views) {
  const v = (id) => (id && views[id]) || 0;
  return {
    headgear: [v(worn.costumeTop) || v(worn.headTop), v(worn.costumeMid) || v(worn.headMid), v(worn.costumeLow) || v(worn.headLow)],
    garment: v(worn.costumeGarment) || v(worn.garment),
  };
}

/**
 * Draw into `canvas`. `worn` = slot → item id; `look` = { gender, hair, color }.
 * Calls onDone(true) once drawn, onDone(false) when the renderer or the job sprite is missing.
 */
export async function drawCharacter(canvas, jobId, worn, look, onDone) {
  const my = ++seq;
  try {
    const { loader, composer, views } = await init();
    const { headgear, garment } = viewsOf(worn, views);
    const char = await loader.loadCharacter({
      job: jobId, gender: look.gender, outfit: 0, head: look.hair, headPalette: look.color, bodyPalette: -1,
      headdir: 0, headgear, garment, mount: 0, mado: 0, action: 0, enableShadow: false,
    });
    if (my !== seq || !canvas.isConnected) return;
    composer.renderCharacter(canvas, char, 0, 0, 0);
    onDone?.(true);
  } catch (e) {
    if (my === seq) { console.warn('sprite:', e); onDone?.(false); }
  }
}
