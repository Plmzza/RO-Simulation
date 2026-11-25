/**
 * Status-change engine: runs the server's own status code (data/sc.json, built by tools/build_sc_data.py) so every
 * buff skill works the way the server computes it.
 *
 *   const active = scActivate(db.sc, { AL_BLESSING: 10, KN_TWOHANDQUICKEN: 10 }, env);   // -> { SC_BLESSING: {...} }
 *   const calc = scCalculator(db.sc, active, env);
 *   calc('str', 120)       // status_calc_str
 *   calc('aspd', true)     // status_calc_aspd(fixed) -> bonus
 *
 * env: { skills: { NAME: lv } learned, status: { str, agi, ..., baseLv }, weapon: 'Katar', paramBonus: { agi, dex },
 *        selfCast: Set of skills the build casts itself }
 */
import { runVar } from './cskill.js';

const CONST = {
  SHRT_MAX: 32767, SHRT_MIN: -32768, USHRT_MAX: 65535, INT_MAX: 2147483647, INT_MIN: -2147483648,
  DEFTYPE_MIN: -32768, DEFTYPE_MAX: 32767, MIN_ASPD: 2000, AMOTION_ZERO_ASPD: 2000, AMOTION_INTERVAL: 10,
  ELE_NEUTRAL: 0, ELE_WATER: 1, ELE_EARTH: 2, ELE_FIRE: 3, ELE_WIND: 4, ELE_POISON: 5, ELE_HOLY: 6, ELE_DARK: 7, ELE_GHOST: 8,
  ELE_UNDEAD: 9, ELE_ALL: 10, UCHAR_MAX: 255,
  BF_WEAPON: 1, BF_MAGIC: 2, BF_MISC: 4, BF_SHORT: 16, BF_LONG: 64, BF_SKILL: 256, BF_NORMAL: 512,
};
export const ELE_NAMES = ['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Dark', 'Ghost', 'Undead'];
export const eleIndex = (e) => (typeof e === 'number' ? e : Math.max(0, ELE_NAMES.findIndex((n) => n.toLowerCase() === String(e).replace(/^ELE_/i, '').toLowerCase())));
const W_CODE = { Fist: 'W_FIST', Dagger: 'W_DAGGER', '1hSword': 'W_1HSWORD', '2hSword': 'W_2HSWORD', '1hSpear': 'W_1HSPEAR',
  '2hSpear': 'W_2HSPEAR', '1hAxe': 'W_1HAXE', '2hAxe': 'W_2HAXE', Mace: 'W_MACE', '2hMace': 'W_2HMACE', Staff: 'W_STAFF',
  Bow: 'W_BOW', Knuckle: 'W_KNUCKLE', Musical: 'W_MUSICAL', Whip: 'W_WHIP', Book: 'W_BOOK', Katar: 'W_KATAR', Revolver: 'W_REVOLVER',
  Rifle: 'W_RIFLE', Gatling: 'W_GATLING', Shotgun: 'W_SHOTGUN', Grenade: 'W_GRENADE', Huuma: 'W_HUUMA', '2hStaff': 'W_2HSTAFF' };
/** skills whose SC remembers whether it was self-cast (skill.cpp passes val2 = src == bl) */
/** skills whose status is not in data/sc.json buffs but used by damage.js */
const EXTRA_SKILL_SC = { HW_MAGICPOWER: { sc: 'SC_MAGICPOWER', maxLv: 10 } };
const SELF_FLAG = new Set(['SC_OVERTHRUST', 'SC_ADRENALINE', 'SC_ADRENALINE2', 'SC_WEAPONPERFECTION']);

function makeEnv(env, active, scdb = {}) {
  const st = env.status || {};
  const lv = st.baseLv || 1;
  const sd = {
    status: { weapon: W_CODE[env.weapon] || 'W_FIST', base_level: lv, job_level: st.jobLv || 1, str: st.str, agi: st.agi,
      vit: st.vit, int_: st.int, dex: st.dex, luk: st.luk },
    indexed_bonus: { param_bonus: [env.paramBonus?.str || 0, env.paramBonus?.agi || 0, env.paramBonus?.vit || 0,
      env.paramBonus?.int || 0, env.paramBonus?.dex || 0, env.paramBonus?.luk || 0] },
    bonus: { hp: 0, sp: 0 }, spiritball: env.spiritball || 0, weapontype1: W_CODE[env.weapon] || 'W_FIST',
    class_: 0, state: {},
  };
  const sc = {
    getSCE: (name) => active[name] || 0,
    hasSCE: (name) => (active[name] ? 1 : 0),
    empty: () => (Object.keys(active).length ? 0 : 1),
  };
  const status = { str: st.str, agi: st.agi, vit: st.vit, int_: st.int, dex: st.dex, luk: st.luk, race: env.race || 'RC_PLAYER_HUMAN',
    def_ele: eleIndex(env.defEle || 'Neutral'), class_: env.classType || 'CLASS_NORMAL', max_hp: st.hp, hp: st.hp, max_sp: st.sp, sp: st.sp, batk: st.atk || 0, size: 'SZ_MEDIUM' };
  const bl = { type: env.blType || 'BL_PC', id: 1 };
  const stat = (k) => () => st[k] || 0;
  const funcs = {
    pc_checkskill: (_sd, name) => env.skills?.[name] || 0,
    pc_checkskill_summoner: () => 0, pc_isriding: () => (env.riding === 'peco' ? 1 : 0),
    pc_isridingdragon: () => (env.riding === 'dragon' ? 1 : 0), pc_ismadogear: () => 0, pc_isridingwug: () => 0,
    pc_check_weapontype: () => 1, pc_is_maxjoblv: () => 1, pc_checkequip: () => -1,
    status_get_lv: () => lv, status_get_sc: () => sc, status_get_status_data: () => status,
    status_get_str: stat('str'), status_get_agi: stat('agi'), status_get_vit: stat('vit'), status_get_int: stat('int'),
    status_get_dex: stat('dex'), status_get_luk: stat('luk'), status_get_max_hp: stat('hp'), status_get_hp: stat('hp'),
    status_get_max_sp: stat('sp'), status_get_sp: stat('sp'), status_get_class: () => 0, status_get_race: () => 'RC_PLAYER_HUMAN',
    status_change_end: () => 0, sc_start: () => 0, sc_start2: () => 0, sc_start4: () => 0, status_change_start: () => 0,
    skill_get_time: () => 0, skill_get_time2: () => 0, skill_get_type: () => 0, skill_get_ele: (name, lv) => {
      const e = scdb.skillEle?.[name];
      return eleIndex(Array.isArray(e) ? e[Math.min(lv || 1, e.length) - 1] : e || 'Neutral');
    },
    battle_skill_stacks_masteries_vvs: () => 1, battle_calc_chorusbonus: () => 0, map_flag_vs: () => 0, map_flag_gvg: () => 0,
    map_flag_gvg2: () => 0, map_getmapdata: () => ({}), mapdata_flag_gvg: () => 0, mapdata_flag_gvg2: () => 0, mapdata_flag_vs: () => 0,
    skill_get_inf2: () => 0, is_attack_left_handed: () => 0, status_change_clear_buffs: () => 0, clif_status_change: () => 0, battle_check_undead: () => 0, rnd: () => 0, rnd_value: (a) => a, distance_bl: () => 0,
    status_get_homluk: () => 0, status_get_homstr: () => 0, status_get_homdex: () => 0, pc_get_group_level: () => 0,
    __arr: (...a) => a, min: Math.min, max: Math.max, cap_value: (v, a, b) => Math.min(Math.max(v, a), b), abs: Math.abs, sqrt: Math.sqrt,
  };
  return { sd, sc, status, bl, funcs };
}

/**
 * Start the SCs of the selected buff skills. Returns { active: { SC_X: { val1..val4, skill } }, refused: [skill], unsupported }
 * @param selected { SKILL: lv }   also { SC_X: { val1, ... } } entries to put an SC in directly (consumables)
 */
export function scActivate(scdb, selected, env = {}) {
  const active = {};
  const refused = [], unsupported = [];
  const order = Object.entries(selected || {});
  for (const [key, lv] of order) {
    let b, vals;
    if (/^SC_/.test(key)) {                    // status change given directly (consumables): { val1, val2, ... }
      b = { sc: key, maxLv: Infinity };
      vals = { val1: 0, val2: 0, val3: 0, val4: 0, ...lv };
    } else {
      b = scdb.buffs[key] || EXTRA_SKILL_SC[key];
      if (!b) {                               // a debuff skill (status put on a monster)
        const d = Object.values(scdb.debuffs || {}).find((x) => x.skills.includes(key));
        if (d) b = { sc: d.sc, maxLv: scdb.skillMax?.[key] || d.maxLv };
      }
      if (!b || !(lv > 0)) continue;
      vals = { val1: Math.min(lv, b.maxLv), val2: 0, val3: 0, val4: 0 };
      if (SELF_FLAG.has(b.sc)) vals.val2 = env.selfCast?.has(key) ? 1 : 0;
      // values the skill itself passes to sc_start (Fighting Spirit from Rune Mastery, Clementia from Blessing...).
      // Cast by yourself: your skills; cast by someone else: the caster is assumed to have the related skills maxed.
      if (b.valsCode) {
        const self = env.selfCast?.has(key);
        const e0 = makeEnv(env, active, scdb);
        const me = e0.bl, other = { type: 'BL_PC', id: 2 };
        const funcs = { ...e0.funcs,
          pc_checkskill: (_sd, name) => (self ? env.skills?.[name] || 0 : scdb.skillMax?.[name] || 0),
          skill_get_max: (name) => scdb.skillMax?.[name] || 0, getSkillId: () => key, skill_get_sc: () => b.sc,
          party_foreachsamemap: () => 1, clif_skill_nodamage: () => 0, clif_skill_fail: () => 0 };
        const r = runVar(b.valsCode, { vars: { ...e0, src: self ? me : other, target: me, bl: me, sstatus: e0.status,
          skill_lv: vals.val1, flag: 1 }, funcs, constants: CONST, skill_lv: vals.val1 }, '__v1', vals.val1);
        ['__v1', '__v2', '__v3', '__v4'].forEach((k, n) => {
          const v = r.scope?.[k];
          if (typeof v === 'number' && Number.isFinite(v)) vals['val' + (n + 1)] = Math.trunc(v);
          else if (typeof v === 'string' && /^[A-Z]{2,4}_[A-Z0-9_]+$/.test(v)) vals['val' + (n + 1)] = v;   // a skill id (Soul Link: val2 = SL_*)
        });
      }
    }
    if (active[b.sc] && active[b.sc].val1 >= vals.val1) continue;   // the stronger one of the same status stays
    const e = makeEnv(env, active, scdb);
    const vars = { ...e, ...vals, type: b.sc, src: env.src || e.bl, tick: 0, duration: 0, flag: 0, undead_flag: env.undead ? 1 : 0, rate: 10000,
      scdb: { skill_id: key }, skill_lv: vals.val1 };
    const check = scdb.refuse?.[b.sc];
    if (check) {
      const r = runVar(check, { vars, funcs: e.funcs, constants: CONST, useReturn: true }, '__r', undefined);
      if (r.returned === 0 || r.returned === false || r.returned === 'false') { refused.push(key); continue; }
    }
    const code = scdb.start?.[b.sc];
    if (code) {
      const r = runVar(code, { vars, funcs: e.funcs, constants: CONST, useReturn: true }, '__r', undefined);
      if (r.returned === 0 || r.returned === 'false') { refused.push(key); continue; }
      for (const k of ['val1', 'val2', 'val3', 'val4']) if (r.scope && k in r.scope) vals[k] = typeof r.scope[k] === 'string' && /^[A-Z]{2,4}_/.test(r.scope[k]) ? r.scope[k] : Number(r.scope[k]) || 0;
      unsupported.push(...r.unsupported.map((u) => `${key}: ${u}`));
    }
    active[b.sc] = { ...vals, skill: /^SC_/.test(key) ? null : key };
  }
  // Concentration remembers the AGI/DEX from cards so they are left out of its % (status_calc_pc)
  if (active.SC_CONCENTRATE) { active.SC_CONCENTRATE.val3 = env.paramBonus?.agi || 0; active.SC_CONCENTRATE.val4 = env.paramBonus?.dex || 0; }
  return { active, refused, unsupported };
}

/** calc(name, value) runs status_calc_<name> (or atkpercent / hpbonus / aspd) for the active SCs. */
export function scCalculator(scdb, active, env = {}) {
  const e = makeEnv(env, active, scdb);
  const unsupported = new Set();
  const calc = (name, value, extra = {}) => {
    const fn = scdb.calc[name];
    if (!fn) return fn?.returns ? 0 : value;
    const passThrough = ['attack_element', 'element', 'element_lv'].includes(name);   // return the value itself when unchanged
    if (!Object.keys(active).length && !['hpbonus', 'spbonus', 'matk'].includes(name)) {
      return name === 'atkpercent' ? 100 : fn.returns && !passThrough ? 0 : value;
    }
    const vars = { ...e, ...extra, [fn.param]: value };
    const r = runVar(fn.code, { vars, funcs: e.funcs, constants: CONST, useReturn: true }, fn.param, value);
    r.unsupported.forEach((u) => unsupported.add(`${name}: ${u}`));
    if (!r.scope) return fn.returns ? 0 : value;          // parse error (reported in unsupported)
    if (fn.returns) { const v = Number(r.returned); return Number.isFinite(v) ? v : passThrough ? value : 0; }
    const v = r.returned !== undefined ? r.returned : r.scope[fn.param];
    return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : value;
  };
  /** skill_vfcastfix status part for one skill: { timeMul, reduceRate, fixcastRate, fixedAdd } */
  calc.cast = (skillId, skillLv) => {
    const fn = scdb.calc.cast;
    if (!fn || !Object.keys(active).length) return { timeMul: 1, reduceRate: 0, fixcastRate: 0, fixedAdd: 0, fixedZero: false };
    const base = 1000000;
    const vars = { ...e, time: base, fixed: 1000000, varcast_r: 0, reduce_cast_rate: 0, fixcast_r: 0, skill_id: skillId,
      skill_lv: skillLv, flag: 0 };
    const r = runVar(fn.code, { vars, funcs: e.funcs, constants: CONST, skill_lv: skillLv }, 'time', base);
    r.unsupported.forEach((u) => unsupported.add(`cast: ${u}`));
    const sc = r.scope || {};
    const fixed = 'fixed' in sc ? Number(sc.fixed) : 1000000;
    return { timeMul: (Number(sc.time ?? base)) / base, reduceRate: Number(sc.reduce_cast_rate || 0), fixcastRate: Number(sc.fixcast_r || 0),
      fixedAdd: fixed === 0 ? 0 : fixed - 1000000, fixedZero: fixed === 0 };
  };
  e.funcs.battle_get_atkpercent = (_bl, skillId) => calc('atkpercent', skillId);
  /** battle_calc_attack_skill_ratio, status part: ATK% buffs + Power Thrust / Max / Frenzy + bSkillRatio */
  calc.skillratio = (skillId, skillLv, bonusRatio = 0) => {
    const fn = scdb.calc.skillratio;
    const sd = { ...e.sd, bonus: { ...e.sd.bonus, skill_ratio: bonusRatio } };
    const vars = { ...e, sd, skill_id: skillId, src: e.bl, target: { type: 'BL_MOB' }, sstatus: e.status, tstatus: {} };
    const r = runVar(fn.code, { vars, funcs: e.funcs, constants: CONST, skill_lv: skillLv }, 'skillratio', 100);
    r.unsupported.forEach((u) => unsupported.add(`skillratio: ${u}`));
    const v = Number(r.scope?.skillratio);
    return Number.isFinite(v) ? Math.trunc(v) : 100 + bonusRatio;
  };
  /** battle_attack_sc_bonus on the damage parts { statusAtk, weaponAtk, equipAtk, masteryAtk, damage } */
  calc.scBonus = (wd, o = {}) => {
    if (!Object.keys(active).length) return wd;
    const fn = scdb.calc.sc_bonus;
    const t = o.mob || {};
    const vars = { ...e, wd, skill_id: o.skillId || 0, src: e.bl, target: { type: 'BL_MOB' },
      sstatus: { ...e.status, matk_min: o.matk?.[0] || 0, matk_max: o.matk?.[1] || 0 },
      tstatus: { mdef: t.mdef || 0, mdef2: t.mdef2 || 0, race: 'RC_' + String(t.race || '').toUpperCase(), def_ele: eleIndex(t.ele || 'Neutral'),
        size: t.size, class_: t.class === 'Boss' ? 'CLASS_BOSS' : 'CLASS_NORMAL' } };
    const r = runVar(fn.code, { vars, funcs: e.funcs, constants: CONST, skill_lv: o.skillLv }, '__unused', 0);
    r.unsupported.forEach((u) => unsupported.add(`sc_bonus: ${u}`));
    return wd;
  };
  /**
   * battle_calc_damage, status part: the target's statuses (Kaite, Raid, Dark Crow, Assumptio, Steel Body, Defender...)
   * and the caster's final ones (Breaking Limit, Poisoning Weapon...). o = { flag: BF_*, skillId, skillLv, div, target: {
   * active: {SC_X: vals}, type: 'BL_MOB'|'BL_PC', boss, sd } } → damage (number).
   */
  calc.finalDamage = (damage, o = {}) => {
    const fn = scdb.calc.calc_damage;
    const t = o.target || {};
    const tact = t.active || {};
    const own = o.noCaster ? {} : active;          // noCaster: the player is the one being hit (monster attacks)
    if (!fn || (!Object.keys(own).length && !Object.keys(tact).length)) return damage;
    const csc = { getSCE: (n) => own[n] || 0, empty: () => (Object.keys(own).length ? 0 : 1) };
    const tsc = { getSCE: (n) => tact[n] || 0, empty: () => (Object.keys(tact).length ? 0 : 1) };
    const bl = { type: t.type || 'BL_MOB', id: 2 };
    const src = e.bl;
    const funcs = { ...e.funcs,
      status_get_sc: (x) => (x === bl ? tsc : csc),
      status_get_class_: () => (t.boss ? 'CLASS_BOSS' : 'CLASS_NORMAL'), status_get_class: () => (t.boss ? 'CLASS_BOSS' : 'CLASS_NORMAL'),
      status_get_element: () => o.element ?? 0, status_change_end: () => 0, status_heal: () => 0, rnd_chance: () => 0,
      i64max: (a, b) => Math.max(a, b), map_flag_gvg2: () => (o.gvg ? 1 : 0), battle_getcurrentskill: () => o.skillId || 0 };
    const vars = { ...e, damage, flag: o.flag || 0, div_: o.div || 1, skill_id: o.skillId || 0, skill_lv: o.skillLv || 0,
      sc: csc, tsc, src: o.noCaster ? { type: 'BL_MOB', id: 3 } : src, bl, sd: t.type === 'BL_PC' ? (t.sd || e.sd) : null,
      tsd: o.noCaster ? null : e.sd, sce: null };
    const r = runVar(fn.code, { vars, funcs: { ...funcs, rnd: () => 99 }, constants: CONST, useReturn: true, skill_lv: o.skillLv }, 'damage', damage);
    r.unsupported.forEach((u) => unsupported.add(`calc_damage: ${u}`));
    const v = r.returned !== undefined ? Number(r.returned) : Number(r.scope?.damage);
    return Number.isFinite(v) ? Math.trunc(v) : damage;
  };
  calc.unsupported = unsupported;
  calc.active = active;
  return calc;
}
