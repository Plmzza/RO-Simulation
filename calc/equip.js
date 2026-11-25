/**
 * Equipment evaluation: runs item / card / enchant / combo scripts for a build and sums the bonuses.
 * Data comes from rAthena (renewal) item_db, refine.yml, enchantgrade.yml and item_combos.yml.
 */
import { compile, run } from './script.js';

/** Equipment slots, their rAthena EQI constant and the item locations they accept. */
export const SLOTS = {
  headTop: { eqi: 'EQI_HEAD_TOP', loc: ['Head_Top'] },
  headMid: { eqi: 'EQI_HEAD_MID', loc: ['Head_Mid'] },
  headLow: { eqi: 'EQI_HEAD_LOW', loc: ['Head_Low'] },
  armor: { eqi: 'EQI_ARMOR', loc: ['Armor'] },
  weapon: { eqi: 'EQI_HAND_R', loc: ['Right_Hand', 'Both_Hand'] },
  shield: { eqi: 'EQI_HAND_L', loc: ['Left_Hand'] },
  garment: { eqi: 'EQI_GARMENT', loc: ['Garment'] },
  shoes: { eqi: 'EQI_SHOES', loc: ['Shoes'] },
  accL: { eqi: 'EQI_ACC_L', loc: ['Left_Accessory', 'Both_Accessory'] },
  accR: { eqi: 'EQI_ACC_R', loc: ['Right_Accessory', 'Both_Accessory'] },
  ammo: { eqi: 'EQI_AMMO', loc: ['Ammo'] },
  costumeTop: { eqi: 'EQI_COSTUME_HEAD_TOP', loc: ['Costume_Head_Top'] },
  costumeMid: { eqi: 'EQI_COSTUME_HEAD_MID', loc: ['Costume_Head_Mid'] },
  costumeLow: { eqi: 'EQI_COSTUME_HEAD_LOW', loc: ['Costume_Head_Low'] },
  costumeGarment: { eqi: 'EQI_COSTUME_GARMENT', loc: ['Costume_Garment'] },
  shadowArmor: { eqi: 'EQI_SHADOW_ARMOR', loc: ['Shadow_Armor'] },
  shadowWeapon: { eqi: 'EQI_SHADOW_WEAPON', loc: ['Shadow_Weapon'] },
  shadowShield: { eqi: 'EQI_SHADOW_SHIELD', loc: ['Shadow_Shield'] },
  shadowShoes: { eqi: 'EQI_SHADOW_SHOES', loc: ['Shadow_Shoes'] },
  shadowAccR: { eqi: 'EQI_SHADOW_ACC_R', loc: ['Shadow_Right_Accessory'] },
  shadowAccL: { eqi: 'EQI_SHADOW_ACC_L', loc: ['Shadow_Left_Accessory'] },
};

export async function loadEquipData(base = '../data/') {
  const get = (f) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
  const [items, combos, refine, consts] = await Promise.all([get('items.json'), get('combos.json'), get('refine.json'), get('constants.json')]);
  return prepareEquipData(items, combos, refine, consts);
}

/** Same as loadEquipData but from already loaded JSON (used by tests / Node). */
export function prepareEquipData(items, combos, refine, consts) {
  const eqiToSlot = {};
  for (const [slot, s] of Object.entries(SLOTS)) {
    const v = consts.constants[s.eqi];
    if (v !== undefined) eqiToSlot[v] = slot;
  }
  const comboIndex = new Map();                     // item id -> combos that include it
  combos.forEach((c, i) => c.sets.flat().forEach((id) => {
    if (!comboIndex.has(id)) comboIndex.set(id, []);
    comboIndex.get(id).push(i);
  }));
  return { items, combos, refine: refine.refine, grades: refine.grades, constants: consts.constants, jobs: consts.jobs,
    eqiToSlot, comboIndex, compiled: new Map() };
}

/** Items that can go into a slot (optionally only those a job can wear). */
/** rAthena item job names -> EAJ job code (class mapid & 0xFFF) */
const ITEM_JOB = { Novice: 0, Swordman: 1, Mage: 2, Archer: 3, Acolyte: 4, Merchant: 5, Thief: 6, Taekwon: 7, Gunslinger: 8, Ninja: 9,
  Summoner: 10, SuperNovice: 256, Knight: 257, Wizard: 258, Hunter: 259, Priest: 260, Blacksmith: 261, Assassin: 262,
  StarGladiator: 263, Rebellion: 264, KagerouOboro: 265, Spirit_Handler: 266, Crusader: 513, Sage: 514, BardDancer: 515,
  Monk: 516, Alchemist: 517, Rogue: 518, SoulLinker: 519 };

/** Item class group of a job (item_db "Classes"): Normal, Upper, Baby, Third, Third_Upper, Third_Baby, Fourth */
function itemClassOf(mapid) {
  if (mapid & 0x10000) return 'Fourth';
  const baby = mapid & 0x200000, upper = mapid & 0x100000;
  if (mapid & 0x1000) return baby ? 'Third_Baby' : upper ? 'Third_Upper' : 'Third';
  return baby ? 'Baby' : upper ? 'Upper' : 'Normal';
}
const CLASS_GROUPS = { All_Upper: ['Upper', 'Third_Upper'], All_Baby: ['Baby', 'Third_Baby'], All_Third: ['Third', 'Third_Upper', 'Third_Baby'] };

/**
 * Can this job (and base level) use the item? Follows item_db Jobs / Classes / EquipLevelMin(Max).
 * @returns { ok, reason }
 */
export function itemUsableBy(data, item, classId, baseLv) {
  if (!item) return { ok: false, reason: 'ไม่พบไอเท็ม' };
  const mapid = data.jobs?.[classId]?.mapid;
  if (mapid !== undefined && item.jobs) {
    const code = mapid & 0xFFF;
    const names = Object.keys(ITEM_JOB).filter((n) => ITEM_JOB[n] === code);
    const okJob = Array.isArray(item.jobs) ? names.some((n) => item.jobs.includes(n))
      : item.jobs.all ? !names.some((n) => item.jobs.except?.includes(n)) : true;
    if (!okJob) return { ok: false, reason: 'อาชีพนี้ใช้ไม่ได้' };
  }
  if (mapid !== undefined && item.classes) {
    const cls = itemClassOf(mapid);
    const allowed = item.classes.flatMap((c) => CLASS_GROUPS[c] || [c]);
    if (!allowed.includes(cls)) return { ok: false, reason: `ใช้ได้เฉพาะคลาส ${item.classes.join(', ')}` };
  }
  if (baseLv && item.elv && baseLv < item.elv) return { ok: false, reason: `ต้องมี Base Lv. ${item.elv} ขึ้นไป` };
  if (baseLv && item.elvMax && baseLv > item.elvMax) return { ok: false, reason: `ใช้ได้ถึง Base Lv. ${item.elvMax}` };
  return { ok: true, reason: null };
}

/** @param opt { type, classId, baseLv }  with classId: only items that job can equip (Jobs / Classes / level) */
export function itemsForSlot(data, slot, { type, classId, baseLv } = {}) {
  const locs = SLOTS[slot].loc;
  const out = [];
  for (const [id, it] of Object.entries(data.items)) {
    if (type && it.type !== type) continue;
    if (it.type === 'Card' && type !== 'Card') continue;
    if (!it.loc.some((l) => locs.includes(l))) continue;
    if (classId !== undefined && it.type !== 'Card' && !itemUsableBy(data, it, classId, baseLv).ok) continue;
    out.push(Number(id));
  }
  return out;
}

/** Cards that fit an item in this slot (by card location). */
export function cardsForSlot(data, slot) {
  return itemsForSlot(data, slot, { type: 'Card' });
}

function compiled(data, key, src) {
  if (!data.compiled.has(key)) data.compiled.set(key, compile(src));
  return data.compiled.get(key);
}

const WEAPON_VIEW = { Dagger: 'W_DAGGER', '1hSword': 'W_1HSWORD', '2hSword': 'W_2HSWORD', '1hSpear': 'W_1HSPEAR', '2hSpear': 'W_2HSPEAR',
  '1hAxe': 'W_1HAXE', '2hAxe': 'W_2HAXE', Mace: 'W_MACE', '2hMace': 'W_2HMACE', Staff: 'W_STAFF', Bow: 'W_BOW', Knuckle: 'W_KNUCKLE',
  Musical: 'W_MUSICAL', Whip: 'W_WHIP', Book: 'W_BOOK', Katar: 'W_KATAR', Revolver: 'W_REVOLVER', Rifle: 'W_RIFLE', Gatling: 'W_GATLING',
  Shotgun: 'W_SHOTGUN', Grenade: 'W_GRENADE', Huuma: 'W_HUUMA', '2hStaff': 'W_2HSTAFF' };

/** Refine bonus (already /100 like rAthena) for an item at a refine level. */
export function refineBonus(data, item, refine) {
  if (!refine || !item) return 0;
  const group = item.type === 'Weapon' ? 'Weapon' : item.type === 'Armor' ? 'Armor' : null;
  if (!group) return 0;
  const lv = group === 'Weapon' ? (item.wlv || 1) : (item.alv || 1);
  const table = data.refine[group]?.[lv]?.bonus || [];
  return Math.trunc((table[Math.min(refine, table.length) - 1] || 0) / 100);
}

/**
 * Evaluate a build.
 * @param data   result of loadEquipData()
 * @param build  { slotName: { id, refine, grade, cards: [ids], enchants: [ids] } }
 * @param who    { classId, baseLv, jobLv, sex, stats: { str..crt totals }, skills: { NAME: lv } }
 */
/**
 * @param extra  optional [{ key, script, source }] run like item scripts (buff consumables, see buffs.js)
 */
export function evaluateEquipment(data, build, who, extra = []) {
  const C = data.constants;
  const job = data.jobs[who.classId] || {};
  const slotOf = (eqi) => data.eqiToSlot[typeof eqi === 'string' ? C[eqi] : eqi];
  const piece = (slot) => (slot && build[slot]?.id ? build[slot] : null);
  const equippedIds = new Set();
  for (const p of Object.values(build)) {
    if (!p?.id) continue;
    equippedIds.add(p.id);
    (p.cards || []).forEach((c) => c && equippedIds.add(c));
    (p.enchants || []).forEach((c) => c && equippedIds.add(c));
  }
  const PARAM = { str: 'bStr', agi: 'bAgi', vit: 'bVit', int: 'bInt', dex: 'bDex', luk: 'bLuk',
    pow: 'bPow', sta: 'bSta', wis: 'bWis', spl: 'bSpl', con: 'bCon', crt: 'bCrt' };
  const readStat = Object.fromEntries(Object.entries(PARAM).map(([k, b]) => [b, who.stats?.[k] ?? 0]));
  const baseCtx = {
    constants: C,
    autobonus: who.autobonus,
    param(name) {
      switch (name) {
        case 'BaseLevel': return who.baseLv; case 'JobLevel': return who.jobLv; case 'Class': return who.classId;
        case 'BaseJob': return job.baseJob ?? who.classId; case 'BaseClass': return job.baseClass ?? who.classId;
        case 'Upper': return job.upper ?? 0; case 'Sex': return who.sex ?? 1;
      }
      return undefined;
    },
    readparam: (n) => readStat[n] ?? (n === 'BaseLevel' ? who.baseLv : n === 'JobLevel' ? who.jobLv : 0),
    skill: (n) => who.skills?.[n] ?? 0,
    eaclass: (cls) => (cls === undefined ? job.mapid : data.jobs[cls]?.mapid) ?? 0,
    equipId: (eqi) => piece(slotOf(eqi))?.id ?? -1,
    itemInfo: (id, type) => {
      const it = data.items[id];
      if (!it) return -1;
      if (type === C.ITEMINFO_VIEW && it.type === 'Weapon') return C[WEAPON_VIEW[it.sub]] ?? 0;
      return -1;
    },
    isEquipped: (ids) => ids.every((id) => equippedIds.has(id)),
  };

  const bonuses = [];          // { source, slot, bonus: [name, ...args] }
  const ignored = [];
  const autobonus = [];
  const granted = {};          // skills usable thanks to equipment: { ASC_EDP: { lv: 5, source } }
  const runFor = (key, src, slot, source) => {
    const p = piece(slot);
    const ctx = {
      ...baseCtx,
      refine: (eqi) => (eqi === undefined ? p?.refine ?? 0 : piece(slotOf(eqi))?.refine ?? 0),
      grade: (eqi) => (eqi === undefined ? p?.grade ?? 0 : piece(slotOf(eqi))?.grade ?? 0),
      weaponLevel: (eqi) => data.items[piece(eqi === undefined ? slot : slotOf(eqi))?.id]?.wlv ?? 0,
      armorLevel: (eqi) => data.items[piece(eqi === undefined ? slot : slotOf(eqi))?.id]?.alv ?? 0,
    };
    const r = run(compiled(data, key, src), ctx);
    // an element on ammunition is the arrow element (sd->bonus.arrow_ele), not the weapon's
    r.bonuses.forEach((b) => bonuses.push({ source, slot, bonus: slot === 'ammo' && b[0] === 'bAtkEle' ? ['bArrowEle', ...b.slice(1)] : b }));
    r.ignored.forEach((x) => ignored.push(`${source}: ${x}`));
    r.auto.forEach((x) => autobonus.push({ source, slot, ...x }));
    r.grants.forEach(([sk, lv]) => { if (!(granted[sk]?.lv >= lv)) granted[sk] = { lv, source }; });
  };

  // Base values that are not scripts
  const base = { weaponAtk: 0, weaponRefineAtk: 0, weaponMatk: 0, weaponRefineMatk: 0, overRefineMax: 0,
    def: 0, refineDefRaw: 0, mdef: 0, patk: 0, smatk: 0, res: 0, mres: 0, weaponType: 'Fist', weaponLevel: 0, shield: false,
    weaponWeight: 0, shieldWeight: 0, shieldRefine: 0, arrowAtk: 0, ammoType: null, left: null };
  for (const [slot, p] of Object.entries(build)) {
    const it = p?.id ? data.items[p.id] : null;
    if (!it) continue;
    if (it.type === 'Weapon' && slot === 'weapon') {
      const ref = refineBonus(data, it, p.refine);
      const gradeBonus = (data.grades.Weapon?.[it.wlv] || [])[Math.max(0, (p.grade || 0) - 1)] || 0;
      const refAtk = ref + (p.grade ? Math.trunc(ref * gradeBonus / 100) : 0);
      base.weaponAtk += it.atk || 0;
      base.weaponRefineAtk += refAtk;
      base.weaponMatk += it.matk || 0;
      if (it.sub !== 'Bow') base.weaponRefineMatk += refAtk;
      const lv = data.refine.Weapon?.[it.wlv]; const rnd = lv?.random?.[Math.min(p.refine || 0, 20) - 1];
      base.overRefineMax = Math.trunc((rnd || 0) / 100);
      base.weaponType = it.sub; base.weaponLevel = it.wlv; base.weaponWeight = it.w || 0;
      if (it.wlv === 5) { base.patk += 2 * (p.refine || 0); base.smatk += 2 * (p.refine || 0); }
    } else if (it.type === 'Weapon' && slot === 'shield') {
      // dual wield (Assassin / Kagerou / Oboro line): a one-handed weapon in the left hand (status->lhw)
      const ref = refineBonus(data, it, p.refine);
      const gradeBonus = (data.grades.Weapon?.[it.wlv] || [])[Math.max(0, (p.grade || 0) - 1)] || 0;
      const lv = data.refine.Weapon?.[it.wlv]; const rnd = lv?.random?.[Math.min(p.refine || 0, 20) - 1];
      base.left = { atk: it.atk || 0, refineAtk: ref + (p.grade ? Math.trunc(ref * gradeBonus / 100) : 0), wlv: it.wlv,
        type: it.sub, overRefineMax: Math.trunc((rnd || 0) / 100) };
    } else if (it.type === 'Ammo' && slot === 'ammo') {
      base.arrowAtk = it.atk || 0; base.ammoType = it.sub || null;
    } else if (it.type === 'Armor') {
      base.def += it.def || 0;
      base.refineDefRaw += (data.refine.Armor?.[it.alv || 1]?.bonus || [])[Math.min(p.refine || 0, 20) - 1] || 0;
      if (it.alv === 2) { base.res += 2 * (p.refine || 0); base.mres += 2 * (p.refine || 0); }
      if (slot === 'shield') { base.shield = true; base.shieldWeight = it.w || 0; base.shieldRefine = p.refine || 0; }
    }
  }
  base.def += Math.trunc((base.refineDefRaw + 50) / 100);

  // Item, card and enchant scripts
  for (const [slot, p] of Object.entries(build)) {
    if (!p?.id) continue;
    const it = data.items[p.id];
    if (it?.script) runFor('i' + p.id, it.script, slot, `${it.name}`);
    for (const cid of [...(p.cards || []), ...(p.enchants || [])]) {
      const c = data.items[cid];
      if (c?.script) runFor('i' + cid, c.script, slot, `${c.name} (${it?.name ?? slot})`);
    }
    // random options ("ออฟ"): [{ script: 'bonus bAtkRate,5;' } | 'bonus ...;']
    for (const o of p.options || []) {
      const src = typeof o === 'string' ? o : o?.script;
      if (src) runFor('o:' + src, src, slot, `Option (${it?.name ?? slot})`);
    }
  }
  // Combos: active when every item of one of its sets is equipped
  const seen = new Set();
  for (const id of equippedIds) {
    for (const ci of data.comboIndex.get(id) || []) {
      if (seen.has(ci)) continue;
      seen.add(ci);
      const combo = data.combos[ci];
      const set = combo.sets.find((s) => s.every((x) => equippedIds.has(x)));
      if (!set) continue;
      const slot = Object.keys(build).find((k) => build[k]?.id === set[0]);
      runFor('c' + ci, combo.script, slot, 'Set: ' + set.map((x) => data.items[x]?.name ?? x).join(' + '));
    }
  }

  // Consumables / other scripted buffs
  for (const x of extra) runFor(x.key, x.script, null, x.source);

  return { base, bonuses, ignored, autobonus, grantedSkills: granted, totals: sumBonuses(bonuses), status: toStatus(base, bonuses) };
}

/** Sum bonuses by name + non-numeric args: { 'bStr': 5, 'bAddRace:RC_Demon': 10, ... } */
export function sumBonuses(list) {
  const t = {};
  for (const { bonus } of list) {
    const [name, ...args] = bonus;
    const nums = args.filter((a) => typeof a === 'number');
    const keys = args.filter((a) => typeof a !== 'number');
    const key = [name, ...keys].join(':');
    const v = nums.length ? nums[nums.length - 1] : 1;
    if (args.length > 2 && nums.length > 1) { (t[key + ':list'] ||= []).push(args); continue; }
    t[key] = (t[key] || 0) + v;
  }
  return t;
}

/** Turn bonuses into the inputs the status calculator understands. */
export function toStatus(base, list) {
  const s = {
    stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0, pow: 0, sta: 0, wis: 0, spl: 0, con: 0, crt: 0 },
    hpFlat: 0, hpRate: 0, spFlat: 0, spRate: 0, apFlat: 0, apRate: 0,
    weaponAtk: base.weaponAtk, refineAtk: base.weaponRefineAtk, overRefineMax: base.overRefineMax, equipAtk: 0, atkRate: 0, weaponAtkRate: 0,
    weaponMatk: base.weaponMatk, refineMatk: base.weaponRefineMatk, equipMatk: 0, matkRate: 0, weaponMatkRate: 0,
    def: base.def, defRate: 0, mdef: 0, mdefRate: 0, def2: 0, mdef2: 0,
    hit: 0, hitRate: 0, flee: 0, fleeRate: 0, flee2: 0, cri: 0, criRate: 0,
    aspd: 0, aspdRate: 0, variableCastRate: 0, fixedCastRate: 0, fixedCast: 0, delayRate: 0, cooldown: 0,
    patk: base.patk, smatk: base.smatk, res: base.res, mres: base.mres, hplus: 0, crate: 0,
    weaponType: base.weaponType, shield: base.shield, leftWeaponType: base.left?.type || null,
  };
  const ALL = ['str', 'agi', 'vit', 'int', 'dex', 'luk'], TRAIT = ['pow', 'sta', 'wis', 'spl', 'con', 'crt'];
  for (const { bonus } of list) {
    const [name, a, b] = bonus;
    const v = typeof a === 'number' ? a : 0;
    switch (name) {
      case 'bStr': case 'bAgi': case 'bVit': case 'bInt': case 'bDex': case 'bLuk':
      case 'bPow': case 'bSta': case 'bWis': case 'bSpl': case 'bCon': case 'bCrt':
        s.stats[name.slice(1).toLowerCase()] += v; break;
      case 'bAllStats': ALL.forEach((k) => { s.stats[k] += v; }); break;
      case 'bAllTraitStats': TRAIT.forEach((k) => { s.stats[k] += v; }); break;
      case 'bAgiVit': s.stats.agi += v; s.stats.vit += v; break;
      case 'bAgiDexStr': s.stats.agi += v; s.stats.dex += v; s.stats.str += v; break;
      case 'bMaxHP': s.hpFlat += v; break; case 'bMaxHPrate': s.hpRate += v; break;
      case 'bMaxSP': s.spFlat += v; break; case 'bMaxSPrate': s.spRate += v; break;
      case 'bMaxAP': s.apFlat += v; break; case 'bMaxAPrate': s.apRate += v; break;
      case 'bBaseAtk': s.equipAtk += v; break; case 'bAtkRate': s.atkRate += v; break; case 'bWeaponAtkRate': s.weaponAtkRate += v; break;
      case 'bMatk': case 'bMatk2': s.equipMatk += v; break;
      case 'bAtk2': s.refineAtk += v; break; case 'bMatkRate': s.matkRate += v; break; case 'bWeaponMatkRate': s.weaponMatkRate += v; break;
      case 'bDef': s.def += v; break; case 'bDefRate': s.defRate += v; break; case 'bDef2': s.def2 += v; break;
      case 'bMdef': s.mdef += v; break; case 'bMdefRate': s.mdefRate += v; break; case 'bMdef2': s.mdef2 += v; break;
      case 'bHit': s.hit += v; break; case 'bHitRate': s.hitRate += v; break;
      case 'bFlee': s.flee += v; break; case 'bFleeRate': s.fleeRate += v; break;
      case 'bFlee2': s.flee2 += v * 10; break;
      case 'bCritical': s.cri += v * 10; break; case 'bCriticalRate': s.criRate += v; break;
      case 'bAspd': s.aspd += v; break; case 'bAspdRate': s.aspdRate += v; break;
      case 'bVariableCastrate': if (b === undefined) s.variableCastRate += v; break;
      case 'bFixedCastrate': if (b === undefined) s.fixedCastRate += v; break;
      case 'bFixedCast': if (b === undefined) s.fixedCast += v; break;
      case 'bDelayrate': s.delayRate += v; break;
      case 'bPAtk': s.patk += v; break; case 'bSMatk': s.smatk += v; break;
      case 'bRes': s.res += v; break; case 'bMRes': s.mres += v; break;
      case 'bHPlus': s.hplus += v; break; case 'bCRate': s.crate += v; break;
    }
  }
  return s;
}
