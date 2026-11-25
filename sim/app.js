/**
 * RO Simulator UI: skill tree, status, equipment (crafted items from the inventory), equipment status,
 * consumables, buffs and damage. All numbers come from ../calc (rAthena renewal formulas of the server).
 * State is kept in localStorage and can be exported / imported as JSON.
 */
import {
  loadAll, calculateBuild, calculateDamage, calculateDefense, classIdOf, SLOTS, cardsForSlot, itemUsableBy,
  buffAvailability, consumableAvailability, debuffList, jobTreeName,
} from '../calc/index.js';
import { STATS, TRAITS, statCost } from '../calc/status.js';
import { drawCharacter, hairStyles } from './sprite.js';
import { STAT_TABS, labelOf, categoryOf, RACES, ELES, SIZES, OPTIONS, optionScript } from './labels.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'ro-sim-v1';
const ZOOM = 0.9;                 // the whole page is drawn at 90% (style.css body { zoom })
const GRADES = ['-', 'D', 'C', 'B', 'A'];
const MAX_INV = 100;

const db = await loadAll('../data/');
const ENCH = await fetch('../data/enchants.json').then((r) => (r.ok ? r.json() : { defs: {}, items: {} })).catch(() => ({ defs: {}, items: {} }));
const RANDOPT = await fetch('../data/randomopt.json').then((r) => (r.ok ? r.json() : { options: {}, groups: {}, items: {} })).catch(() => ({ options: {}, groups: {}, items: {} }));
const TREEPOS = await fetch('../data/skilltree.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const SCX = await fetch('../data/scconflict.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const SKILLINFO = await fetch('../data/skillinfo.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const C = db.equip.constants;

// ------------------------------------------------------------------ state
const DEFAULT = () => ({
  v: 1, jobId: 0, trans: false, baseLv: 1, jobLv: 1,
  base: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }, trait: { pow: 0, sta: 0, wis: 0, spl: 0, con: 0, crt: 0 },
  skills: {}, buffs: {}, debuffs: {}, consumables: [], inventory: [], equipped: {},
  ui: { skillTier: null, equipTab: 'general', eqTab: 'all', invTab: 'cons', buffTab: 'self', buffJob: '', inGameOnly: true, look: { gender: 1, hair: 1, color: 0 } },
  mobId: 1002, atkSkill: '', atkLv: 1,
});
let S;
try { S = { ...DEFAULT(), ...JSON.parse(localStorage.getItem(KEY) || 'null') }; } catch { S = DEFAULT(); }
S.ui = { ...DEFAULT().ui, ...(S.ui || {}) };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ } };
let editing = null;                 // craft form: { uid|null, id, refine, grade, cards, enchants, options }

// ------------------------------------------------------------------ build
const invItem = (uid) => S.inventory.find((x) => x.uid === uid);
function equipmentInput() {
  const out = {};
  const cid = classIdOf(db, { jobId: S.jobId, trans: S.trans });
  for (const [slot, uid] of Object.entries(S.equipped)) {
    const x = invItem(uid);
    if (!x || !db.equip.items[x.id]) continue;
    if (!itemUsableBy(db.equip, db.equip.items[x.id], cid, S.baseLv).ok) continue;   // job / level lock: not worn
    out[slot] = { id: x.id, refine: x.refine || 0, grade: x.grade || 0, cards: x.cards.filter(Boolean), enchants: x.enchants.filter(Boolean),
      options: x.options.map(roScript).filter(Boolean) };
  }
  return out;
}
const baseInput = () => ({ jobId: S.jobId, trans: S.trans, baseLv: S.baseLv, jobLv: S.jobLv, base: S.base, traitBase: S.trait,
  skills: S.skills, equipment: equipmentInput() });
let build, avail;
function compute() {
  const input = baseInput();
  // which buffs can be on: first without buffs (availability depends on the job, skills and equipment)
  const pre = calculateBuild(db, { ...input, consumables: S.consumables });
  avail = buffAvailability(db, pre);
  const buffs = {};
  for (const [id, lv] of Object.entries(S.buffs)) {
    const a = avail.find((b) => b.id === id);
    const max = a ? buffMax(a) : 0;
    if (a && max > 0 && lv > max) S.buffs[id] = max;         // skill lowered in the simulator: the buff follows
    if (a && a.available && max > 0 && lv > 0) buffs[id] = Math.min(lv, max);
  }
  build = calculateBuild(db, { ...input, consumables: S.consumables, buffs });
}
/** self buffs need the skill learned (or granted by equipment / an item); others up to the skill's max */
/** self buffs: the level learned in the skill simulator (or granted by equipment); only an item (scroll, rune) when not learned */
function buffMax(a) {
  if (a.kind !== 'self') return a.maxLv;
  const own = Math.max(S.skills[a.id] || 0, a.fromEquip?.lv || 0);
  return own ? Math.min(own, a.maxLv) : 0;      // item buffs come from Inventory → cons. when the item is used
}

// ------------------------------------------------------------------ top bar
function jobName(j) { return j.name; }
$('job').innerHTML = db.status.jobs.map((j) => `<option value="${j.id}">${esc(jobName(j))}${j.transClass ? ' (Trans)' : ''}</option>`).join('');
function bindTop() {
  $('job').value = S.jobId; $('trans').checked = S.trans; $('baseLv').value = S.baseLv; $('jobLv').value = S.jobLv;
  const job = db.status.jobs.find((j) => j.id === S.jobId);
  $('trans').parentElement.style.display = 'none';      // 3rd jobs are always the transcendent line (Rune Knight T...)
  $('baseLv').min = build?.status?.job?.traits ? 200 : 1;
  if (build?.status?.cls) { $('baseLv').max = build.status.cls.maxBase; $('jobLv').max = build.status.cls.maxJob;
    $('baseLv').title = `สูงสุด ${build.status.cls.maxBase}`; $('jobLv').title = `สูงสุด ${build.status.cls.maxJob}`; }
}
$('job').onchange = () => {
  S.jobId = Number($('job').value); S.ui.skillTier = null;
  if (db.status.jobs.find((j) => j.id === S.jobId)?.traits) S.baseLv = 200;   // 4th jobs start at Base Lv 200
  pruneSkills(); refresh();
};
$('trans').onchange = () => { S.trans = $('trans').checked; S.ui.skillTier = null; pruneSkills(); refresh(); };
$('baseLv').onchange = () => { S.baseLv = Number($('baseLv').value) || 1; refresh(); };
$('jobLv').onchange = () => { S.jobLv = Number($('jobLv').value) || 1; refresh(); };
$('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `ro-sim-${jobName(build.status.job).replace(/\W+/g, '_')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('btnImport').onclick = () => $('fileImport').click();
$('fileImport').onchange = async () => {
  const f = $('fileImport').files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (typeof j !== 'object' || !j.base) throw new Error('ไม่ใช่ไฟล์ของ RO Simulator');
    S = { ...DEFAULT(), ...j, ui: { ...DEFAULT().ui, ...(j.ui || {}) } };
    refresh();
  } catch (e) { alert('Import ไม่สำเร็จ: ' + e.message); }
  $('fileImport').value = '';
};
$('btnReset').onclick = () => {
  if (!confirm('ล้างทุกอย่าง (สกิล สเตตัส ไอเท็มที่คราฟ) แล้วเริ่มใหม่?')) return;
  S = DEFAULT(); editing = null; refresh();
};

// ------------------------------------------------------------------ 1. skills
function tiers() {
  const t = db.skills.tree;
  const name = jobTreeName(db, classIdOf(db, { jobId: S.jobId, trans: S.trans }));
  if (!t[name]) return [];
  const chain = [...(t[name].inherit || []), name].filter((n) => t[n]).sort((a, b) => t[a].inherit.length - t[b].inherit.length);
  const jobOf = (n) => db.status.jobs.find((j) => j.id === C['Job_' + n]);
  const maxJobOf = (n) => db.status.classes[jobOf(n)?.class]?.maxJob ?? (/_T$|^Lord|^High|_High$/.test(n) ? 70 : 50);
  // transcendent variants (Lord Knight, Rune Knight T) share the tab of the job they extend
  const TRANS2 = ['Lord_Knight', 'High_Priest', 'High_Wizard', 'Whitesmith', 'Sniper', 'Assassin_Cross', 'Paladin', 'Champion',
    'Professor', 'Stalker', 'Creator', 'Clown', 'Gypsy'];
  const variant = (n) => /_T$|_High$|^High_Novice$/.test(n) || TRANS2.includes(n);
  const groups = [];
  for (const n of chain) {
    const parent = variant(n) && [...t[n].inherit].sort((a, b) => t[b].inherit.length - t[a].inherit.length)
      .map((p) => groups.find((g) => g.keys.includes(p))).find(Boolean);
    if (parent) { parent.keys.push(n); parent.skills.push(...t[n].skills.filter((s) => !parent.skills.some((x) => x[0] === s[0]))); }
    else groups.push({ key: n, label: n.replace(/_/g, ' '), keys: [n], skills: [...t[n].skills] });
  }
  return groups.filter((g) => g.skills.length).map((g, i, all) => {
    const last = i === all.length - 1;
    const pts = Math.max(0, (last ? S.jobLv : Math.max(...g.keys.map(maxJobOf))) - 1);
    return { ...g, points: pts };
  });
}
const skillDef = (name) => {
  for (const tr of tiers()) { const s = tr.skills.find((x) => x[0] === name); if (s) return s; }
  return null;
};
const skName = (n) => db.skills.names?.[n]?.[0] || n;
const NOIMG = `this.outerHTML='<span class=noimg></span>'`;
const iconI = (id) => `<img src="icons/i/${id}.png" alt="" loading="lazy" onerror="${NOIMG}">`;
const iconS = (n) => `<img class="ic" src="icons/s/${n}.png" alt="" loading="lazy" onerror="${NOIMG}">`;
function setSkill(name, lv) {
  const d = skillDef(name);
  if (!d) return;
  lv = Math.max(0, Math.min(d[1], lv));
  if (lv) S.skills[name] = lv; else delete S.skills[name];
}
/** drop skills whose prerequisites are no longer met, and skills the job does not have */
function pruneSkills() {
  const all = new Map();
  for (const tr of tiers()) for (const s of tr.skills) all.set(s[0], s);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, lv] of Object.entries(S.skills)) {
      const d = all.get(n);
      if (!d || (d[2] || []).some(([r, rl]) => (S.skills[r] || 0) < rl)) { delete S.skills[n]; changed = true; }
      else if (lv > d[1]) S.skills[n] = d[1];
    }
  }
}
const tierOf = (name) => tiers().find((t) => t.skills.some((x) => x[0] === name));
const tierLeft = (tier) => tier.points - tier.skills.reduce((a, [n]) => a + (S.skills[n] || 0), 0);
const curTier = () => tiers().find((x) => x.key === S.ui.skillTier);
/** why a skill cannot be raised now (null = it can): prerequisites, job level, skill points, max level */
function blockReason(n) {
  const d = skillDef(n), T = tiers(), tier = tierOf(n);
  if (!d || !tier) return 'อาชีพนี้ไม่มีสกิลนี้';
  if ((S.skills[n] || 0) >= d[1]) return 'เลเวลสูงสุดแล้ว';
  const miss = (d[2] || []).filter(([r, rl]) => (S.skills[r] || 0) < rl);
  if (miss.length) return 'ต้องเรียนก่อน: ' + miss.map(([r, rl]) => `${skName(r)} Lv${rl}`).join(', ');
  const isLast = tier === T[T.length - 1];
  if (d[3] && isLast && S.jobLv < d[3]) return `ต้องมี Job Lv ${d[3]} ขึ้นไป`;
  if (tierLeft(tier) <= 0) return `Skill Point ของ ${tier.label} หมดแล้ว`;
  return null;
}
/** raise a skill to lv, learning the prerequisites first (like the game's skill window); null = done, else why not */
function raiseTo(n, lv, depth = 0) {
  const d = skillDef(n);
  if (!d) return 'อาชีพนี้ไม่มีสกิลนี้';
  if (lv > d[1] || depth > 30) return 'เลเวลสูงสุดแล้ว';
  for (const [r, rl] of d[2] || []) {
    if ((S.skills[r] || 0) < rl) { const why = raiseTo(r, rl, depth + 1); if (why) return why; }
  }
  while ((S.skills[n] || 0) < lv) {
    const why = blockReason(n);
    if (why) return `${skName(n)}: ${why}`;
    S.skills[n] = (S.skills[n] || 0) + 1;
  }
  return null;
}
function learnWithPrereqs(n, lv) {
  const before = { ...S.skills };
  const why = raiseTo(n, lv);
  if (why) { S.skills = before; skillMsg(why); return false; }
  skillSel = n;
  return true;
}
/** skills that need this one at its current level (it cannot be lowered while they are learned) */
function dependents(n) {
  const lv = S.skills[n] || 0, out = [];
  for (const t of tiers()) for (const [m, , req] of t.skills) if (S.skills[m] && (req || []).some(([r, rl]) => r === n && rl >= lv)) out.push(m);
  return out;
}
/** tree position: column = length of the longest prerequisite chain inside this tab */
function layout(tier) {
  const inTab = new Map(tier.skills.map((s) => [s[0], s]));
  const depth = new Map();
  const dep = (n, seen = new Set()) => {
    if (depth.has(n)) return depth.get(n);
    if (seen.has(n)) return 0;
    seen.add(n);
    const reqs = (inTab.get(n)?.[2] || []).filter(([r]) => inTab.has(r));
    const v = reqs.length ? 1 + Math.max(...reqs.map(([r]) => dep(r, seen))) : 0;
    depth.set(n, v);
    return v;
  };
  tier.skills.forEach(([n]) => dep(n));
  const cols = Math.max(...depth.values()) + 1;
  const rows = new Array(cols).fill(0), pos = new Map();
  // keep a skill on the same row as its first prerequisite when that row is free
  for (const [n, , req] of tier.skills) {
    const c = depth.get(n);
    const parent = (req || []).map(([r]) => pos.get(r)).find(Boolean);
    let r = Math.max(rows[c], parent ? parent.row : 0);
    pos.set(n, { col: c, row: r });
    rows[c] = r + 1;
  }
  return { pos, cols };
}
let skillSel = null;          // skill whose details are shown
const TIER_LABEL = ['Nov.', '1st', '2nd', '3rd', '4th', '5th'];
const KIND = { Passive: 'Passive', Self: 'ใช้กับตัวเอง', Support: 'ใช้กับผู้อื่น', Attack: 'โจมตี', Ground: 'ร่ายบนพื้น' };
function renderSkills() {
  const T = tiers();
  if (!T.length) { $('skillGrid').innerHTML = '<p class="muted">ไม่มีข้อมูลสกิลของอาชีพนี้</p>'; $('skillTabs').innerHTML = ''; return; }
  const granted = build.equip.grantedSkills || {};
  if (S.ui.skillTier !== '__etc' && !T.some((t) => t.key === S.ui.skillTier)) S.ui.skillTier = T[T.length - 1].key;
  $('skillTabs').innerHTML = T.map((t, i) => `<button data-k="${t.key}" class="${t.key === S.ui.skillTier ? 'on' : ''}" data-tip="${esc(t.label)}">${TIER_LABEL[i] || t.label}</button>`).join('') +
    `<button data-k="__etc" class="${S.ui.skillTier === '__etc' ? 'on' : ''}" data-tip="สกิลที่ได้จากอุปกรณ์สวมใส่">Etc</button>`;
  if (S.ui.skillTier === '__etc') {
    // skills granted by worn equipment / cards / combos (item script: skill "X",lv) – fixed level, not bought with points
    const list = Object.entries(granted);
    let h = list.map(([n, g]) => `<div class="cell sk${n === skillSel ? ' sel' : ''}" data-n="${n}" data-tip="${esc(`${skName(n)} Lv ${g.lv}\nจาก: ${g.source}`)}">
      <span class="nm">${esc(skName(n))}</span>${iconS(n)}<span class="lv"><b>Lv ${g.lv}</b></span></div>`).join('');
    h += '<div class="cell empty"></div>'.repeat(Math.max(0, 42 - list.length));
    $('skillGrid').innerHTML = h;
    $('skillPoint').innerHTML = list.length ? `สกิลจากอุปกรณ์ ${list.length} สกิล` : '<span class="muted">ยังไม่มีสกิลจากอุปกรณ์ที่สวมใส่</span>';
    $('jobSprite').src = `../costume/thumbs/job/${S.jobId}.png`;
    renderSkillInfo();
    return;
  }
  const tier = T.find((t) => t.key === S.ui.skillTier);
  const { pos, cols } = layout(tier);
  const spread = cols <= 4 ? 2 : 1;                       // spread the tree over the 7 columns like the client
  const selReq = new Set((skillDef(skillSel)?.[2] || []).map(([r]) => r));
  const selDep = new Set(tier.skills.filter(([, , req]) => (req || []).some(([r]) => r === skillSel)).map(([n]) => n));
  const cells = new Map();
  let maxRow = 5;
  // positions of the game's skill window (Divine Pride skill tree data): the job tree that shares most skills with this tab
  let best = null, bestHit = 0;
  for (const tree of Object.values(TREEPOS.jobs || {})) {
    const hit = tier.skills.filter(([n]) => tree[n] != null).length;
    if (hit > bestHit) { best = tree; bestHit = hit; }
  }
  const rest = [];
  for (const [n, max] of tier.skills) {
    const ix = best?.[n];
    if (ix != null && !cells.has(`${Math.floor(ix / 7)},${ix % 7}`)) cells.set(`${Math.floor(ix / 7)},${ix % 7}`, [n, max]);
    else rest.push([n, max]);
  }
  for (const [n, max] of rest) {                         // not in the data: tree order into the free cells
    const p = pos.get(n);
    let col = best ? 0 : Math.min(6, p.col * spread), row = best ? 0 : p.row;
    while (cells.has(`${row},${col}`)) { col++; if (col > 6) { col = 0; row++; } }
    cells.set(`${row},${col}`, [n, max]);
  }
  for (const k of cells.keys()) maxRow = Math.max(maxRow, Number(k.split(',')[0]));
  let h = '';
  for (let r = 0; r <= maxRow; r++) for (let c = 0; c < 7; c++) {
    const x = cells.get(`${r},${c}`);
    if (!x) { h += '<div class="cell empty"></div>'; continue; }
    const [n, max] = x, lv = S.skills[n] || 0, why = blockReason(n);
    const lock = !lv && why && why.startsWith('ต้อง');
    // like the client: not learned = icon only (grey when locked, blue frame when it can be learned: click it);
    // learned = "◀ lv / max ▶"
    const can = !lv && !why;
    const cls = ['cell sk', lv ? '' : 'off', lock ? 'locked' : '', can ? 'can' : '', n === skillSel ? 'sel' : '', selReq.has(n) ? 'req' : '', selDep.has(n) ? 'dep' : ''].join(' ');
    const tip = `${skName(n)}` + (lv ? `\nLv ${lv} / ${max}` : can ? '\nคลิกเพื่อเรียน' : '') + (why && lv < max && !lv ? `\n${why}` : '');
    const short = skName(n).length > 9 ? skName(n).slice(0, 8) + '...' : skName(n);
    h += `<div class="${cls}" data-n="${n}" data-tip="${esc(tip)}"><span class="nm">${esc(short)}</span><span class="icw">${iconS(n)}</span>
      ${lv ? `<span class="lv"><button data-d="${n}">◀</button><b>${lv} / ${max}</b><button data-u="${n}" ${why ? 'disabled' : ''}>▶</button></span>` : ''}</div>`;
  }
  $('skillGrid').innerHTML = h;
  const used = (t) => t.skills.reduce((a, [n]) => a + (S.skills[n] || 0), 0);
  const left = tier.points - used(tier);
  $('skillPoint').innerHTML = `SkillPoint : <b class="${left < 0 ? 'bad' : ''}">${left}</b> <span class="muted">/ ${tier.points} (${esc(tier.label)})</span>`;
  $('jobSprite').src = `../costume/thumbs/job/${S.jobId}.png`;
  renderSkillInfo();
}
$('jobSprite').onerror = () => { $('jobSprite').style.visibility = 'hidden'; };
$('jobSprite').onload = () => { $('jobSprite').style.visibility = ''; };
$('skillTabs').onclick = (e) => { const k = e.target.dataset.k; if (k) { S.ui.skillTier = k; skillSel = null; renderSkills(); save(); } };
$('skillGrid').onclick = (e) => {
  const { u, d } = e.target.dataset;
  if (u) {
    if (!learnWithPrereqs(u, (S.skills[u] || 0) + 1)) return;
  } else if (d) {
    const deps = dependents(d);
    if (deps.length) { skillMsg('ลดไม่ได้: ' + deps.map(skName).join(', ') + ' ต้องใช้สกิลนี้อยู่'); return; }
    setSkill(d, (S.skills[d] || 0) - 1); skillSel = d;
  } else {
    const card = e.target.closest('.sk');
    if (!card) return;
    const n = card.dataset.n;
    // every click on the icon raises the skill by 1 (prerequisites first), like clicking in the game's skill window
    if (learnWithPrereqs(n, (S.skills[n] || 0) + 1)) refresh();
    return;
  }
  refresh();
};
function skillMsg(t) { $('skillPoint').innerHTML = `<span class="bad">${esc(t)}</span>`; flash($('skillPoint')); setTimeout(renderSkills, 2500); }
$('skillMax').onclick = () => {
  const t = curTier();
  if (!t) return;
  let again = true;
  while (again) { again = false; for (const [n] of t.skills) while (!blockReason(n)) { setSkill(n, (S.skills[n] || 0) + 1); again = true; } }
  refresh();
};
function flash(el) { el.animate([{ background: '#ffd4d4' }, { background: 'transparent' }], { duration: 600 }); }
$('skillReset').onclick = () => { if (!curTier()) return; curTier().skills.forEach(([n]) => delete S.skills[n]); pruneSkills(); refresh(); };
$('siClose').onclick = () => { $('wSkillInfo').hidden = true; skillSel = null; renderSkills(); };
// drag the description window by its title bar
(() => {
  const w = $('wSkillInfo'), h = w.querySelector('h2');
  h.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = w.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (ev) => { w.style.left = (ev.clientX - dx) / ZOOM + 'px'; w.style.top = (ev.clientY - dy) / ZOOM + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
})();

// ---- skill details: description built from skill_db, per-level cast / delay / cooldown / SP, and this build's numbers
const ELE_TH = { Neutral: 'ไม่มีธาตุ', Water: 'น้ำ', Earth: 'ดิน', Fire: 'ไฟ', Wind: 'ลม', Poison: 'พิษ', Holy: 'ศักดิ์สิทธิ์', Dark: 'มืด',
  Ghost: 'วิญญาณ', Undead: 'อมตะ', Weapon: 'ตามอาวุธ', Endowed: 'ตามธาตุที่เคลือบ', Random: 'สุ่ม' };
const lvv = (v, lv) => (Array.isArray(v) ? v[Math.min(lv, v.length) - 1] : v);
const sec = (ms) => (ms == null ? '-' : `${+(ms / 1000).toFixed(2)} วิ`);
function renderSkillInfo() {
  const box = $('skillInfo');
  const n = skillSel, info = SKILLINFO[n], d = skillDef(n);
  if (!n || !info) { $('wSkillInfo').hidden = true; return; }
  $('siTitle').textContent = info.name;
  const granted = build.equip.grantedSkills?.[n];
  const learned = Math.max(S.skills[n] || 0, granted?.lv || 0), show = Math.max(1, learned);
  const r = build.status;
  const parts = [];
  parts.push(`<div class="head">${iconS(n)}<b>${esc(info.name)}</b> <span class="muted">(${n} · Lv ${learned} / ${info.maxLv})</span></div>`);
  const desc = [];
  desc.push(`ประเภท: ${KIND[info.target] || info.target}${info.type ? ` · ${info.type === 'Weapon' ? 'กายภาพ' : info.type === 'Magic' ? 'เวทมนตร์' : info.type}` : ''}`);
  if (info.ele && info.type && !(info.flags || []).includes('NoDamage')) desc.push(`ธาตุ: ${esc(ELE_TH[lvv(info.ele, show)] || lvv(info.ele, show))}`);
  if (info.range) desc.push(`ระยะ: ${Math.abs(lvv(info.range, show))} ช่อง`);
  if (info.area) desc.push(`พื้นที่: ${lvv(info.area, show) * 2 + 1}×${lvv(info.area, show) * 2 + 1}`);
  if (info.weapons) desc.push(`อาวุธที่ใช้ได้: ${info.weapons.join(', ')}`);
  if (info.spheres) desc.push(`ใช้ Spirit Sphere ${lvv(info.spheres, show)} ลูก`);
  if (info.items) desc.push('ไอเท็มที่ใช้: ' + info.items.map(([it, a, l]) => `${esc(it)} ×${a}${l ? ` (Lv${l})` : ''}`).join(', '));
  if (granted && !S.skills[n]) desc.push(`<span class="good">ได้จากอุปกรณ์: ${esc(granted.source)} (Lv ${granted.lv})</span>`);
  if (d?.[2]?.length) desc.push('ต้องเรียนก่อน: ' + d[2].map(([q, ql]) => `<span class="${(S.skills[q] || 0) >= ql ? 'good' : 'bad'}">${esc(skName(q))} Lv${ql}</span>`).join(', '));
  if (d?.[3]) desc.push(`ต้องมี Job Lv ${d[3]}`);
  // this build: what the skill does now (buff values or damage)
  let now = '';
  const sc = db.sc.buffs?.[n];
  if (sc) {
    const act = build.buffs.active[sc.sc];
    now = act ? `บัพทำงานอยู่ (Lv${act.val1})` : (learned ? 'เปิดบัพนี้ได้ในหน้าต่าง บัพ' : '');
  }
  if (db.skills.skills[n] && info.type && !(info.flags || []).includes('NoDamage') && learned) {
    try {
      const dm = calculateDamage(db, build, { mobId: S.mobId, skill: n, level: learned, debuffs: S.debuffs });
      now = `ใส่ ${esc(db.mobs[S.mobId]?.name || '')}: ratio ${dm.ratio}% · ดาเมจเฉลี่ย <b>${Math.round(dm.avg).toLocaleString()}</b>` +
        (dm.cast ? ` · ร่ายจริง ${sec(dm.cast.castTime)} · ดีเลย์จริง ${sec(dm.cast.delay)}` : '');
    } catch { /* not calculable */ }
  }
  // per-level table
  const cols = [['sp', 'SP'], ['cast', 'ร่าย (แปรผัน)'], ['fixedCast', 'ร่าย (คงที่)'], ['delay', 'ดีเลย์'], ['cooldown', 'คูลดาวน์'],
    ['duration', 'ระยะเวลา'], ['hits', 'Hit']].filter(([k]) => info[k] != null);
  const vct = 1 - Math.min(1, Math.sqrt(Math.max(0, r.total.dex * 2 + r.total.int) / 530));
  const varRate = 1 - Math.min(100, -(r.variableCastRate || 0)) / 100;
  const fixRate = 1 - Math.min(100, -(r.fixedCastRate || 0)) / 100;
  const real = (lv) => {
    const c = lvv(info.cast, lv) || 0, f = Math.max(0, (lvv(info.fixedCast, lv) || 0) + (r.fixedCast || 0));
    return Math.max(0, Math.trunc(c * (info.castIgnoreDex ? 1 : vct) * varRate)) + Math.trunc(f * fixRate);
  };
  const fmt = (k, v) => (v == null ? '-' : ['cast', 'fixedCast', 'delay', 'cooldown', 'duration'].includes(k) ? sec(v) : Math.abs(v));
  const rows = Array.from({ length: info.maxLv }, (_, i) => i + 1).map((lv) => `<tr class="${lv === learned ? 'cur' : ''}"><td>${lv}</td>` +
    cols.map(([k]) => `<td>${fmt(k, lvv(info[k], lv))}</td>`).join('') + (info.cast || info.fixedCast ? `<td>${sec(real(lv))}</td>` : '') + '</tr>').join('');
  box.innerHTML = `<div>${parts.join('')}</div><div class="desc2">${desc.join('<br>')}</div>${now ? `<div class="now">${now}</div>` : ''}
    ${cols.length ? `<table class="lvtab"><tr><th>Lv</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}${info.cast || info.fixedCast ? '<th>ร่ายจริง*</th>' : ''}</tr>${rows}</table>
    ${info.cast || info.fixedCast ? '<p class="muted">* ร่ายจริงของตัวละครนี้: DEX/INT + ลดร่ายจากอุปกรณ์ (ไม่รวมบัพ)</p>' : ''}` : ''}`;
}

// ------------------------------------------------------------------ 2. status (client layout)
function renderStatus() {
  const r = build.status, eq = build.equip.status;
  const st = (k, base, total, cost, kind) => `<div class="st"><span class="k">${k[0].toUpperCase() + k.slice(1)}</span>
    <span class="b"><input type="number" data-${kind}="${k}" value="${base}" min="${kind === 'st' ? 1 : 0}"><span class="plus">${total - base ? (total - base > 0 ? '+' : '') + (total - base) : ''}</span></span>
    <button data-${kind}up="${k}" ${cost == null ? 'disabled' : ''}>▲</button><span class="c">${cost ?? ''}</span></div>`;
  const v = (k, x) => `<div class="v"><span>${k}</span><span>${x}</span></div>`;
  const atkR = (eq.weaponAtk || 0) + (eq.refineAtk || 0) + (eq.equipAtk || 0);
  const matkR = (eq.weaponMatk || 0) + (eq.refineMatk || 0) + (eq.equipMatk || 0);
  $('statusBox').innerHTML = `<div>${STATS.map((k) => st(k, r.base[k], r.total[k], r.nextCost[k], 'st')).join('')}</div>
    <div class="vals">${v('Atk', `${r.atk} + ${atkR}`)}${v('Def', `${r.hardDef} + ${r.def}`)}${v('Matk', `${r.matk} + ${matkR}`)}${v('Mdef', `${r.hardMdef} + ${r.mdef}`)}
    ${v('Hit', r.hit)}${v('Flee', `${r.flee} + ${r.perfectDodge}`)}${v('Critical', r.crit)}${v('Aspd', r.aspd)}
    ${v('Status Point', `<b class="${r.points.left < 0 ? 'bad' : ''}">${r.points.left}</b>`)}</div>`;
  const traits = (r.traitPoints?.total || 0) > 0;
  $('traitBox').innerHTML = traits ? `<div>${TRAITS.map((k) => st(k, S.trait[k] || 0, r.total[k] ?? (S.trait[k] || 0), 1, 'tr')).join('')}</div>
    <div class="vals">${v('P.Atk', r.patk)}${v('Res', r.res)}${v('S.Matk', r.smatk)}${v('Mres', r.mres)}${v('H.Plus', r.hplus)}<div></div>${v('C.Rate', r.crate)}<div></div>
    ${v('T.Status Point', `<b class="${(r.traitPoints?.left || 0) < 0 ? 'bad' : ''}">${r.traitPoints?.left ?? 0}</b>`)}</div>`
    : '<p class="muted" style="padding:3px 6px;margin:0;grid-column:1/-1">มีเฉพาะอาชีพขั้น 4</p>';
  $('hpsp').innerHTML = `<span>HP <b>${r.hp.toLocaleString()}</b></span><span>SP <b>${r.sp.toLocaleString()}</b></span>` +
    `<span class="muted">Weight ${r.weight}</span>`;
}
const statInput = (e) => {
  const { st, tr, stup, trup } = e.target.dataset;
  if (st) S.base[st] = Math.min(statMax(), Math.max(1, Number(e.target.value) || 1));
  else if (tr) S.trait[tr] = Math.min(TRAIT_MAX, Math.max(0, Number(e.target.value) || 0));
  else if (stup) S.base[stup] = Math.min(statMax(), S.base[stup] + 1);
  else if (trup) S.trait[trup] = Math.min(TRAIT_MAX, (S.trait[trup] || 0) + 1);
  else return;
  refresh();
};
// ---- chat-style status commands, like the client: /str+ 130 · /int- 10 · /reset
const TRAIT_MAX = db.status.maxTrait || 110;
const statMax = () => Math.min(130, build.status.job.maxStat || 130);
function runStatCommand(line) {
  const out = [];
  for (const raw of line.split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
    if (/^\/reset$/i.test(raw)) {
      STATS.forEach((k) => { S.base[k] = 1; }); TRAITS.forEach((k) => { S.trait[k] = 0; });
      out.push(['Status และ Advanced Status ถูก reset แล้ว']); continue;
    }
    const m = /^\/(str|agi|vit|int|dex|luk|pow|sta|wis|spl|con|crt)\s*([+-])\s*(\d*)$/i.exec(raw);
    if (!m) { out.push([`ไม่รู้จักคำสั่ง: ${raw}`, 1]); continue; }
    const k = m[1].toLowerCase(), plus = m[2] === '+', n = m[3] === '' ? 1 : Number(m[3]);
    const isTrait = TRAITS.includes(k);
    if (isTrait && !((build.status.traitPoints?.total || 0) > 0)) { out.push([`${k.toUpperCase()}: มีเฉพาะอาชีพขั้น 4`, 1]); continue; }
    const cur = isTrait ? (S.trait[k] || 0) : S.base[k];
    const lo = isTrait ? 0 : 1, hi = isTrait ? TRAIT_MAX : statMax();
    let v = cur;
    if (!plus) v = Math.max(lo, cur - n);
    else {
      // like the client: raise one point at a time while there are status points left
      let left = isTrait ? (build.status.traitPoints?.left ?? 0) : build.status.points.left;
      while (v < hi && v - cur < n) {
        const c = isTrait ? 1 : statCost(v);
        if (c > left) break;
        left -= c; v++;
      }
    }
    if (isTrait) S.trait[k] = v; else S.base[k] = v;
    const note = plus && v - cur < n ? (v >= hi ? ` (สูงสุด ${hi})` : ' (Status Point ไม่พอ)') : (!plus && cur - v < n ? ` (ต่ำสุด ${lo})` : '');
    out.push([`${k.toUpperCase()} ${cur} → ${v}${note}`, note && v === cur ? 1 : 0]);
    refresh();                                        // later commands of the same line see the new points
  }
  refresh();
  $('stCmdLog').innerHTML = out.map(([t, bad]) => `<div class="${bad ? 'bad' : ''}">${esc(t)}</div>`).join('') + $('stCmdLog').innerHTML;
}
const cmdHist = [];
let cmdPos = 0;
$('stCmd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const v = $('stCmd').value.trim(); if (v) { runStatCommand(v); cmdHist.push(v); cmdPos = cmdHist.length; } $('stCmd').value = ''; }
  else if (e.key === 'ArrowUp' && cmdPos > 0) { $('stCmd').value = cmdHist[--cmdPos]; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { cmdPos = Math.min(cmdHist.length, cmdPos + 1); $('stCmd').value = cmdHist[cmdPos] || ''; }
});
$('stCmdGo').onclick = () => { const v = $('stCmd').value.trim(); if (v) runStatCommand(v); $('stCmd').value = ''; };
$('statusBox').onchange = statInput; $('statusBox').onclick = (e) => e.target.tagName === 'BUTTON' && statInput(e);
$('traitBox').onchange = statInput; $('traitBox').onclick = (e) => e.target.tagName === 'BUTTON' && statInput(e);

// ------------------------------------------------------------------ 3. equipment (slots left / character / slots right)
const EQ_LAYOUT = {     // [slot, label, column (1 left / 2 middle / 3 right), row]
  general: [['headTop', 'head', 1, 1], ['headMid', 'head', 3, 1], ['headLow', 'head', 1, 2], ['armor', 'body', 3, 2],
    ['weapon', 'R-hand', 1, 3], ['shield', 'L-hand', 3, 3], ['garment', 'robe', 1, 4], ['shoes', 'shoes', 3, 4],
    ['accR', 'accessory', 1, 5], ['ammo', 'ammo', 2, 5], ['accL', 'accessory', 3, 5]],
  special: [['costumeTop', 'head', 1, 1], ['costumeMid', 'head', 3, 1], ['costumeLow', 'head', 1, 2], ['shadowArmor', 'armor', 3, 2],
    ['shadowWeapon', 'weapon', 1, 3], ['shadowShield', 'shield', 3, 3], ['costumeGarment', 'robe', 1, 4], ['shadowShoes', 'shoes', 3, 4],
    ['shadowAccR', 'accessory', 1, 5], ['shadowAccL', 'accessory', 3, 5]],
};
const fits = (it, slot) => it && it.loc.some((l) => SLOTS[slot].loc.includes(l));
function itemLabel(x) {
  const it = db.equip.items[x.id];
  if (!it) return `#${x.id}`;
  return `${x.refine ? '+' + x.refine + ' ' : ''}${it.name}${x.grade ? ` [${GRADES[x.grade]}]` : ''}${it.slots ? ` [${it.slots}]` : ''}`;
}
// ---- random options ("ออฟ") from the server's option groups (data/randomopt.json, tools/build_randomopt.py)
/** script of one chosen option: { o: 'VAR_ATKPERCENT', v: 5 } */
function roScript(o) {
  if (o?.o) { const src = RANDOPT.options[o.o]; return src ? src.replace(/getrandomoptinfo\(ROA_VALUE\)/g, String(o.v)) : null; }
  return optionScript(o);                                   // older saves (free options)
}
function roLabel(o) {
  if (!o?.o) return OPTIONS[o?.k]?.label(o) || '';
  const src = RANDOPT.options[o.o] || '';
  const m = /bonus\d?\s+(\w+)(?:,([^,;]+))?,getrandomoptinfo/.exec(src);
  if (m) { const l = labelOf(m[1] + (m[2] ? ':' + m[2] : ''), o.v, db); if (l) return `${l.text} ${l.v}`.trim(); }
  const fx = /bonus\s+b(Atk|Def)Ele,Ele_(\w+);/.exec(src);
  if (fx) return `${fx[1] === 'Atk' ? 'ธาตุอาวุธ' : 'ธาตุเกราะ'}: ${fx[2]}`;
  if (/^ATTR_TOLERACE_ALLBUTNOTHING$/.test(o.o)) return `ลด Damage จากทุกธาตุ (ยกเว้น Neutral) ${o.v}%`;
  return `${o.o.replace(/_/g, ' ').toLowerCase()} ${o.v}`;
}
const roGroups = (id) => (RANDOPT.items[id] || []).filter((g) => RANDOPT.groups[g]);
function itemSub(x) {
  const n = (id) => db.equip.items[id]?.name || id;
  return [...x.cards.filter(Boolean).map(n), ...x.enchants.filter(Boolean).map(n), ...x.options.map(roLabel).filter(Boolean)].join(', ');
}
function renderEquip() {
  document.querySelectorAll('#equipTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.ui.equipTab));
  if (!EQ_LAYOUT[S.ui.equipTab]) S.ui.equipTab = 'general';
  const list = EQ_LAYOUT[S.ui.equipTab];
  const lk = S.ui.look;
  let h = `<div class="char"><canvas id="charCv" hidden></canvas><img id="charImg" src="../costume/thumbs/job/${S.jobId}.png" alt="" onerror="this.style.visibility='hidden'"></div>
    <div class="look"><select data-look="gender" title="เพศ"><option value="1"${lk.gender === 1 ? ' selected' : ''}>ชาย</option><option value="0"${lk.gender === 0 ? ' selected' : ''}>หญิง</option></select>
    <select data-look="hair" title="ทรงผม"></select><select data-look="color" title="สีผม"></select></div>`;
  list.forEach(([slot, lab, col, row]) => {
    const x = invItem(S.equipped[slot]);
    const right = col === 3;
    const style = `grid-column:${col};grid-row:${row}`;
    const lockR = x ? itemUsableBy(db.equip, db.equip.items[x.id], build.classId, build.status.baseLv) : { ok: true };
    h += `<div class="slot${right ? ' r' : ''}${col === 2 ? ' mid' : ''}${x ? '' : ' empty'}${lockR.ok ? '' : ' lock'}" style="${style}" data-slot="${slot}">
      ${x ? iconI(x.id) : ''}<span class="n">${x ? esc(itemLabel(x)) : lab}</span></div>`;
  });
  $('equipGrid').innerHTML = h;
  drawSprite();
}
// ---- character sprite with the worn headgears / garment (sim/sprite.js)
async function drawSprite() {
  const lk = S.ui.look, cv = $('charCv');
  if (!cv) return;
  const styles = await hairStyles(lk.gender);
  if (styles.length) {
    if (!styles.some((x) => x[0] === lk.hair)) lk.hair = styles[0][0];
    const pals = styles.find((x) => x[0] === lk.hair)[1];
    if (!pals.some((p) => p[0] === lk.color)) lk.color = pals[0]?.[0] ?? 0;
    const hs = document.querySelector('#equipGrid [data-look=hair]'), cs = document.querySelector('#equipGrid [data-look=color]');
    if (hs) hs.innerHTML = styles.map(([n]) => `<option value="${n}"${n === lk.hair ? ' selected' : ''}>ผม ${n}</option>`).join('');
    if (cs) cs.innerHTML = pals.map(([n]) => `<option value="${n}"${n === lk.color ? ' selected' : ''}>สี ${n}</option>`).join('');
  }
  const worn = {};
  for (const [slot, uid] of Object.entries(S.equipped)) { const x = invItem(uid); if (x) worn[slot] = x.id; }
  drawCharacter(cv, S.jobId, worn, lk, (ok) => {
    if (!ok || !cv.isConnected) return;
    cv.hidden = false; const img = $('charImg'); if (img) img.hidden = true;
  });
}
$('equipGrid').onchange = (e) => {
  const k = e.target.dataset.look;
  if (k) { S.ui.look[k] = +e.target.value; save(); drawSprite(); }
};
$('equipTabs').onclick = (e) => { const t = e.target.dataset.t; if (t) { S.ui.equipTab = t; renderEquip(); save(); } };
$('equipGrid').onclick = (e) => { const el = e.target.closest('.slot'); if (el && !S.equipped[el.dataset.slot]) pickForSlot(el.dataset.slot); };
$('equipGrid').ondblclick = (e) => {
  const el = e.target.closest('.slot');
  if (el && S.equipped[el.dataset.slot]) { delete S.equipped[el.dataset.slot]; refresh(); }
};
function pickForSlot(slot) {
  const rows = S.inventory.filter((x) => fits(db.equip.items[x.id], slot)).map((x) => {
    const u = itemUsableBy(db.equip, db.equip.items[x.id], build.classId, build.status.baseLv);
    return `<div class="it${u.ok ? '' : ' off'}${S.equipped[slot] === x.uid ? ' eq' : ''}">${iconI(x.id)}<span class="nm">${esc(itemLabel(x))}
      <div class="sub">${esc(itemSub(x))}${u.ok ? '' : ` · <span class="bad">${esc(u.reason)}</span>`}</div></span>
      <button data-wear="${x.uid}" ${u.ok ? '' : 'disabled'}>สวมใส่</button></div>`;
  }).join('') || '<p class="muted">ยังไม่มีไอเท็มที่ใส่ช่องนี้ได้ใน Inventory — สร้างได้ที่ Equipment Craft</p>';
  openModal(`เลือกไอเท็ม: ${slot}`, `${S.equipped[slot] ? '<p><button data-off="1">ถอดออก</button></p>' : ''}${rows}`, (e) => {
    if (e.target.dataset.off) { delete S.equipped[slot]; closeModal(); refresh(); }
    const uid = e.target.dataset.wear;
    if (uid) { wear(uid, slot); closeModal(); refresh(); }
  });
}
function wear(uid, slot) {
  for (const [s, u] of Object.entries(S.equipped)) if (u === uid) delete S.equipped[s];
  S.equipped[slot] = uid;
  const it = db.equip.items[invItem(uid).id];
  if (slot === 'weapon' && it.loc.includes('Both_Hand') && S.equipped.shield) {
    const sh = db.equip.items[invItem(S.equipped.shield)?.id];
    if (sh?.type !== 'Weapon') delete S.equipped.shield;      // two-handed weapon: no shield
  }
}

// ------------------------------------------------------------------ 4. equipment status
function renderEqStat() {
  $('eqStatTabs').innerHTML = STAT_TABS.map(([k, lab]) => `<button data-k="${k}" class="${k === S.ui.eqTab ? 'on' : ''}">${lab}</button>`).join('');
  const T = build.equip.totals || {};
  const rows = [];
  for (const [key, v] of Object.entries(T)) {
    if (S.ui.eqTab !== 'all' && categoryOf(key) !== S.ui.eqTab) continue;
    const l = labelOf(key, v, db);
    if (l) rows.push(l);
  }
  rows.sort((a, b) => a.order - b.order || a.text.localeCompare(b.text));
  for (const [sk, x] of Object.entries(build.equip.grantedSkills || {})) rows.push({ v: 'Lv' + x.lv, text: `ใช้สกิล ${skName(sk)} ได้` });
  while (rows.length < 18) rows.push({ v: '', text: '' });
  $('eqStatList').innerHTML = rows.map((r) => `<div class="r" data-tip="${esc(r.text)}"><span class="v">${esc(r.v)}</span><span class="t">${esc(r.text)}</span></div>`).join('');
}
$('eqStatTabs').onclick = (e) => { const k = e.target.dataset.k; if (k) { S.ui.eqTab = k; renderEqStat(); save(); } };

// ------------------------------------------------------------------ 5. inventory (icon grid)
let invSearch = '';
const SC_NAME = {};
for (const b of Object.values(db.sc.buffs || {})) if (b.sc && !SC_NAME[b.sc]) SC_NAME[b.sc] = b.name;
const scLabel = (g) => SC_NAME[g] || String(g).replace(/^SC_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const fill = (h, n) => h + '<div class="ii blank"></div>'.repeat(Math.max(0, 56 - n) + (7 - (Math.max(n, 56) % 7)) % 7);
function renderInv() {
  document.querySelectorAll('#invTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.ui.invTab));
  const q = invSearch.toLowerCase();
  if (S.ui.invTab === 'cons') {
    $('invTools').innerHTML = `<input id="invQ" placeholder="ค้นหา…" value="${esc(invSearch)}">
      <label class="chk" data-tip="แสดงไอเท็มที่อาชีพนี้ใช้ไม่ได้ด้วย"><input type="checkbox" id="invAll" ${S.ui.invAll ? 'checked' : ''}> ทั้งหมด</label>`;
    const on = new Set(S.consumables);
    const replaced = new Set(build.consumables?.replaced || []);
    const list = consumableAvailability(db, build).filter((c) => (on.has(c.id) || ((S.ui.invAll || c.usable) && c.inGame)) &&
      (!q || c.name.toLowerCase().includes(q) || String(c.id) === q));
    list.sort((a, b) => a.id - b.id);   // by item id
    const h = list.map((c) => `<div class="ii${on.has(c.id) ? ' on' : ''}${c.usable ? '' : ' off'}${replaced.has(c.id) ? ' weak' : ''}" data-cons="${c.id}">${iconI(c.id)}</div>`).join('');
    $('invList').innerHTML = fill(h, list.length);
    $('invFoot').innerHTML = `<span>ใช้อยู่ ${S.consumables.length}</span><span class="grow"></span><button id="consClear">เลิกใช้ทั้งหมด</button>`;
  } else {
    $('invTools').innerHTML = `<input id="invQ" placeholder="ค้นหา…" value="${esc(invSearch)}">`;
    const worn = new Set(Object.values(S.equipped));
    // worn pieces leave the inventory (like in the game) and come back when taken off
    const list = S.inventory.filter((x) => !worn.has(x.uid) && (!q || itemLabel(x).toLowerCase().includes(q)))
      .sort((a, b) => a.id - b.id || (b.refine || 0) - (a.refine || 0));
    const h = list.map((x) => { const u = itemUsableBy(db.equip, db.equip.items[x.id], build.classId, build.status.baseLv);
      return `<div class="ii${worn.has(x.uid) ? ' eq' : ''}${u.ok ? '' : ' off'}" data-inv="${x.uid}">${iconI(x.id)}${x.refine ? `<span class="cnt">+${x.refine}</span>` : ''}</div>`; }).join('');
    $('invList').innerHTML = fill(h, list.length);
    $('invFoot').innerHTML = `<span>${S.inventory.length}/${MAX_INV}</span><span class="grow"></span><button id="invNew">+ คราฟใหม่</button>`;
  }
}
$('invTabs').onclick = (e) => { const t = e.target.dataset.t; if (t) { S.ui.invTab = t; invSearch = ''; renderInv(); save(); } };
$('wInv').addEventListener('input', (e) => { if (e.target.id === 'invQ') { invSearch = e.target.value; const p = e.target.selectionStart; renderInv(); $('invQ').focus(); $('invQ').setSelectionRange(p, p); } });
$('wInv').addEventListener('change', (e) => { if (e.target.id === 'invAll') { S.ui.invAll = e.target.checked; renderInv(); save(); } });
$('wInv').addEventListener('click', (e) => {
  if (e.target.id === 'consClear') { S.consumables = []; refresh(); return; }
  if (e.target.id === 'invNew') { editing = newDraft(); renderCraft(); $('cQ')?.focus(); return; }
  const el = e.target.closest('[data-cons],[data-inv]');
  if (el) { document.querySelectorAll('#invList .ii.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); }
});
// double click: use a consumable (again = stop using) / wear or take off equipment, like the client
$('wInv').addEventListener('dblclick', (e) => {
  const c = e.target.closest('[data-cons]');
  if (c) { toggleCons(Number(c.dataset.cons)); return; }
  const it = e.target.closest('[data-inv]');
  if (it) toggleWear(it.dataset.inv);
});
function toggleCons(id) {
  if (S.consumables.includes(id)) S.consumables = S.consumables.filter((x) => x !== id);
  else { S.consumables = [...S.consumables, id]; turnOffClashing({ cons: id }); }
  refresh();
}
// ---- buffs that cannot be on together (data/scconflict.json from status.yml EndOnStart / Fail): the one turned on last wins
const ELEMENT_SC = new Set(['SC_ENCHANTARMS', 'SC_ENCPOISON', 'SC_ASPERSIO', 'SC_FIREWEAPON', 'SC_WATERWEAPON', 'SC_WINDWEAPON',
  'SC_EARTHWEAPON', 'SC_SHADOWWEAPON', 'SC_GHOSTWEAPON']);              // weapon element: converters, Endow, Enchant Poison, Aspersio
const scOfBuff = (id) => db.sc?.buffs?.[id]?.sc;
const scsOfCons = (id) => [...new Set((db.consumables[id]?.effects || [])
  .flatMap((e) => [e.group, e.buff && scOfBuff(e.buff)]).filter((x) => typeof x === 'string' && x.startsWith('SC_')))];
const ends = (a, b) => SCX[a]?.end?.includes(b) || SCX[a]?.fail?.includes(b);
/** a / b: SC names; same = the same status from a skill and something else (Kyrie / Praefatio, Blessing / Moon Cookie) */
const clash = (a, b, same) => (a === b ? same || ends(a, a) : ends(a, b) || ends(b, a) || (ELEMENT_SC.has(a) && ELEMENT_SC.has(b)));
function turnOffClashing(on) {
  const mine = on.buff ? [scOfBuff(on.buff)].filter(Boolean) : scsOfCons(on.cons);
  if (!mine.length) return;
  const off = [];
  for (const id of Object.keys(S.buffs)) {
    if (id === on.buff) continue;
    const sc = scOfBuff(id);
    if (sc && mine.some((m) => clash(m, sc, true))) { delete S.buffs[id]; off.push(db.sc.buffs[id]?.name || id); }
  }
  S.consumables = S.consumables.filter((id) => {
    if (id === on.cons) return true;
    const hit = scsOfCons(id).some((sc) => mine.some((m) => clash(m, sc, !!on.buff)));
    if (hit) off.push(db.consumables[id]?.name || id);
    return !hit;
  });
  if (off.length) toast(`ปิด ${off.join(', ')} (ใช้ร่วมกันไม่ได้)`);
}
let toastT = 0;
function toast(msg) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3500);
}
function toggleWear(uidv) {
  const x = invItem(uidv), it = db.equip.items[x.id];
  const worn = Object.entries(S.equipped).find(([, u]) => u === x.uid);
  if (worn) { delete S.equipped[worn[0]]; refresh(); return; }
  const u = itemUsableBy(db.equip, it, build.classId, build.status.baseLv);
  if (!u.ok) { notice(`ใส่ไม่ได้: ${itemLabel(x)} (${u.reason})`); return; }
  const slots = Object.keys(SLOTS).filter((s2) => fits(it, s2));
  const slot = slots.find((s2) => !S.equipped[s2]) || slots[0];
  if (!slot) { notice('ไม่มีช่องที่ใส่ไอเท็มนี้ได้'); return; }
  wear(x.uid, slot); refresh();
}
function itemMenu(uidv) {
  const x = invItem(uidv);
  const worn = Object.entries(S.equipped).find(([, u]) => u === x.uid);
  const it = db.equip.items[x.id];
  const u = itemUsableBy(db.equip, it, build.classId, build.status.baseLv);
  openModal(itemLabel(x), `<div class="it">${iconI(x.id)}<span class="nm">${esc(itemLabel(x))}<div class="sub">${esc(itemSub(x))}${u.ok ? '' : ` · <span class="bad">${esc(u.reason)}</span>`}</div></span></div>
    <p><button data-a="wear" ${u.ok || worn ? '' : 'disabled'}>${worn ? 'ถอด' : 'สวมใส่'}</button> <button data-a="edit">แก้ไข</button>
    <button data-a="dup">คัดลอก</button> <button data-a="del" class="danger">ลบ</button></p>`, (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    closeModal();
    if (a === 'wear') {
      if (worn) delete S.equipped[worn[0]];
      else {
        const slots = Object.keys(SLOTS).filter((s) => fits(it, s));
        const slot = slots.find((s) => !S.equipped[s]) || slots[0];
        if (!slot) return alert('ไม่มีช่องที่ใส่ไอเท็มนี้ได้');
        wear(x.uid, slot);
      }
    }
    if (a === 'edit') { editing = structuredClone(x); renderCraft(); $('wCraft').scrollIntoView({ behavior: 'smooth' }); return; }
    if (a === 'dup') {
      if (S.inventory.length >= MAX_INV) return alert(`ช่องเก็บของเต็ม (${MAX_INV})`);
      S.inventory.splice(S.inventory.indexOf(x) + 1, 0, { ...structuredClone(x), uid: uid() });
    }
    if (a === 'del') {
      if (!confirm(`ลบ ${itemLabel(x)} ?`)) return;
      S.inventory = S.inventory.filter((y) => y !== x);
      for (const [s2, u2] of Object.entries(S.equipped)) if (u2 === x.uid) delete S.equipped[s2];
      if (editing?.uid === x.uid) editing = null;
    }
    refresh();
  });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// tooltips (like the client's hover boxes)
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tip]');
  const tip = $('tip');
  if (!el || !el.dataset.tip) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const r = el.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 330, r.right + 6) / ZOOM + 'px'; tip.style.top = Math.max(4, r.top) / ZOOM + 'px';
});

// ------------------------------------------------------------------ 6. craft
const EQUIP_TYPES = new Set(['Weapon', 'Armor', 'ShadowGear', 'Ammo']);
const equipList = Object.entries(db.equip.items).filter(([, it]) => EQUIP_TYPES.has(it.type) && it.loc?.length)
  .map(([id, it]) => ({ id: Number(id), name: it.name, lc: it.name.toLowerCase() }));
const enchantList = Object.entries(db.equip.items).filter(([, it]) => it.type === 'Card' && (it.sub === 'Enchant' || !it.loc?.length))
  .map(([id, it]) => `${it.name} [${id}]`);
/** item_db Jobs / Classes / level as text */
function reqText(it) {
  const parts = [];
  if (Array.isArray(it.jobs)) parts.push('อาชีพ: ' + it.jobs.join(', '));
  else if (it.jobs?.all && it.jobs.except?.length) parts.push('ทุกอาชีพ ยกเว้น ' + it.jobs.except.join(', '));
  else parts.push('ทุกอาชีพ');
  if (it.classes) parts.push('คลาส: ' + it.classes.join(', '));
  if (it.elv) parts.push(`Base Lv ${it.elv}${it.elvMax ? '–' + it.elvMax : ''} ขึ้นไป`.replace(' ขึ้นไป', it.elvMax ? '' : ' ขึ้นไป'));
  return parts.join(' · ');
}
const newDraft = () => ({ uid: null, id: null, refine: 0, grade: 0, cards: [], enchants: [], options: [] });
let craftQ = '';
const slotOfItem = (it) => Object.keys(SLOTS).find((s) => fits(it, s));
const idFromText = (t) => { const m = /\[(\d+)\]\s*$/.exec(t || ''); return m ? Number(m[1]) : null; };
function renderCraft() {
  if (!editing) editing = newDraft();
  $('craftTitle').textContent = editing.uid ? 'Equipment Craft — แก้ไข' : 'Equipment Craft';
  const it = editing.id ? db.equip.items[editing.id] : null;
  const q = craftQ.toLowerCase();
  const usable = (id) => itemUsableBy(db.equip, db.equip.items[id], build.classId, build.status.baseLv);
  const res = q.length >= 2 ? equipList.filter((x) => (x.lc.includes(q) || String(x.id) === q) && (S.ui.craftAll || usable(x.id).ok)).slice(0, 80) : [];
  let h = `<div class="row"><span>ไอเท็ม</span><input class="wide" id="cQ" placeholder="พิมพ์ชื่อหรือ ID อย่างน้อย 2 ตัวอักษร" value="${esc(craftQ)}">
    <label class="chk" data-tip="แสดงไอเท็มที่อาชีพ / เลเวลนี้ใส่ไม่ได้ด้วย (คราฟเก็บไว้ได้ แต่ใส่ไม่ได้)"><input type="checkbox" id="cAll" ${S.ui.craftAll ? 'checked' : ''}> ทุกอาชีพ</label></div>`;
  if (q.length >= 2) h += `<div class="results" id="cRes">${res.map((x) => { const u = usable(x.id); return `<div data-pick="${x.id}" class="${x.id === editing.id ? 'sel' : ''}${u.ok ? '' : ' off'}">${iconI(x.id)}${esc(x.name)} <span class="muted">#${x.id}${db.equip.items[x.id].elv ? ' · Lv' + db.equip.items[x.id].elv : ''}</span></div>`; }).join('') || '<div class="muted">ไม่พบ</div>'}</div>`;
  if (it) {
    const slot = slotOfItem(it);
    const u = itemUsableBy(db.equip, it, build.classId, build.status.baseLv);
    h += `<div class="row"><span>เลือก</span>${iconI(editing.id)}<b>${esc(it.name)}</b> <span class="muted">#${editing.id} · ${esc(it.type)}${it.sub ? ' / ' + esc(it.sub) : ''}</span>
      ${u.ok ? '' : `<span class="bad">(${esc(u.reason)} — คราฟเก็บไว้ได้ แต่ใส่ไม่ได้)</span>`}</div>
      <div class="row"><span>เงื่อนไข</span><span>${esc(reqText(it))}</span></div>`;
    const isShadow = it.type === 'ShadowGear', canRef = (!!it.refine || isShadow) && it.type !== 'Ammo', canGrade = !!it.grade;   // every shadow piece can be refined (to +10)
    if (isShadow && (editing.refine || 0) > 10) editing.refine = 10;
    h += `<div class="row"><span>ตีบวก</span><select id="cRef" ${canRef ? '' : 'disabled'}>${Array.from({ length: isShadow ? 11 : 21 }, (_, i) => `<option value="${i}" ${i === (editing.refine || 0) ? 'selected' : ''}>+${i}</option>`).join('')}</select>
      ${canRef ? '' : '<span class="muted">ไอเท็มนี้ตีบวกไม่ได้ (ตามข้อมูลเซิร์ฟเวอร์)</span>'}</div>`;
    h += `<div class="row"><span>เกรด</span><select id="cGrade" ${canGrade ? '' : 'disabled'}>${GRADES.map((g, i) => `<option value="${i}" ${i === (editing.grade || 0) ? 'selected' : ''}>${i ? 'Grade ' + g : 'ไม่มีเกรด'}</option>`).join('')}</select>
      ${canGrade ? '' : '<span class="muted">ไอเท็มนี้ไม่มีระบบเกรด</span>'}</div>`;
    const cardOpts = slot ? cardsForSlot(db.equip, slot).map((id) => `${db.equip.items[id].name} [${id}]`) : [];
    $('cardList') || document.body.insertAdjacentHTML('beforeend', '<datalist id="cardList"></datalist><datalist id="enchList"></datalist>');
    $('cardList').innerHTML = cardOpts.map((t) => `<option value="${esc(t)}">`).join('');
    $('enchList').innerHTML = enchantList.map((t) => `<option value="${esc(t)}">`).join('');
    const nm = (id) => (id && db.equip.items[id] ? `${db.equip.items[id].name} [${id}]` : '');
    for (let i = 0; i < (it.slots || 0); i++) {
      h += `<div class="row"><span>การ์ด ${i + 1}</span><input class="wide" list="cardList" data-card="${i}" value="${esc(nm(editing.cards[i]))}" placeholder="ชื่อการ์ด"></div>`;
    }
    // enchants exactly as the server's enchant table allows (db/re/item_enchant.yml): fixed slots, fixed lists per slot
    const ed = ENCH.defs[ENCH.items[editing.id]];
    if (!ed) {
      h += '<div class="row"><span>Enchant</span><span class="muted">ไอเท็มนี้ไม่มี Enchant (ไม่มีในตาราง Enchant ของเซิร์ฟเวอร์)</span></div>';
      editing.enchants = [];
    } else {
      const lowRef = false, lowGrade = false;   // the sim doesn't enforce enchant refine/grade conditions (user's choice)
      if (ed.name) h += `<div class="row"><span>Enchant</span><span class="muted">${esc(ed.name)} (NPC)${ed.note ? ' — ' + esc(ed.note) : ''}</span></div>`;
      if (lowRef || lowGrade) h += `<div class="row"><span>Enchant</span><span class="bad">ต้อง${lowRef ? `ตีบวก +${ed.minRefine}` : ''}${lowRef && lowGrade ? ' และ' : ''}${lowGrade ? `มีเกรด ${GRADES[ed.minGrade]}` : ''} ขึ้นไป</span></div>`;
      ed.order.filter((k) => k >= (it.slots || 0)).forEach((k, i) => {       // card slots stay cards
        const list = (ed.slots[k] || []).filter((x) => db.equip.items[x]);    // only enchants the GGT client has
        if (!list.length) return;
        h += `<div class="row"><span>Enchant ${i + 1}</span><select class="wide" data-ench="${i}" ${lowRef || lowGrade || (i > 0 && !ed.free && !editing.enchants[i - 1]) ? 'disabled' : ''}><option value="">— ไม่มี —</option>
          ${list.map((x) => `<option value="${x}" ${editing.enchants[i] === x ? 'selected' : ''}>${esc(db.equip.items[x].name)}</option>`).join('')}</select>
          <span class="muted">ช่อง ${k + 1}</span></div>`;
      });
      if (lowRef || lowGrade) editing.enchants = [];
    }
    // options exactly as the server can give them: one choice per guaranteed slot of the group + up to MaxRandom extra
    const groups = ed && ed.randomOptions === false ? [] : roGroups(editing.id);
    if (!groups.length) {
      h += '<div class="row"><span>ออฟ</span><span class="muted">ไอเท็มนี้ไม่มีออฟ (ไม่มีกลุ่มออฟในข้อมูลเซิร์ฟเวอร์)</span></div>';
      editing.options = []; editing.optGroup = null;
    } else {
      if (!groups.includes(editing.optGroup)) { editing.optGroup = groups[0]; editing.options = []; }
      const g = RANDOPT.groups[editing.optGroup];
      h += `<div class="row"><span>ออฟ</span>${groups.length > 1 ? `<select id="cOptGroup">${groups.map((x) => `<option ${x === editing.optGroup ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : `<span class="muted">กลุ่ม ${esc(editing.optGroup)}</span>`}
        <span class="muted">${g.slots.length} ช่องหลัก${g.maxRandom ? ` + สุ่มได้อีก ${g.maxRandom}` : ''}</span></div>`;
      const rows = [...g.slots.map((list, i) => ({ list, label: `ช่อง ${i + 1}` })),
        ...Array.from({ length: Math.min(g.maxRandom, 5 - g.slots.length) }, (_, i) => ({ list: g.random, label: `สุ่ม ${i + 1}` }))];
      rows.forEach(({ list, label }, i) => {
        const o = editing.options[i] || null, def = o && list.find((x) => x.o === o.o);
        h += `<div class="row"><span>${label}</span><select data-ro="${i}"><option value="">— ไม่มี —</option>${list.map((x) =>
          `<option value="${x.o}" ${o?.o === x.o ? 'selected' : ''}>${esc(x.max ? roLabel({ o: x.o, v: x.max }).replace(/\s*[+-]?\d+%?$/, '') + ` (${x.min}~${x.max})` : roLabel({ o: x.o, v: 0 }))}</option>`).join('')}</select>
          ${def && def.max ? `<select data-rv="${i}">${Array.from({ length: Math.floor(def.max) - Math.ceil(def.min) + 1 }, (_, k) => Math.ceil(def.min) + k).map((v) => `<option ${v === o.v ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}</div>`;
      });
    }
    if (it.script) h += `<details><summary class="muted">สคริปต์ของไอเท็ม</summary><div class="desc">${esc(it.script)}</div></details>`;
    h += `<div class="row"><span></span><button id="cSave"><b>${editing.uid ? 'บันทึกการแก้ไข' : 'คราฟ → เก็บเข้า Inventory'}</b></button>
      ${editing.uid ? '<button id="cNew">ยกเลิกแก้ไข</button>' : ''}</div>`;
  }
  $('craftBox').innerHTML = h;
}
$('craftBox').addEventListener('input', (e) => {
  if (e.target.id === 'cQ') { craftQ = e.target.value; const p = e.target.selectionStart; renderCraft(); $('cQ').focus(); $('cQ').setSelectionRange(p, p); }
});
$('craftBox').addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (e.target.id === 'cAll') { S.ui.craftAll = e.target.checked; renderCraft(); save(); return; }
  if (e.target.id === 'cRef') { editing.refine = Number(e.target.value); renderCraft(); return; }
  else if (e.target.id === 'cGrade') { editing.grade = Number(e.target.value); renderCraft(); }
  else if (d.card !== undefined) editing.cards[d.card] = idFromText(e.target.value);
  else if (d.ench !== undefined) {
    editing.enchants[d.ench] = Number(e.target.value) || null;
    if (!editing.enchants[d.ench] && !ENCH.defs[ENCH.items[editing.id]]?.free) editing.enchants.length = Number(d.ench);   // slots are enchanted in order: later ones go too (not for position-based costume stones)
    renderCraft();
  }
  else if (e.target.id === 'cOptGroup') { editing.optGroup = e.target.value; editing.options = []; renderCraft(); }
  else if (d.ro !== undefined) {
    const g = RANDOPT.groups[editing.optGroup], i = Number(d.ro);
    const list = i < g.slots.length ? g.slots[i] : g.random, def = list.find((x) => x.o === e.target.value);
    editing.options[i] = def ? { o: def.o, v: Math.floor(def.max) } : null;
    renderCraft();
  }
  else if (d.rv !== undefined) {
    const o = editing.options[Number(d.rv)];
    if (o) o.v = Math.trunc(Number(e.target.value)) || 0;   // whole numbers only
  }
  else if (d.ok !== undefined) { const o = editing.options[d.ok]; o.k = e.target.value; o.a = OPTIONS[o.k].arg ? (OPTIONS[o.k].arg === 'race' ? RACES : OPTIONS[o.k].arg === 'ele' ? ELES : SIZES)[0][0] : null; renderCraft(); }
  else if (d.oa !== undefined) editing.options[d.oa].a = e.target.value;
  else if (d.ov !== undefined) editing.options[d.ov].v = Number(e.target.value) || 0;
});
$('craftBox').addEventListener('click', (e) => {
  const d = e.target.closest('[data-pick]')?.dataset || e.target.dataset;
  if (d.pick) {
    const id = Number(d.pick);
    const keep = editing.id && db.equip.items[editing.id]?.slots === db.equip.items[id].slots;
    editing = { ...editing, id, cards: keep ? editing.cards : [], grade: db.equip.items[id].grade ? editing.grade : 0,
      refine: db.equip.items[id].refine ? editing.refine : 0 };
    craftQ = ''; renderCraft(); return;
  }
  if (e.target.id === 'cOptAdd') { if (editing.options.length < 5) editing.options.push({ k: 'atk', a: null, v: 1 }); renderCraft(); }
  if (d.odel !== undefined) { editing.options.splice(Number(d.odel), 1); renderCraft(); }
  if (e.target.closest('#cNew')) { editing = newDraft(); renderCraft(); }
  if (e.target.closest('#cSave')) {
    const it = db.equip.items[editing.id];
    editing.cards = editing.cards.slice(0, it.slots || 0).map((x) => x || null);
    editing.enchants = editing.enchants.map((x) => x || null);
    editing.options = (editing.options || []).map((o) => o || null);   // keep slot positions
    if (editing.uid) {
      const i = S.inventory.findIndex((x) => x.uid === editing.uid);
      if (i >= 0) S.inventory[i] = structuredClone(editing);
    } else {
      if (S.inventory.length >= MAX_INV) return alert(`ช่องเก็บของเต็ม (${MAX_INV})`);
      S.inventory.push({ ...structuredClone(editing), uid: uid() });
    }
    editing = newDraft(); S.ui.invTab = 'equip'; refresh();
  }
});

// ------------------------------------------------------------------ buffs / debuffs
// Soul Link (SC_SPIRIT) only works on its own job line: status.cpp compares (class_ & MAPID_SECONDMASK 0xFFF) with the
// line of the link, so Spirit of the Assassin is for Assassin / Assassin Cross / Guillotine Cross / Shadow Cross only.
const SOUL_LINK = { SL_ALCHEMIST: 517, SL_ASSASIN: 262, SL_BARDDANCER: 515, SL_BLACKSMITH: 261, SL_CRUSADER: 513, SL_HUNTER: 259,
  SL_KNIGHT: 257, SL_MONK: 516, SL_PRIEST: 260, SL_ROGUE: 518, SL_SAGE: 514, SL_SOULLINKER: 519, SL_STAR: 263, SL_SUPERNOVICE: 256, SL_WIZARD: 258 };
const HIGH_FIRST = [0x4001, 0x4002, 0x4003, 0x4004, 0x4005, 0x4006].map((x) => x - 0x4000 + 0x100000);   // High Swordman ... High Thief
function soulLinkFits(id) {
  if (!id.startsWith('SL_') || !(id in SOUL_LINK || id === 'SL_HIGH')) return true;
  const mapid = db.equip.jobs?.[build.classId]?.mapid ?? 0;
  if (id === 'SL_HIGH') return HIGH_FIRST.includes(mapid) && build.status.baseLv < 70;   // Spirit of Rebirth: high 1st jobs below Lv 70
  return (mapid & 0xFFF) === SOUL_LINK[id];
}
let buffQ = '';
// party buffs grouped by job line (castBy = skill-tree jobs that have the skill in their own list)
const BUFF_LINES = [
  ['Swordman / Knight', 'Swordman Knight Lord_Knight Rune_Knight Dragon_Knight'],
  ['Crusader / Royal Guard', 'Crusader Paladin Royal_Guard Imperial_Guard'],
  ['Mage / Wizard', 'Mage Wizard High_Wizard Warlock Arch_Mage'],
  ['Sage / Sorcerer', 'Sage Professor Sorcerer Elemental_Master'],
  ['Archer / Hunter', 'Archer Hunter Sniper Ranger Windhawk'],
  ['Bard / Dancer', 'Bard Dancer Clown Gypsy Minstrel Wanderer Troubadour Trouvere'],
  ['Acolyte / Priest', 'Acolyte Priest High_Priest Arch_Bishop Cardinal'],
  ['Monk / Sura', 'Monk Champion Sura Inquisitor'],
  ['Merchant / Blacksmith', 'Merchant Blacksmith Whitesmith Mechanic Meister'],
  ['Alchemist / Genetic', 'Alchemist Creator Genetic Biolo'],
  ['Thief / Assassin', 'Thief Assassin Assassin_Cross Guillotine_Cross Shadow_Cross'],
  ['Rogue / Shadow Chaser', 'Rogue Stalker Shadow_Chaser Abyss_Chaser'],
  ['Taekwon / Star Gladiator', 'Taekwon Star_Gladiator Star_Emperor Sky_Emperor'],
  ['Soul Linker / Soul Reaper', 'Soul_Linker Soul_Reaper Soul_Ascetic'],
  ['Ninja', 'Ninja Kagerou Oboro Shinkiro Shiranui'],
  ['Gunslinger', 'Gunslinger Rebellion Night_Watch'],
  ['Summoner', 'Summoner Spirit_Handler'],
  ['Super Novice', 'Novice Supernovice Super_Baby Super_Novice Hyper_Novice'],
];
const LINE_OF = {};
BUFF_LINES.forEach(([, jobs], i) => jobs.split(' ').forEach((j) => { LINE_OF[j] = i; }));
const OTHER_LINE = BUFF_LINES.length;                          // equipment-only / unknown
function buffLine(b) {
  const lines = (b.castBy || []).map((j) => LINE_OF[j.replace(/^Baby_/, '').replace(/_(T|E|High)$/, '').replace(/\d+$/, '')])
    .filter((x) => x !== undefined);
  return lines.find((x) => x !== BUFF_LINES.length - 1) ?? lines[0] ?? OTHER_LINE;   // Super Novice only when no one else has it
}
const lineName = (i) => BUFF_LINES[i]?.[0] || 'อุปกรณ์ / อื่นๆ';
function renderBuffs() {
  document.querySelectorAll('#buffTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === S.ui.buffTab));
  const q = buffQ.toLowerCase(), all = $('buffAll').checked;
  const match = (b) => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
  const active = build.buffs.active;
  if (S.ui.buffTab === 'debuff') {
    $('buffList').innerHTML = debuffList(db).filter(match).map((d) => {
      const lv = S.debuffs[d.id] || 0;
      return `<div class="bf"><input type="checkbox" data-db="${d.id}" ${lv ? 'checked' : ''}><span class="nm" title="${esc(d.id)}">${esc(d.name)}</span>
        <input type="number" data-dblv="${d.id}" min="1" max="${d.maxLv}" value="${lv || d.maxLv}"></div>`;
    }).join('');
    return;
  }
  const self = S.ui.buffTab === 'self';
  // from others: only skills some player job can cast (or worn equipment grants); item buffs are used from the inventory
  let list = avail.filter((b) => (self ? b.kind === 'self' : b.kind !== 'self' && b.kind !== 'item' && (b.castBy?.length || b.fromEquip)) &&
    soulLinkFits(b.id) && match(b));
  const jsel = $('buffJob');
  jsel.hidden = self;
  if (!self) {
    const lines = [...new Set(list.map(buffLine))].sort((a, b) => a - b);
    if (S.ui.buffJob !== '' && !lines.includes(+S.ui.buffJob)) S.ui.buffJob = '';
    jsel.innerHTML = `<option value="">ทุกอาชีพ</option>` + lines.map((i) => `<option value="${i}"${String(i) === String(S.ui.buffJob) ? ' selected' : ''}>${esc(lineName(i))}</option>`).join('');
    list = list.map((b) => [buffLine(b), b]).filter(([l]) => S.ui.buffJob === '' || l === +S.ui.buffJob)
      .sort((a, b) => a[0] - b[0]).map(([l, b]) => Object.assign(Object.create(b), { line: l }));
  }
  let lastLine = -1;
  $('buffList').innerHTML = list.map((b) => {
    let head = '';
    if (!self && b.line !== lastLine) { lastLine = b.line; head = `<div class="bfh">${esc(lineName(b.line))}</div>`; }
    const max = buffMax(b), ok = b.available && max > 0;
    if (!ok && !all) return head && list.some((o) => o.line === b.line && o.available && buffMax(o) > 0) ? head : '';
    const lv = S.buffs[b.id] || 0;
    const on = lv > 0 && ok;
    const isOn = b.sc && active[b.sc];
    const why = !ok ? (b.reason || 'ยังไม่ได้เรียนสกิลนี้') : (b.note || '');
    return `${head}<div class="bf${ok ? '' : ' off'}" data-n="${b.id}" data-tip="${esc(b.name + (why ? '\n' + why : ''))}"><input type="checkbox" data-bf="${b.id}" ${on ? 'checked' : ''} ${ok ? '' : 'disabled'}>${iconS(b.id)}
      <span class="nm">${esc(b.name)}${self && ok ? ` <span class="muted">${S.skills[b.id] ? `(Lv ${Math.min(S.skills[b.id], b.maxLv)})` : `(อุปกรณ์ Lv ${b.fromEquip?.lv})`}</span>` : ''}${on && b.sc && !isOn ? ' <span class="bad">(ไม่ทำงาน)</span>' : ''}</span>
      <input type="number" data-bflv="${b.id}" min="1" max="${max || 1}" value="${Math.min(lv || max || 1, max || 1)}" ${ok ? '' : 'disabled'}></div>`;
  }).join('') || '<p class="muted">ไม่มีบัพในหมวดนี้</p>';
}
$('buffTabs').onclick = (e) => { const t = e.target.dataset.t; if (t) { S.ui.buffTab = t; renderBuffs(); save(); } };
$('buffSearch').oninput = () => { buffQ = $('buffSearch').value; renderBuffs(); };
$('buffAll').onchange = renderBuffs;
$('buffJob').onchange = () => { S.ui.buffJob = $('buffJob').value; renderBuffs(); save(); };
$('buffList').onchange = (e) => {
  const d = e.target.dataset;
  const lvOf = (id) => Number(document.querySelector(`[data-bflv="${id}"],[data-dblv="${id}"]`)?.value) || 1;
  if (d.bf) { if (e.target.checked) { S.buffs[d.bf] = lvOf(d.bf); turnOffClashing({ buff: d.bf }); } else delete S.buffs[d.bf]; }
  else if (d.bflv) { if (S.buffs[d.bflv]) S.buffs[d.bflv] = Number(e.target.value) || 1; }
  else if (d.db) { if (e.target.checked) S.debuffs[d.db] = lvOf(d.db); else delete S.debuffs[d.db]; }
  else if (d.dblv) { if (S.debuffs[d.dblv]) S.debuffs[d.dblv] = Number(e.target.value) || 1; }
  else return;
  refresh();
};

// ------------------------------------------------------------------ damage
$('mobList').innerHTML = Object.entries(db.mobs).map(([id, m]) => `<option value="${esc(m.name)} [${id}]">`).join('');
function renderDamage() {
  const m = db.mobs[S.mobId];
  $('mob').value = m ? `${m.name} [${S.mobId}]` : '';
  const canAttack = (n) => db.skills.skills[n] && (db.skills.names?.[n]?.[1] || 'Passive') !== 'Passive' &&
    !((db.skills.names?.[n]?.[1] === 'Self') && !db.skills.skills[n].ratio && !(db.skills.skills[n].flags || []).includes('Splash'));
  const learned = Object.keys(S.skills).filter(canAttack);
  const granted = Object.keys(build.equip.grantedSkills || {}).filter((n) => canAttack(n) && !learned.includes(n));
  const opts = [['', 'ตีปกติ'], ...[...learned, ...granted].map((n) => [n, skName(n)])];
  if (!opts.some(([n]) => n === S.atkSkill)) S.atkSkill = '';
  $('atkSkill').innerHTML = opts.map(([n, l]) => `<option value="${n}" ${n === S.atkSkill ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const maxLv = S.atkSkill ? Math.max(S.skills[S.atkSkill] || 0, build.equip.grantedSkills?.[S.atkSkill]?.lv || 0) : 1;
  S.atkLv = Math.min(Math.max(1, S.atkLv), maxLv || 1);
  $('atkLv').value = S.atkLv; $('atkLv').max = maxLv || 1; $('atkLv').disabled = !S.atkSkill;
  if (!m) { $('dmgOut').innerHTML = '<p class="muted">เลือกมอนสเตอร์</p>'; return; }
  try {
    const d = calculateDamage(db, build, { mobId: S.mobId, skill: S.atkSkill || undefined, level: S.atkLv, debuffs: S.debuffs });
    const df = calculateDefense(db, build, { mobId: S.mobId, debuffs: S.debuffs });
    const n = (v) => (v == null ? '-' : Math.round(v).toLocaleString());
    const tr = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    const a = [tr('ดาเมจ (ต่ำสุด ~ สูงสุด)', `${n(d.min)} ~ ${n(d.max)}`), tr('เฉลี่ย', `<b>${n(d.avg)}</b>`),
      d.crit ? tr('คริติคอล (เฉลี่ย)', n(d.crit.avg)) : '', tr('โอกาสโดน / คริ', `${d.chance.land}% / ${d.chance.crit}%`),
      tr('DPS', `<b>${n(d.dps)}</b>`), d.cast ? tr('ร่าย / ดีเลย์ / คูลดาวน์', `${d.cast.castTime} / ${d.cast.delay} / ${d.cast.cooldown} ms`) : '',
      tr('ตีกี่ครั้งตาย', d.kill ? `${d.kill.hits} (${d.kill.seconds ?? '-'} วินาที)` : '-'),
      d.autospell?.length ? tr('Autospell / Proc', d.autospell.map((x) => `${skName(x.skill)} +${n(x.expectedPerAttack)}`).join('<br>')) : ''].join('');
    const b = [tr('มอนสเตอร์ตีเรา', `${n(df.min)} ~ ${n(df.max)}`), tr('โอกาสโดน', `${df.land}%`), tr('Flee / Perfect Dodge', `${df.hitRate}% โดน · PD ${df.perfectDodge}%`),
      tr('โดนกี่ครั้งตาย', `${df.hitsToDie} (${df.secondsToDie ?? '-'} วินาที)`),
      df.reflect?.percent ? tr('สะท้อนกลับ', `${df.reflect.percent}% (${n(df.reflect.avg)})`) : ''].join('');
    const steps = (d.steps || []).map(([k, v]) => tr(esc(k), esc(v))).join('');
    $('dmgOut').innerHTML = `<div><h4>เราตี ${esc(m.name)} (${esc(m.ele)} ${m.eleLv} · ${esc(m.race)} · ${esc(m.size)})</h4><table>${a}</table></div>
      <div><h4>${esc(m.name)} ตีเรา</h4><table>${b}</table></div>
      <details><summary class="muted">ขั้นตอนการคำนวณ</summary><table>${steps}</table></details>`;
  } catch (err) {
    $('dmgOut').innerHTML = `<p class="bad">คำนวณไม่ได้: ${esc(err.message)}</p>`;
  }
}
$('mob').onchange = () => { const id = idFromText($('mob').value) ?? (db.mobs[$('mob').value] ? Number($('mob').value) : null); if (id) { S.mobId = id; renderDamage(); save(); } };
$('atkSkill').onchange = () => { S.atkSkill = $('atkSkill').value; S.atkLv = S.skills[S.atkSkill] || build.equip.grantedSkills?.[S.atkSkill]?.lv || 1; renderDamage(); save(); };
$('atkLv').onchange = () => { S.atkLv = Number($('atkLv').value) || 1; renderDamage(); save(); };

// ------------------------------------------------------------------ modal
let modalClick = null;
function openModal(title, html, onClick) { $('mTitle').textContent = title; $('mBody').innerHTML = html; modalClick = onClick; $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; modalClick = null; }
$('mBody').onclick = (e) => modalClick?.(e);
$('mClose').onclick = closeModal;
$('modal').onclick = (e) => { if (e.target === $('modal')) closeModal(); };

// ------------------------------------------------------------------ right click: item / skill windows like the client
const DESC = {};
async function itemDesc(id) {
  const b = Number(id) % 64;
  if (!DESC[b]) DESC[b] = await fetch(`../data/itemdesc/${b}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return DESC[b][id];
}
/** client text with ^RRGGBB colour codes -> HTML */
function roText(t) {
  let out = '', open = false;
  for (const part of String(t).split(/(\^[0-9a-fA-F]{6})/)) {
    if (/^\^[0-9a-fA-F]{6}$/.test(part)) {
      if (open) { out += '</span>'; open = false; }
      if (part.slice(1).toLowerCase() !== '000000') { out += `<span style="color:#${part.slice(1)}">`; open = true; }
    } else out += esc(part);
  }
  return out + (open ? '</span>' : '');
}
async function showItem(x) {
  const id = Number(x.id);
  const it = db.equip.items[id], c = db.consumables[id];
  const name = x.uid ? itemLabel(x) : (it?.name || c?.name || '#' + id);
  $('iiTitle').textContent = it?.name || c?.name || 'Item';
  const info = [];
  if (it) {
    info.push(`${esc(it.type)}${it.sub ? ' / ' + esc(it.sub) : ''}${it.slots ? ` · Slot ${it.slots}` : ''}`);
    if (it.atk) info.push(`ATK ${it.atk}${it.matk ? ` · MATK ${it.matk}` : ''}${it.wlv ? ` · Weapon Lv ${it.wlv}` : ''}`);
    else if (it.def || it.alv) info.push(`DEF ${it.def || 0}${it.alv ? ` · Armor Lv ${it.alv}` : ''}`);
    if (it.w) info.push(`น้ำหนัก ${it.w / 10}`);
    info.push(esc(reqText(it)));
    const u = itemUsableBy(db.equip, it, build.classId, build.status.baseLv);
    if (!u.ok) info.push(`<span class="bad">ใส่ไม่ได้: ${esc(u.reason)}</span>`);
  }
  const parts = [];
  if (x.cons && c) {
    const ca = consumableAvailability(db, build).find((y) => y.id === id);
    parts.push('ผล: ' + c.effects.map((ef) => scLabel(ef.group)).join(', '));
    if (ca && !ca.usable) parts.push('ใช้ไม่ได้: ' + ca.reason);
    if ((build.consumables?.replaced || []).includes(id)) parts.push('มีของที่แรงกว่าใช้อยู่ ไม่มีผล');
  }
  if (x.uid) {
    const n = (cid) => db.equip.items[cid]?.name || cid;
    if (x.cards?.some(Boolean)) parts.push('การ์ด: ' + x.cards.filter(Boolean).map(n).join(', '));
    if (x.enchants?.some(Boolean)) parts.push('Enchant: ' + x.enchants.filter(Boolean).map(n).join(', '));
    if (x.options?.length) parts.push('ออฟ: ' + x.options.map(roLabel).filter(Boolean).join(', '));
  }
  $('itemInfo').innerHTML = `<div class="head">${iconI(id)}<div><b>${esc(name)}</b> <span class="muted">#${id}</span><div class="sub">${info.join('<br>')}</div></div></div>
    ${parts.length ? `<div class="now">${esc(parts.join('\n')).replace(/\n/g, '<br>')}</div>` : ''}<div class="d">กำลังโหลดคำอธิบาย…</div>
    ${it?.script ? `<details><summary class="muted">สคริปต์ของเซิร์ฟเวอร์</summary><div class="desc">${esc(it.script)}</div></details>` : ''}`;
  let act = '';
  if (x.uid) {
    const worn = Object.values(S.equipped).includes(x.uid);
    act = `<button data-ia="wear">${worn ? 'ถอด' : 'สวมใส่'}</button> <button data-ia="edit">แก้ไข</button> <button data-ia="dup">คัดลอก</button> <button data-ia="del" class="danger">ลบ</button>`;
  } else if (c && x.cons) act = `<button data-ia="use">${S.consumables.includes(id) ? 'เลิกใช้' : 'ใช้'}</button>`;
  if (act) $('itemInfo').insertAdjacentHTML('beforeend', `<p class="acts">${act}</p>`);
  itemCtx = x;
  $('wItemInfo').hidden = false;
  const d = await itemDesc(id);
  const box = $('itemInfo').querySelector('.d');
  if (box) box.innerHTML = d ? d.map(roText).join('\n') : '<span class="muted">ไม่มีคำอธิบายในไคลเอนต์</span>';
}
$('iiClose').onclick = () => { $('wItemInfo').hidden = true; };
let itemCtx = null;
$('itemInfo').addEventListener('click', (e) => {
  const a = e.target.dataset.ia, x = itemCtx;
  if (!a || !x) return;
  $('wItemInfo').hidden = true;
  if (a === 'use') return toggleCons(Number(x.id));
  if (a === 'wear') return toggleWear(x.uid);
  if (a === 'edit') { editing = structuredClone(x); renderCraft(); $('wCraft').scrollIntoView({ behavior: 'smooth' }); return; }
  if (a === 'dup') {
    if (S.inventory.length >= MAX_INV) return notice(`ช่องเก็บของเต็ม (${MAX_INV})`);
    S.inventory.splice(S.inventory.indexOf(x) + 1, 0, { ...structuredClone(x), uid: uid() }); refresh(); return;
  }
  if (a === 'del') {
    if (!confirm(`ลบ ${itemLabel(x)} ?`)) return;
    S.inventory = S.inventory.filter((y) => y !== x);
    for (const [s2, u2] of Object.entries(S.equipped)) if (u2 === x.uid) delete S.equipped[s2];
    if (editing?.uid === x.uid) editing = null;
    refresh();
  }
});
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-inv],[data-slot],[data-pick],[data-cons],.sk[data-n],.bf[data-n],[data-bf],[data-db]');
  if (!el) return;
  e.preventDefault();
  $('tip').hidden = true;
  // open the window next to the mouse, on the side with room (like the client)
  const Z = ZOOM;
  const place = (w, width) => { w.style.left = Math.max(6, (e.clientX > innerWidth / 2 ? e.clientX - width * Z - 16 : e.clientX + 16) / Z) + 'px';
    w.style.top = Math.max(40, Math.min(e.clientY - 20, innerHeight - 320) / Z) + 'px'; };
  place($('wItemInfo'), 380); place($('wSkillInfo'), 430);
  const d = el.dataset;
  // right click on the same thing again closes its window (like the client)
  const key = d.inv ? 'inv:' + d.inv : d.slot ? 'inv:' + (S.equipped[d.slot] || '') : d.pick ? 'id:' + d.pick : d.cons ? 'id:' + d.cons : 'sk:' + (d.n || d.bf || d.db);
  const isSkill = key.startsWith('sk:');
  const win = isSkill ? $('wSkillInfo') : $('wItemInfo');
  if (!win.hidden && win.dataset.key === key) {
    win.hidden = true;
    if (isSkill) { skillSel = null; renderSkills(); }
    return;
  }
  win.dataset.key = key;
  if (d.inv) return showItem(invItem(d.inv));
  if (d.slot) { const x = invItem(S.equipped[d.slot]); if (x) showItem(x); return; }
  if (d.pick) return showItem({ id: d.pick });
  if (d.cons) return showItem({ id: d.cons, cons: true });
  const n = d.n || d.bf || d.db;
  if (n && SKILLINFO[n]) { skillSel = n; $('wSkillInfo').hidden = false; renderSkills(); }
});
// both description windows can be dragged by their title bar
for (const w of [$('wItemInfo')]) {
  const h = w.querySelector('h2');
  h.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = w.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (ev) => { w.style.left = (ev.clientX - dx) / ZOOM + 'px'; w.style.top = (ev.clientY - dy) / ZOOM + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
}

// ------------------------------------------------------------------ refresh
/** equipment whose job / level condition no longer matches goes back to the inventory (like the game) */
function unequipLocked() {
  const cid = classIdOf(db, { jobId: S.jobId, trans: S.trans });
  const off = [];
  for (const [slot, uidv] of Object.entries(S.equipped)) {
    const x = invItem(uidv), it = x && db.equip.items[x.id];
    if (!it) { delete S.equipped[slot]; continue; }
    const u = itemUsableBy(db.equip, it, cid, S.baseLv);
    if (!u.ok) { delete S.equipped[slot]; off.push(`${itemLabel(x)} (${u.reason})`); }
  }
  if (off.length) notice('ถอดเก็บเข้า Inventory: ' + off.join(', '));
}
function notice(t) {
  const el = document.createElement('div');
  el.className = 'notice'; el.textContent = t;
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}
function refresh() {
  // 3rd jobs: only the line that went through the high (transcendent) classes; special jobs have no trans version
  S.trans = !!db.status.jobs.find((j) => j.id === S.jobId)?.transClass;
  if (db.status.jobs.find((j) => j.id === S.jobId)?.traits && S.baseLv < 200) S.baseLv = 200;   // a 4th job is at least Base Lv 200
  pruneSkills();
  unequipLocked();
  compute();
  // levels are clamped by the job: show what the calculator used
  S.baseLv = build.status.baseLv; S.jobLv = build.status.jobLv;
  bindTop(); renderSkills(); renderStatus(); renderEquip(); renderEqStat(); renderInv(); renderCraft(); renderBuffs(); renderDamage();
  save();
}
$('loading').hidden = true; $('app').hidden = false;
refresh();
