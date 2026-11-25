/**
 * Renewal damage against a monster, following rAthena battle.cpp (battle_calc_weapon_attack /
 * battle_calc_magic_attack) for a player attacker. Player buffs come in through build.status.scCalc (calc/sc.js),
 * monster debuffs through opt.debuffs.
 *
 *   const out = calculateDamage(db, build, { skill: 'RK_SONICWAVE', level: 10, mobId: 1002 });
 *   out.min / out.max / out.avg       damage of one cast (all hits)
 *   out.crit                           { min, max, avg } when the attack can crit
 *   out.hitRate, out.critRate          in %
 *   out.cast                            cast/delay/cooldown in ms (skills)
 *   out.chance                          { crit, perfectHit, hit, land } in % (land = chance an attack connects)
 *   out.kill                            { hits, casts, seconds, ... } time to kill the monster
 *   out.steps                           formula breakdown for the UI
 *
 *   calculateDefense(db, build, { mobId, attackers })  monster -> player: hit chance, perfect dodge, damage taken
 */
import { runRatio, runVar } from './cskill.js';
import { debuffEffects } from './buffs.js';
import { scActivate, scCalculator, ELE_NAMES, eleIndex } from './sc.js';

const ELE = ['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Dark', 'Ghost', 'Undead'];
const ELE_CONST = { ELE_NEUTRAL: 0, ELE_WATER: 1, ELE_EARTH: 2, ELE_FIRE: 3, ELE_WIND: 4, ELE_POISON: 5, ELE_HOLY: 6, ELE_DARK: 7,
  ELE_GHOST: 8, ELE_UNDEAD: 9 };
/** Monster skills whose damage is a fixed / HP-based formula rather than ATK × ratio (battle_calc_misc_attack etc.). */
/**
 * battle_calc_return_damage: share of a landed hit sent back to the attacker by the target (a player).
 * T = the target's equip totals, act = its active statuses. Magic: bMagicDamageReturn is a chance to reflect the spell.
 */
function returnDamage(T, act, { isLong, magic, skillId }) {
  if (magic) return { percent: 0, magicChance: Math.min(100, T.bMagicDamageReturn || 0) };
  let pct = 0;
  if (!isLong) {
    pct += T.bShortWeaponDamageReturn || 0;
    if (act.SC_REFLECTSHIELD && skillId !== 'WS_CARTTERMINATION') pct += act.SC_REFLECTSHIELD.val2 || 0;
  } else pct += T.bLongWeaponDamageReturn || 0;
  return { percent: pct, magicChance: 0 };
}

const SPECIAL_MOB_SKILLS = new Set(['NPC_EVILLAND']);   // heal-based damage: not calculated
const GUNS = ['Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade'];
const RANGED = ['Bow', 'Musical', 'Whip', 'Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade'];
const W_CODE = { Fist: 'W_FIST', Dagger: 'W_DAGGER', '1hSword': 'W_1HSWORD', '2hSword': 'W_2HSWORD', '1hSpear': 'W_1HSPEAR',
  '2hSpear': 'W_2HSPEAR', '1hAxe': 'W_1HAXE', '2hAxe': 'W_2HAXE', Mace: 'W_MACE', '2hMace': 'W_2HMACE', Staff: 'W_STAFF',
  Bow: 'W_BOW', Knuckle: 'W_KNUCKLE', Musical: 'W_MUSICAL', Whip: 'W_WHIP', Book: 'W_BOOK', Katar: 'W_KATAR', Revolver: 'W_REVOLVER',
  Rifle: 'W_RIFLE', Gatling: 'W_GATLING', Shotgun: 'W_SHOTGUN', Grenade: 'W_GRENADE', Huuma: 'W_HUUMA', '2hStaff': 'W_2HSTAFF' };
const SIZE_C = { Small: 'SZ_SMALL', Medium: 'SZ_MEDIUM', Large: 'SZ_BIG' };
const trunc = Math.trunc;

/** Monster status as rAthena computes it (status_calc_misc for non-players). */
export function mobStatus(mob, deb, db) {
  let st = { str: mob.str, agi: mob.agi, vit: mob.vit, int: mob.int, dex: mob.dex, luk: mob.luk };
  let def = mob.def, def2 = trunc((mob.lv + mob.vit) / 2), mdef = mob.mdef, mdef2 = trunc((mob.int + mob.lv) / 4);
  let hit = mob.lv + mob.dex + 150, flee = mob.lv + mob.agi + 100, res = mob.res, mres = mob.mres;
  let active = {}, refused = [];
  // debuffs: the server's status code run on the monster (Provoke, Decrease AGI, Signum Crucis, Quagmire, strips...)
  if (deb && db?.sc && Object.keys(deb.sc || {}).length) {
    const env = { blType: 'BL_MOB', status: { ...st, baseLv: mob.lv, hp: mob.hp, sp: 0 }, race: 'RC_' + String(mob.race).toUpperCase().replace(/[^A-Z_]/g, ''),
      defEle: mob.ele, classType: mob.class === 'Boss' || mob.mvp ? 'CLASS_BOSS' : 'CLASS_NORMAL',
      undead: mob.ele === 'Undead' || mob.race === 'Undead', skills: {}, src: { type: 'BL_PC', id: 2 } };   // cast by a player
    const act = scActivate(db.sc, deb.sc, env);
    active = act.active; refused = act.refused;
    const C = scCalculator(db.sc, active, env);
    for (const k of ['str', 'agi', 'vit', 'int', 'dex', 'luk']) st[k] = Math.max(0, C(k, st[k]));
    def = C('def', def); def2 = C('def2', trunc((mob.lv + st.vit) / 2)); mdef = C('mdef', mdef); mdef2 = C('mdef2', trunc((st.int + mob.lv) / 4));
    hit = C('hit', mob.lv + st.dex + 150); flee = C('flee', mob.lv + st.agi + 100); res = C('res', res); mres = C('mres', mres);
  }
  return {
    ...mob, ...st, def, def2, mdef, mdef2, hit, flee, res, mres, debuffActive: active, debuffRefused: refused,
    flee2: 0, // battle.conf enable_perfect_flee: 1 -> only players have Perfect Dodge
    batk: st.str + mob.lv, // status_base_atk for monsters (renewal): str + level
  };
}

/** Skills whose range type is fixed in battle_range_type() regardless of the cast range. */
const LONG_SKILLS = new Set(['KN_BRANDISHSPEAR', 'SR_RAMPAGEBLASTER', 'BO_ACIDIFIED_ZONE_WATER_ATK', 'BO_ACIDIFIED_ZONE_FIRE_ATK',
  'BO_ACIDIFIED_ZONE_GROUND_ATK', 'BO_ACIDIFIED_ZONE_WIND_ATK', 'NW_THE_VIGILANTE_AT_NIGHT', 'SS_KUNAIKAITEN', 'SS_KUNAIKUSSETSU',
  'SS_HITOUAKUMU', 'RK_DRAGONBREATH', 'RK_DRAGONBREATH_WATER']);
const SHORT_SKILLS = new Set(['NJ_KIRIKAGE', 'GC_CROSSIMPACT', 'DK_SERVANT_W_PHANTOM', 'SHC_SAVAGE_IMPACT', 'SHC_FATAL_SHADOW_CROW',
  'MT_RUSH_QUAKE', 'MT_RUSH_STRIKE', 'ABC_UNLUCKY_RUSH', 'ABC_CHASING_BREAK', 'MH_THE_ONE_FIGHTER_RISES', 'NPC_MAXPAIN_ATK',
  'SS_SHIMIRU', 'SKE_STAR_LIGHT_KICK']);
/** Skills that never use bDefRatioAtk* piercing (is_attack_piercing). */
const NO_PIERCE = new Set(['PA_SACRIFICE', 'CR_GRANDCROSS', 'NPC_GRANDDARKNESS', 'PA_SHIELDCHAIN', 'KO_HAPPOKUNAI']);

/** Highest bPerfectHitRate + sum of bPerfectHitAddRate (pc_bonus / status_calc_pc). */
function perfectHit(eq) {
  let best = 0, add = 0;
  for (const { bonus } of eq.bonuses || []) {
    if (bonus[0] === 'bPerfectHitRate') best = Math.max(best, Number(bonus[1]) || 0);
    else if (bonus[0] === 'bPerfectHitAddRate') add += Number(bonus[1]) || 0;
  }
  return Math.min(100, Math.max(0, best + add));
}

/** Monster hits / casts / time needed to kill. dmgLanded = average damage of one attack that connects. */
function timeToKill(hp, dmgLanded, minD, maxD, land, cycleMs, aeterna) {
  if (!(dmgLanded > 0) || !(land > 0)) return null;
  const need = (per) => {
    if (!(per > 0)) return Infinity;
    if (aeterna) return per * 2 >= hp ? 1 : 1 + Math.ceil((hp - per * 2) / per);
    return Math.ceil(hp / per);
  };
  const hits = need(dmgLanded);
  const attempts = hits / land;
  return { hits, minHits: need(maxD), maxHits: need(minD), attempts: Math.round(attempts * 100) / 100,
    seconds: Number.isFinite(cycleMs) ? Math.round(attempts * cycleMs) / 1000 : null };
}

/** rAthena battle_attr_fix (renewal ratio part), incl. attacker ground buffs and target statuses. */
function attr(db, atkEle, mob, sc = {}, tsc = {}, magic = false) {
  const lv = Math.min(Math.max(mob.eleLv || 1, 1), 4);
  let ratio = db.battle.attr[lv]?.[atkEle]?.[mob.ele] ?? 100;
  const v = (t, k, f = 'val3') => t[k] ? (t[k][f] || 0) : 0;
  switch (atkEle) {
    case 'Fire': ratio += v(sc, 'SC_VOLCANO')
      + (tsc.SC_SPIDERWEB ? 100 : 0) + (tsc.SC_EARTH_INSIGNIA ? 50 : 0) + (tsc.SC_WIDEWEB ? 100 : 0) + (tsc.SC_BURNT ? 400 : 0); break;
    case 'Wind': ratio += v(sc, 'SC_VIOLENTGALE') + (tsc.SC_WATER_INSIGNIA ? 50 : 0) + (tsc.SC_CRYSTALIZE && magic ? 50 : 0); break;
    case 'Water': ratio += v(sc, 'SC_DELUGE') + (tsc.SC_FIRE_INSIGNIA ? 50 : 0); break;
    case 'Earth': ratio += tsc.SC_WIND_INSIGNIA ? 50 : 0; break;
    case 'Holy': ratio += tsc.SC_ORATIO ? tsc.SC_ORATIO.val1 * 2 : 0; break;
    case 'Poison': ratio += v(tsc, 'SC_VENOMIMPRESS', 'val2'); break;
    case 'Neutral': ratio += v(tsc, 'SC_ANTI_M_BLAST', 'val2'); break;
    case 'Dark': ratio += tsc.SC_SOULCURSE ? (mob.boss ? 20 : 100) : 0; break;
    case 'Ghost': if (sc.SC_TELEKINESIS_INTENSE) ratio += trunc(ratio * sc.SC_TELEKINESIS_INTENSE.val3 / 100); break;
  }
  return Math.max(0, ratio);
}

/** rAthena battle_addmastery (renewal): flat ATK from passive skills. */
function mastery(skills, weapon, mob, S) {
  const lv = (n) => skills[n] || 0;
  let d = 0;
  const undeadOrDemon = mob.ele === 'Undead' || mob.race === 'Undead' || mob.race === 'Demon';
  if (lv('AL_DEMONBANE') && undeadOrDemon) d += trunc(lv('AL_DEMONBANE') * (S.base_level / 20 + 3));
  if (lv('RA_RANGERMAIN') && ['Brute', 'Player_Doram', 'Fish', 'Plant'].includes(mob.race)) d += lv('RA_RANGERMAIN') * 5;
  if (lv('NC_RESEARCHFE') && ['Fire', 'Earth'].includes(mob.ele)) d += lv('NC_RESEARCHFE') * 10;
  d += 15 * lv('NC_MADOLICENCE');
  if (lv('HT_BEASTBANE') && ['Insect', 'Brute', 'Player_Doram'].includes(mob.race)) d += lv('HT_BEASTBANE') * 4;
  d += lv('BS_WEAPONRESEARCH') * 2;
  if (lv('NV_BREAKTHROUGH')) d += 15 * lv('NV_BREAKTHROUGH') + (lv('NV_BREAKTHROUGH') > 4 ? 25 : 0);
  switch (weapon) {
    case '1hSword': d += lv('AM_AXEMASTERY') * 3; // falls through
    case 'Dagger': d += lv('SM_SWORD') * 4 + lv('GN_TRAINING_SWORD') * 10; break;
    case '2hSword': d += lv('SM_TWOHAND') * 4; break;
    case '1hSpear': case '2hSpear':
      if (lv('KN_SPEARMASTERY')) d += lv('KN_SPEARMASTERY') * 4 + (lv('RK_DRAGONTRAINING') ? lv('KN_SPEARMASTERY') * 10 : 0); break;
    case '1hAxe': case '2hAxe': d += lv('AM_AXEMASTERY') * 3 + lv('NC_TRAININGAXE') * 5; break;
    case 'Mace': case '2hMace': d += lv('PR_MACEMASTERY') * 3 + lv('NC_TRAININGAXE') * 4; break;
    case 'Fist': d += lv('TK_RUN') * 10; // falls through
    case 'Knuckle': d += lv('MO_IRONHAND') * 3; break;
    case 'Musical': d += lv('BA_MUSICALLESSON') * 3; break;
    case 'Whip': d += lv('DC_DANCINGLESSON') * 3; break;
    case 'Book': d += lv('SA_ADVANCEDBOOK') * 3; break;
    case 'Katar': d += lv('AS_KATAR') * 3; break;
  }
  return d;
}

function levelValue(v, lv) {
  return Array.isArray(v) ? v[Math.min(lv, v.length) - 1] : v;
}

/** Sum of a bonus over a list of keys: t('bAddRace', 'RC_Demon', 'RC_All') */
function bonusOf(totals, name, ...args) {
  return args.reduce((s, a) => s + (totals[`${name}:${a}`] || 0), 0);
}

/**
 * @param db     { status, equip, skills, mobs, battle } (see loadAll in index.js)
 * @param build  result of calculateBuild(): { status, equip }
 * @param opt    { skill: name | null (basic attack), level, mobId, skills: { NAME: lv } learned skills }
 */
export function calculateDamage(db, build, opt) {
  const r = build.status, eq = build.equip, T = build.equip.totals;
  // PvP / GvG: opt.target is another calculateBuild() result
  const pvp = opt.target ? playerAsTarget(db, opt.target) : null;
  const mobBase = pvp || db.mobs[opt.mobId];
  if (!mobBase) throw new Error('unknown monster ' + opt.mobId);
  const deb = pvp ? debuffEffects({}, db) : debuffEffects(opt.debuffs, db);
  const mob = pvp ? { ...pvp } : mobStatus(mobBase, deb, db);
  const SCC = r.scCalc;
  const classMapid = db.equip.jobs?.[build.classId]?.mapid ?? 0;                     // calc/sc.js calculator of the build's status changes (or null)
  const scActive = SCC?.active || {};
  const learned = opt.skills || {};
  const skill = opt.skill ? db.skills.skills[opt.skill] : null;
  const skillLv = skill ? Math.min(Math.max(opt.level || skill.maxLv, 1), skill.maxLv) : 0;
  const steps = [];
  const unsupported = [];
  const weaponType = r.weapon;
  const weaponEleBonus = Object.keys(T).find((k) => k.startsWith('bAtkEle:'));
  let weaponEle = weaponEleBonus ? weaponEleBonus.split(':')[1].replace('Ele_', '') : 'Neutral';
  // ammunition: arrows / bullets add their ATK and element to basic attacks of bows & guns and to skills that need ammo
  const usesArrow = eq.base.ammoType && (skill ? !!skill.ammo : (weaponType === 'Bow' || GUNS.includes(weaponType)));
  const arrowEleKey = usesArrow ? Object.keys(T).find((k) => k.startsWith('bArrowEle:')) : null;
  if (arrowEleKey) weaponEle = arrowEleKey.split(':')[1].replace('Ele_', '');
  // weapon endows (Aspersio, Elemental converters, Insignias...): status_calc_attack_element
  if (SCC) weaponEle = ELE_NAMES[SCC('attack_element', eleIndex(weaponEle))] || weaponEle;
  let element = weaponEle;
  if (skill) {
    const e = levelValue(skill.ele, skillLv);
    if (e && e !== 'Weapon' && e !== 'Endowed' && e !== 'Random') element = e;
  }
  const raceKey = 'RC_' + mob.race, sizeKey = 'Size_' + mob.size, eleKey = 'Ele_' + mob.ele;
  const classKey = mob.class === 'Boss' || mob.mvp ? 'Class_Boss' : 'Class_Normal';
  // rAthena DAMAGE_DIV_FIX: a positive hit count multiplies the damage, a negative one only splits it visually
  const hitCount = skill ? (levelValue(skill.hits, skillLv) || 1) : 1;
  const hits = Math.abs(hitCount);
  const hitMul = hitCount > 0 ? hitCount : 1;
  const type = skill ? skill.type : 'Weapon';
  const range = skill ? levelValue(skill.range, skillLv) : (RANGED.includes(weaponType) ? 9 : 1);
  let isLong = skill ? Math.abs(range) >= 4 : RANGED.includes(weaponType);
  if (skill && LONG_SKILLS.has(opt.skill)) isLong = true;
  if (skill && SHORT_SKILLS.has(opt.skill)) isLong = false;
  if ((opt.skill === 'CD_EFFLIGO' || opt.skill === 'CD_PETITIO') && (weaponType === 'Mace' || weaponType === '2hMace')) isLong = true;
  if ((opt.skill === 'DK_HACKANDSLASHER' || opt.skill === 'DK_HACKANDSLASHER_ATK') && /Spear/.test(weaponType)) isLong = true;
  const flags = new Set(skill?.flags || []);

  // Player status in the shape rAthena code expects
  const S = { str: r.total.str, agi: r.total.agi, vit: r.total.vit, int_: r.total.int, dex: r.total.dex, luk: r.total.luk,
    pow: r.total.pow, sta: r.total.sta, wis: r.total.wis, spl: r.total.spl, con: r.total.con, crt: r.total.crt,
    max_hp: r.hp, hp: r.hp, max_sp: r.sp, sp: r.sp, batk: r.atk, patk: r.patk, smatk: r.smatk, crate: r.crate,
    base_level: r.baseLv, job_level: r.jobLv };
  const C = db.equip.constants;
  const SD = { status: { job_level: r.jobLv, base_level: r.baseLv, str: r.base.str, weapon: C[W_CODE[weaponType]] ?? 0 },
    weapontype1: C[W_CODE[weaponType]] ?? 0, weapontype2: 0, spiritball: 0, spiritball_old: 0, spiritcharm: 0, spiritcharm_type: -1,
    cart_weight: 0, cart_weight_max: 0, class_: r.job.id };
  // status changes as the skill code sees them (sc->getSCE(SC_EDP), tsc->getSCE(SC_PROVOKE)...)
  const scObj = (act) => ({ getSCE: (n) => act[n] || 0, hasSCE: (n) => (act[n] ? 1 : 0), empty: () => (Object.keys(act).length ? 0 : 1) });
  const mySC = scObj(scActive), targetSC = scObj(mob.debuffActive || {});
  const Tst = { race: 'RC_' + mob.race.toUpperCase().replace(/[^A-Z_]/g, ''), size: SIZE_C[mob.size], def_ele: 'ELE_' + mob.ele.toUpperCase(),
    ele_lv: mob.eleLv, hp: mob.hp, max_hp: mob.hp, vit: mob.vit, int_: mob.int, luk: mob.luk, def: mob.def, mdef: mob.mdef,
    class_: mob.class === 'Boss' ? 'CLASS_BOSS' : 'CLASS_NORMAL' };

  // ---------------------------------------------------------------- skill ratio
  // renewal: the base ratio is ATK% from status changes (battle_get_atkpercent) + Power Thrust etc. (weapon skills only)
  // renewal: weapon skills start from battle_calc_attack_skill_ratio's status part (ATK% buffs, Power Thrust, bSkillRatio)
  let ratio = type === 'Magic' ? 100
    : SCC ? SCC.skillratio(opt.skill || 0, skillLv, T.bSkillRatio || 0) : 100 + (T.bSkillRatio || 0);
  let rctx = null;
  if (skill) {
    const funcs = {
      pc_checkskill: (_sd, name) => learned[name] || 0,
      pc_checkskill_imperial_guard: (_sd, n) => 0,
      status_get_lv: (who) => (who === 'target' ? mob.lv : r.baseLv),
      status_get_max_hp: (who) => (who === 'target' ? mob.hp : r.hp), status_get_hp: (who) => (who === 'target' ? mob.hp : r.hp),
      status_get_max_sp: () => r.sp, status_get_sp: () => r.sp,
      status_get_str: (who) => (who === 'target' ? mob.str : S.str), status_get_agi: (who) => (who === 'target' ? mob.agi : S.agi),
      status_get_dex: (who) => (who === 'target' ? mob.dex : S.dex), status_get_int: (who) => (who === 'target' ? mob.int : S.int_),
      status_get_luk: (who) => (who === 'target' ? mob.luk : S.luk), status_get_vit: (who) => (who === 'target' ? mob.vit : S.vit),
      status_get_class_: () => Tst.class_, status_get_size: () => Tst.size,
      battle_check_undead: (race, ele) => (ele === 'ELE_UNDEAD' || race === 'RC_UNDEAD' ? 1 : 0),
      status_has_mode: () => 0, distance_xy: () => 0, distance_bl: () => 0, pc_getpercentweight: () => 0, rnd_chance: () => 0,
      skill_check_pc_partner: () => 0, pc_delspiritcharm: () => 0,
      BL_CAST: (t, x) => (t === 'BL_PC' && x === 'src' ? SD : null), getSkillId: () => opt.skill,
      min: Math.min, max: Math.max, cap_value: (v, a, b) => Math.min(Math.max(v, a), b), floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt,
    };
    rctx = { skill_lv: skillLv, constants: C, funcs,
      vars: { S, T: Tst, SD, TSD: 0, SC: mySC, TSC: targetSC, WD: { miscflag: 0, flag: 0, div_: hits }, MFLAG: 0, src: 'src', target: 'target' } };
    if (skill.eleMod) {
      // skill->impl->modifyElement (Grenade Fragments, Dragon Breath with Dragonic Aura...)
      const out = runVar(skill.eleMod, { ...rctx, constants: { ...C, ...ELE_CONST } }, 'element', eleIndex(element));
      if (ELE_NAMES[out.value]) element = ELE_NAMES[out.value];
      unsupported.push(...out.unsupported.map((u) => 'element: ' + u));
    }
    if (skill.ratio) {
      const out = runRatio(skill.ratio, { ...rctx, skillratio: ratio });
      ratio = out.skillratio;
      unsupported.push(...out.unsupported);
    }
  }
  steps.push(['Skill ratio', ratio + '%']);

  const skillAtkBonus = skill ? (T[`bSkillAtk:${opt.skill}`] || 0) : 0;
  let res;
  if (type === 'Magic') res = magic();
  else res = weapon();

  // ---------------------------------------------------------------- cast / delay (skills)
  let cast = null;
  if (skill) {
    const dex = S.dex, int_ = S.int_;
    const vc = levelValue(skill.cast, skillLv) || 0;
    const fc = levelValue(skill.fixedCast, skillLv) || 0;
    const varRate = -(eq.status.variableCastRate || 0) - (T[`bVariableCastrate:${opt.skill}`] || 0);
    const fixRate = -Math.min(0, eq.status.fixedCastRate || 0, T[`bFixedCastrate:${opt.skill}`] || 0);
    let time = vc + (T[`bSkillVariableCast:${opt.skill}`] || 0) + (T.bVariableCast || 0);
    // status changes (skill_vfcastfix): Suffragium & co. multiply the variable cast, others add to the rates
    const scCast = SCC ? SCC.cast(opt.skill, skillLv) : { timeMul: 1, reduceRate: 0, fixcastRate: 0, fixedAdd: 0, fixedZero: false };
    time *= scCast.timeMul;
    if (!skill.castIgnoreDex) time *= 1 - Math.sqrt(Math.min(1, (dex * 2 + int_) / 530));
    time *= 1 - Math.min(varRate + scCast.reduceRate, 100) / 100;
    let fixed = Math.max(fc + (eq.status.fixedCast || 0) + (T[`bSkillFixedCast:${opt.skill}`] || 0) + scCast.fixedAdd, 0);
    if (scCast.fixedZero) fixed = 0;
    const fixRateAll = Math.max(fixRate, scCast.fixcastRate);
    const castTime = Math.max(trunc(time), 0) + trunc((1 - Math.min(fixRateAll, 100) / 100) * fixed);
    const delayRate = -(eq.status.delayRate || 0);
    let delay = (levelValue(skill.delay, skillLv) || 0) + (T[`bSkillDelay:${opt.skill}`] || 0);
    if (delayRate) delay *= 1 - Math.min(delayRate, 100) / 100;
    const cooldown = Math.max(0, (levelValue(skill.cooldown, skillLv) || 0) + (T[`bSkillCooldown:${opt.skill}`] || 0));
    cast = { castTime, delay: Math.max(trunc(delay), 0), cooldown };
    // A skill cannot be repeated faster than the attack motion (ASPD) or 100 ms (min_skill_delay_limit)
    const motion = Math.max(100, (200 - r.aspd) * 10);
    const cycle = Math.max(castTime + Math.max(trunc(delay), motion), cooldown);
    cast.cycle = cycle;
    cast.perSecond = 1000 / cycle;
  }
  // Final damage modifiers (battle_calc_damage): the target's statuses (Raid, Kaite, Dark Crow, Assumptio...) and the
  // caster's final ones (Breaking Limit, Poisoning Weapon...). Lex Aeterna is counted for the first attack only (time to kill).
  if (SCC?.finalDamage) {
    const tact = { ...(mob.debuffActive || {}), ...(pvp ? opt.target.buffs?.active || {} : {}) };
    if (deb.raid) tact.SC_RAID = { val1: 1 };
    delete tact.SC_AETERNA;
    const flag = (type === 'Magic' ? 2 : type === 'Misc' ? 4 : 1) | (isLong ? 64 : 16) | (skill ? 256 : 512);
    const fo = { flag, skillId: opt.skill || 0, skillLv, div: hits, element: eleIndex(element), gvg: opt.mode === 'gvg' || opt.mode === 'bg',
      target: { active: tact, type: pvp ? 'BL_PC' : 'BL_MOB', boss: classKey === 'Class_Boss' } };
    const f = (v) => (v > 0 ? SCC.finalDamage(v, fo) : v);
    const before = res.avg;
    res.min = f(res.min); res.max = f(res.max); res.avg = f(res.avg);
    if (res.crit) { res.crit.min = f(res.crit.min); res.crit.max = f(res.crit.max); res.crit.avg = f(res.crit.avg); }
    if (res.avg !== before && before > 0) steps.push(['Final modifiers (target/caster status)', `×${(res.avg / before).toFixed(3)}`]);
  }
  // PvP: the target's own reductions (battle_calc_cardfix, target = player) and the map's PvP/GvG rates
  let luckyDodge = 0, reflected = null;
  if (pvp) {
    const tT = opt.target.equip.totals;
    const fix = targetCardfix(tT, { atkEle: element, srcEle: armorElement(T), srcSize: playerSize(db, build), srcRace: playerRace(db, build),
      srcRaceGroups: [], srcClass: 'Class_Normal', isLong, magic: type === 'Magic' });
    const sub = (tT[`bSubSkill:${opt.skill}`] || 0);
    const mode = opt.mode || 'pvp';
    // bg: rAthena battleground.conf defaults (bg_weapon/magic/misc 60, bg_short/long_weapon 80); conf/battle has no override
    const rate = mode === 'gvg' || mode === 'bg' ? (skill ? 60 : isLong ? 80 : 80) : mode === 'pk' ? (skill ? 60 : isLong ? 70 : 80) : 100;
    const m = (v) => Math.max(1, trunc(trunc(trunc(v * fix / 1000) * (100 - sub) / 100) * rate / 100));
    res.min = m(res.min); res.max = m(res.max); res.avg = m(res.avg);
    if (res.crit) { res.crit.min = m(res.crit.min); res.crit.max = m(res.crit.max); res.crit.avg = m(res.crit.avg); }
    steps.push(['Target reductions (cards)', (100 - fix / 10).toFixed(1) + '%'], ['Map', `${mode.toUpperCase()} ${rate}%`]);
    if (sub) steps.push(['Target skill reduction', sub + '%']);
    if (!skill) luckyDodge = Math.min(100, (opt.target.status.flee2 || 0) / 10);
    const ret = returnDamage(tT, opt.target.buffs?.active || {}, { isLong, magic: type === 'Magic', skillId: opt.skill });
    reflected = { ...ret, avg: Math.round(res.avg * ret.percent / 100) };
    if (ret.percent) steps.push(['Reflected back to you', `${ret.percent}% → ${reflected.avg} per hit`]);
    if (ret.magicChance) steps.push(['Target reflects magic (chance)', ret.magicChance + '%']);
  }
  // Chance that one attack connects: Lucky Dodge (basic attacks on players), crit always hits, then Perfect Hit,
  // then HIT vs FLEE (battle_calc_weapon_attack / is_attack_hitting)
  const c = res.critRate / 100, ph = res.perfectHit / 100, hr = res.hitRate / 100;
  const nonCritLand = ph + (1 - ph) * hr;
  const land = (1 - luckyDodge / 100) * (c + (1 - c) * nonCritLand);
  let perAttack = (1 - luckyDodge / 100) * ((1 - c) * nonCritLand * res.avg + (res.crit ? c * res.crit.avg : 0));
  if (res.multi) {
    // a multi-hit replaces the normal attack (it cannot crit); Double Attack also adds +1 HIT per level
    const hrM = Math.min(100, res.hitRate + res.multi.hitBonus) / 100;
    const landM = ph + (1 - ph) * hrM;
    const pM = res.multi.fear + res.multi.double;
    const hitsM = pM ? (res.multi.fear * res.multi.fearHits + res.multi.double * 2) / pM : 0;
    perAttack = (1 - luckyDodge / 100) * (pM * hitsM * landM * res.avg + (1 - pM) * ((1 - c) * nonCritLand * res.avg + (res.crit ? c * res.crit.avg : 0)));
  }
  // ---- autospell (bAutoSpell on weapon attacks, bAutoSpellOnSkill when this skill is used): expected extra damage
  // per attack = chance × the spell's own average damage (the spell is calculated like any other skill)
  const autospell = [];
  if (!opt.noAutospell) {
    const lists = [];
    if (type !== 'Magic') for (const [k, v] of Object.entries(T)) if (/^bAutoSpell:.*:list$/.test(k)) lists.push(...v.map((a) => ({ a, src: 'bAutoSpell', needHit: true })));
    if (skill) for (const v of T[`bAutoSpellOnSkill:${opt.skill}:list`] || []) lists.push({ a: v.slice(1), src: 'bAutoSpellOnSkill', needHit: false });
    // status procs on basic attacks (battle_weapon_attack): Servant Weapon, Falling Star, Duple Light, Abyss Force Weapon,
    // Auto Firing Launcher. Spirit / servant / abyss balls are assumed to be available.
    if (!skill) {
      const A = scActive, L = (n) => learned[n] || 0;
      const regen = (n, lv) => levelValue(db.skills.regen?.[n], lv);
      if (A.SC_SERVANTWEAPON) lists.push({ a: ['DK_SERVANTWEAPON_ATK', A.SC_SERVANTWEAPON.val1, 50 * A.SC_SERVANTWEAPON.val1], src: 'SC_SERVANTWEAPON', needHit: true,
        regen: regen('DK_SERVANTWEAPON', A.SC_SERVANTWEAPON.val1) });
      if (A.SC_FALLINGSTAR) lists.push({ a: ['SJ_FALLINGSTAR_ATK', A.SC_FALLINGSTAR.val1, 10 * A.SC_FALLINGSTAR.val2], src: 'SC_FALLINGSTAR', needHit: true });
      if (A.SC_DUPLELIGHT && L('CD_PETITIO')) lists.push({ a: ['CD_PETITIO', L('CD_PETITIO'), 200], src: 'SC_DUPLELIGHT', needHit: true });
      if (A.SC_ABYSSFORCEWEAPON) {
        lists.push({ a: ['ABC_FROM_THE_ABYSS_ATK', A.SC_ABYSSFORCEWEAPON.val1, 250], src: 'SC_ABYSSFORCEWEAPON', needHit: true,
          regen: regen('ABC_FROM_THE_ABYSS', A.SC_ABYSSFORCEWEAPON.val1) });
        if (L('ABC_ABYSS_SQUARE')) lists.push({ a: ['ABC_ABYSS_SQUARE', L('ABC_ABYSS_SQUARE'), 200], src: 'SC_ABYSSFORCEWEAPON', needHit: true });
      }
      const afl = { 1: [['NW_BASIC_GRENADE', 6]], 2: [['NW_BASIC_GRENADE', 7]], 3: [['NW_HASTY_FIRE_IN_THE_HOLE', 3], ['NW_BASIC_GRENADE', 8]],
        4: [['NW_HASTY_FIRE_IN_THE_HOLE', 5], ['NW_BASIC_GRENADE', 9]], 5: [['NW_GRENADES_DROPPING', 3], ['NW_HASTY_FIRE_IN_THE_HOLE', 7], ['NW_BASIC_GRENADE', 10]] };
      for (const [sk, pct] of afl[A.SC_AUTO_FIRING_LAUNCHER?.val1] || []) if (L(sk)) lists.push({ a: [sk, L(sk), pct * 10], src: 'SC_AUTO_FIRING_LAUNCHER', needHit: true });
    }
    const atkCycle = r.hitsPerSec > 0 ? 1000 / r.hitsPerSec : Infinity;
    for (const { a, src, needHit, regen: regenMs } of lists) {
      const [spell, lvRaw, rate] = a;
      if (!db.skills.skills[spell] || ['Weapon', 'Magic', 'Misc'].indexOf(db.skills.skills[spell].type) < 0) continue;
      const lvS = Math.abs(Number(lvRaw)) || 1;                    // negative level = random 1..lv (the top level is used)
      const pct = Math.min(100, (Number(rate) || 0) / 10);
      let sp;
      try { sp = calculateDamage(db, build, { ...opt, skill: spell, level: lvS, noAutospell: true }); } catch { continue; }
      let procs = (needHit ? land : 1) * pct / 100;
      // each proc spends a sphere; spheres come back one per regen interval, so in the long run procs per attack are capped
      if (regenMs && Number.isFinite(atkCycle)) procs = Math.min(procs, atkCycle / regenMs);
      const per = procs * (sp.avg * (sp.chance.land / 100));
      autospell.push({ skill: spell, level: lvS, chance: pct, from: src, avg: sp.avg, expectedPerAttack: Math.round(per) });
      perAttack += per;
    }
    if (autospell.length) steps.push(['Autospell (expected per attack)', autospell.map((x) => `${x.skill} Lv${x.level} ${x.chance}% → +${x.expectedPerAttack}`).join(', ')]);
  }
  const cycleMs = skill ? cast.cycle : (r.hitsPerSec > 0 ? 1000 / r.hitsPerSec : Infinity);
  const dps = perAttack * 1000 / cycleMs;
  const chance = { crit: res.critRate, perfectHit: res.perfectHit, hit: res.hitRate, luckyDodge, land: Math.round(land * 10000) / 100 };
  const landedAvg = land > 0 ? perAttack / land : 0;
  const kill = timeToKill(mobBase.hp, landedAvg, res.min, res.crit ? res.crit.max : res.max, land, cycleMs, deb.aeterna);
  if (deb.aeterna) steps.push(['Lex Aeterna', 'first attack ×2']);

  return { skill: skill ? { name: opt.skill, label: skill.name, level: skillLv, type } : null, mob: mobBase, mobStatus: mob, element,
    hits, isLong, ratio, ...res, chance, cast, dps, kill, autospell, reflected, debuffs: deb.active, steps, unsupported };

  // ================================================================ physical
  function weapon() {
    const it = eq.base;
    const watk = eq.status.weaponAtk + eq.status.refineAtk + (r.scWatk || 0); // status->watk (weapon + refine + Impositio etc.)
    const wBase = Math.trunc(eq.status.weaponAtk * (100 + (eq.status.weaponAtkRate || 0)) / 100);
    const wlv = it.weaponLevel || 0;
    const baseStat = RANGED.includes(weaponType) ? (learned.SU_SOULATTACK ? S.str : S.dex) : S.str;
    const variance = 5 * wBase * wlv / 100;
    const statBonus = wBase * baseStat / 200;
    const hasWeapon = wBase > 0;
    // Maximize Power: always the highest weapon ATK (battle_calc_base_damage)
    const wMin = scActive.SC_MAXIMIZEPOWER ? (hasWeapon ? Math.min(65535, trunc(watk + variance + statBonus)) : watk)
      : hasWeapon ? Math.max(0, trunc(watk - variance + statBonus)) : watk;
    const wMax = hasWeapon ? Math.min(65535, trunc(watk + variance + statBonus)) : watk;
    // Weapon Perfection / bNoSizeFix: no size penalty
    const sizeMod = T.bNoSizeFix || scActive.SC_WEAPONPERFECTION ? 100 : (db.battle.size[weaponType]?.[mob.size] ?? 100);
    const weaponRate = T[`bWeaponDamageRate:${W_CODE[weaponType]}`] || 0;
    const overMax = eq.status.overRefineMax || 0;
    const tAct = mob.debuffActive || {};
    const eleMod = attr(db, element, mob, scActive, tAct);
    const neutralMod = attr(db, 'Neutral', mob, scActive, tAct);
    const ignoreAtkCard = flags.has('IgnoreAtkCard');
    const ignoreEle = flags.has('IgnoreElement');
    // attacker card fix (renewal: weapon + equip ATK only), per category multiplicative
    let cardfix = 1000;
    if (!ignoreAtkCard) {
      cardfix = trunc(cardfix * (100 + bonusOf(T, 'bAddRace', raceKey, 'RC_All')) / 100);
      const race2 = (mob.raceGroups || []).reduce((acc, g) => acc + (T['bAddRace2:RC2_' + g] || 0), 0);
      if (race2) cardfix = trunc(cardfix * (100 + race2) / 100);
      if (!ignoreEle) cardfix = trunc(cardfix * (100 + bonusOf(T, 'bAddEle', eleKey, 'Ele_All')) / 100);
      cardfix = trunc(cardfix * (100 + bonusOf(T, 'bAddSize', sizeKey, 'Size_All')) / 100);
      cardfix = trunc(cardfix * (100 + bonusOf(T, 'bAddClass', classKey, 'Class_All')) / 100);
    }
    const atkRate = eq.status.atkRate || 0;
    // battle_calc_attack_masteries (renewal): skill masteries + status changes counted as mastery
    let masteryAtk = mastery(learned, weaponType, mob, S);
    if (opt.skill === 'TF_POISON') masteryAtk += 15 * skillLv;
    if (opt.skill !== 'MC_CARTREVOLUTION' && learned.BS_HILTBINDING) masteryAtk += 4;
    masteryAtk += 3 * (opt.spiritball ?? 0);                                         // Spirit Spheres held
    if (opt.skill === 'NJ_SYURIKEN') masteryAtk += 3 * (learned.NJ_TOBIDOUGU || 0);
    if (['RA_WUGDASH', 'RA_WUGSTRIKE', 'RA_WUGBITE'].includes(opt.skill)) masteryAtk += 30 * (learned.RA_TOOTHOFWUG || 0);
    if (scActive.SC_NIBELUNGEN) masteryAtk += scActive.SC_NIBELUNGEN.val2;
    if (scActive.SC_CAMOUFLAGE) masteryAtk += 30 * Math.min(10, scActive.SC_CAMOUFLAGE.val3);
    if (scActive.SC_GN_CARTBOOST) masteryAtk += 10 * scActive.SC_GN_CARTBOOST.val1;
    if (scActive.SC_P_ALTER) masteryAtk += scActive.SC_P_ALTER.val2;
    const crateMul = 1.4 + 0.01 * S.crate;
    const critAtk = T.bCritAtkRate || 0;
    const shortRate = T.bShortAtkRate || 0, longRate = T.bLongAtkRate || 0;
    // DEF
    let def1 = mob.def, def2 = mob.def2;
    const ign = Math.min(100, bonusOf(T, 'bIgnoreDefRaceRate', raceKey, 'RC_All') + bonusOf(T, 'bIgnoreDefClassRate', classKey, 'Class_All'));
    if (ign) { def1 -= trunc(def1 * ign / 100); def2 -= trunc(def2 * ign / 100); }
    if (def1 === -400) def1 = -399;
    const anyKey = (name) => bonusOf(T, name, raceKey, 'RC_All') + bonusOf(T, name, eleKey, 'Ele_All') > 0;
    const anyClass = (name) => bonusOf(T, name, classKey, 'Class_All') > 0;
    // attack_ignores_def: skill flag, bIgnoreDefRace/Ele/Class, and a few weapon-specific skills
    const ignoreDef = flags.has('IgnoreDefense')
      || (opt.skill !== 'CR_GRANDCROSS' && (anyKey('bIgnoreDefRace') || bonusOf(T, 'bIgnoreDefEle', eleKey, 'Ele_All') > 0 || anyClass('bIgnoreDefClass')))
      || (opt.skill === 'RK_WINDCUTTER' && weaponType === '2hSword')
      || (opt.skill === 'NW_THE_VIGILANTE_AT_NIGHT' && weaponType === 'Gatling')
      || (opt.skill === 'NW_ONLY_ONE_BULLET' && weaponType === 'Revolver');
    // is_attack_piercing: damage += DEF * ratio / 200 and the DEF reduction is skipped
    const pierce = opt.skill === 'MO_INVESTIGATE' || opt.skill === 'RL_MASS_SPIRAL'
      || (!NO_PIERCE.has(opt.skill) && (bonusOf(T, 'bDefRatioAtkRace', raceKey, 'RC_All') + bonusOf(T, 'bDefRatioAtkEle', eleKey, 'Ele_All')
        + bonusOf(T, 'bDefRatioAtkClass', classKey, 'Class_All') > 0));
    // battle_calc_skill_base_damage: skills with their own base damage
    const special = specialBase();
    // battle_calc_skill_constant_addition
    let constAdd = 0;
    if (opt.skill === 'MO_EXTREMITYFIST') constAdd = 250 + 150 * skillLv;
    if (opt.skill === 'HT_FREEZINGTRAP') constAdd = 40 * (learned.RA_RESEARCHTRAP || 0);
    let constNote = '';
    if (opt.skill === 'PA_SHIELDCHAIN' && eq.base.shield) {
      // max(100, rnd_value(100, 7*weight/100 + (lv+refine)^2)): the average of the random part is used
      const hi = Math.max(100, trunc(7 * (eq.base.shieldWeight || 0) / 100) + (skillLv + (eq.base.shieldRefine || 0)) ** 2);
      constAdd = trunc((100 + hi) / 2); constNote = ` (random 100 ~ ${hi}, average used)`;
    }
    // RES
    let res = mob.res;
    const ignRes = Math.min(50, bonusOf(T, 'bIgnoreResRaceRate', raceKey, 'RC_All')
      + (scActive.SC_A_TELUM?.val2 || 0) + (scActive.SC_POTENT_VENOM?.val2 || 0));
    res = res - ignRes * res / 100;

    // hand: overrides for the left-hand weapon of a dual wielder (size table, its own weapon-type damage bonus)
    const one = (wDmg, overrefine, crit, hand) => {
      let w = wDmg + overrefine;
      const wRate = hand ? hand.weaponRate : weaponRate;
      if (wRate) w += trunc(w * wRate / 100);
      w = trunc(w * (hand ? hand.sizeMod : sizeMod) / 100);
      let statusAtk = trunc(S.batk * neutralMod / 100) * 2;
      let weaponAtk = ignoreEle ? w : trunc(w * eleMod / 100);
      const eAtk = eq.status.equipAtk + (usesArrow ? eq.base.arrowAtk : 0);       // battle_calc_equip_attack
      let equipAtk = ignoreEle ? eAtk : trunc(eAtk * eleMod / 100);
      if (special?.kind === 'spiral') {
        // Spiral Pierce (renewal): (status + weapon + equip ATK + weight/10) * 70% * size bonus, all moved to equip ATK
        equipAtk = trunc((equipAtk + statusAtk + weaponAtk + trunc(eq.base.weaponWeight / 10)) * 70 / 100);
        equipAtk = trunc(equipAtk * ({ Small: 130, Medium: 115 }[mob.size] || 100) / 100);
        statusAtk = 0; weaponAtk = 0;
      } else if (special) {
        statusAtk = special.status || 0;
        weaponAtk = ignoreEle ? special.weapon : trunc(special.weapon * eleMod / 100);
        equipAtk = 0;
      }
      const percentAtk = special ? 0 : trunc((weaponAtk + equipAtk) * atkRate / 100);
      weaponAtk -= trunc(weaponAtk * (1000 - Math.max(0, cardfix)) / 1000);
      equipAtk -= trunc(equipAtk * (1000 - Math.max(0, cardfix)) / 1000);
      let mAtk = !special || special.kind === 'spiral' ? masteryAtk : 0;
      // battle_attack_sc_bonus: EDP, Madness Canceller, soul links... ("final attack bonuses that aren't affected by cards")
      if (SCC && !ignoreEle && !ignoreAtkCard) {
        const wd = SCC.scBonus({ statusAtk, weaponAtk, equipAtk, masteryAtk: mAtk, percentAtk, damage: statusAtk + weaponAtk + equipAtk,
          flag: 1 | (isLong ? 64 : 16) | (skill ? 256 : 512) },
          { skillId: opt.skill || 0, skillLv, mob, matk: [r.matk, r.matk] });
        statusAtk = trunc(wd.statusAtk); weaponAtk = trunc(wd.weaponAtk); equipAtk = trunc(wd.equipAtk); mAtk = trunc(wd.masteryAtk);
      }
      let d = statusAtk + weaponAtk + equipAtk + percentAtk;
      d = Math.floor(d * (100 + S.patk) / 100);
      d += mAtk;
      if (crit) d += Math.floor(d * critAtk / (skill ? 200 : 100));
      else d += trunc(d * (T.bNonCritAtkRate || 0) / 100);
      if (!isLong) d += trunc(d * shortRate / 100);
      else d += trunc(d * longRate / 100);
      d = trunc(d * ratio / 100);
      d += constAdd;
      if (weaponType === 'Katar' && learned.ASC_KATAR) d += trunc(d * (10 + 2 * learned.ASC_KATAR) / 100);
      if (res > 0 && !flags.has('SimpleDefense')) d -= trunc(res / (res + 400) * 80 / 100 * d);
      if (pierce) d += trunc(def1 * ratio / 200);
      else if (!ignoreDef) d = trunc(d * (4000 + def1) / (4000 + 10 * def1)) - def2;
      // battle_calc_attack_post_defense (renewal): Aura Blade, Sonic Acceleration
      if (scActive.SC_AURABLADE) d += (3 + scActive.SC_AURABLADE.val1) * S.base_level;
      d = Math.max(1, d);
      if (opt.skill === 'AS_SONICBLOW' && learned.AS_SONICACCEL) d += trunc(d * 90 / 100);
      if (skillAtkBonus) d += trunc(d * skillAtkBonus / 100);
      if (crit) d = Math.floor(d * crateMul);
      // battle_calc_weapon_final_atk_modifiers: Enchant Blade (basic attacks only), MATK average used for the random part
      if (!skill && scActive.SC_ENCHANTBLADE) {
        const wm = eq.status.weaponMatk + eq.status.refineMatk;
        const eb = scActive.SC_ENCHANTBLADE.val2 + (r.matk || 0) + wm + eq.status.equipMatk + (r.scMatk || 0) - (mob.mdef + mob.mdef2);
        if (eb > 0) d += eb;
      }
      return Math.max(1, d) * hitMul;
    };
    const canCrit = !skill || flags.has('Critical');
    let cri = r.critRaw ?? (r.crit * 10);
    cri += 10 * bonusOf(T, 'bCriticalAddRace', raceKey, 'RC_All');
    cri -= mob.luk * 2;
    const critRate = canCrit ? Math.min(100, Math.max(0, cri / 10)) : 0;
    const tFlee = pvp && (opt.mode === 'gvg' || opt.mode === 'bg') ? mob.flee - trunc(mob.flee * 20 / 100) : mob.flee; // gvg_flee_penalty
    let hitRate = r.hit - tFlee + (learned.AC_VULTURE || 0);
    if (skill?.hitRate) {           // skill->impl->modifyHitRate (e.g. Bash +5%/lv, Thunder Breath x2)
      const out = runVar(skill.hitRate, { ...rctx, hit_rate: hitRate }, 'hit_rate', hitRate);
      hitRate = out.value;
      unsupported.push(...out.unsupported.map((u) => 'hit: ' + u));
    }
    if (learned.BS_WEAPONRESEARCH) hitRate += trunc(hitRate * 2 * learned.BS_WEAPONRESEARCH / 100);
    const alwaysHit = flags.has('IgnoreFlee') || ['AS_SPLASHER', 'GN_SPORE_EXPLOSION'].includes(opt.skill);
    hitRate = alwaysHit ? 100 : Math.min(100, Math.max(5, hitRate));
    const ph = alwaysHit ? 0 : perfectHit(eq);

    let min = one(wMin, overMax ? 1 : 0, false), max = one(wMax, overMax, false);
    let crit = canCrit ? { min: one(wMax, overMax ? 1 : 0, true), max: one(wMax, overMax, true) } : null;
    // basic attacks only (skills always use the right hand): battle_calc_attack_left_right_hands
    const L = eq.base.left;
    if (!skill && L) {
      const lBase = L.atk, lWatk = L.atk + L.refineAtk;
      const lVar = 5 * lBase * (L.wlv || 1) / 100, lStat = lBase * baseStat / 200;
      const lMin = Math.max(0, trunc(lWatk - lVar + lStat)), lMax = Math.min(65535, trunc(lWatk + lVar + lStat));
      const hand = { sizeMod: T.bNoSizeFix || scActive.SC_WEAPONPERFECTION ? 100 : (db.battle.size[L.type]?.[mob.size] ?? 100),
        weaponRate: T[`bWeaponDamageRate:${W_CODE[L.type]}`] || 0 };
      const thief = (classMapid & 0xFF) === 6, kagerou = (classMapid & 0xFFFF) === 0x109;
      const rateR = thief ? 50 + 10 * (learned.AS_RIGHT || 0) : kagerou ? 70 + 10 * (learned.KO_RIGHT || 0) : 100;
      const rateL = thief ? 30 + 10 * (learned.AS_LEFT || 0) : kagerou ? 50 + 10 * (learned.KO_LEFT || 0) : 100;
      const both = (r_, l_) => Math.max(1, trunc(r_ * rateR / 100)) + Math.max(1, trunc(l_ * rateL / 100));
      const lo = one(lMin, L.overRefineMax ? 1 : 0, false, hand), hi = one(lMax, L.overRefineMax, false, hand);
      if (crit) crit = { min: both(crit.min, one(lMax, L.overRefineMax ? 1 : 0, true, hand)), max: both(crit.max, one(lMax, L.overRefineMax, true, hand)) };
      min = both(min, lo); max = both(max, hi);
      steps.push(['Dual wield', `right ${rateR}% + left ${rateL}% (${L.type} ${lMin} ~ ${lMax})`]);
    } else if (!skill && weaponType === 'Katar') {
      // katar: second hit of (1 + 2 x Double Attack level)% on basic attacks
      const k = (v) => v + trunc(v * (1 + 2 * (learned.TF_DOUBLE || 0)) / 100);
      min = k(min); max = k(max);
      if (crit) crit = { min: k(crit.min), max: k(crit.max) };
      steps.push(['Katar off-hand', `+${1 + 2 * (learned.TF_DOUBLE || 0)}%`]);
    }
    if (crit) crit.avg = Math.round((crit.min + crit.max) / 2);
    // battle_calc_multi_attack (basic attacks): Double Attack / bDoubleRate / Chain Action / Fear Breeze
    let multi = null;
    if (!skill && weaponType !== 'Fist') {
      const dbl = Math.max(weaponType === 'Dagger' ? 7 * (learned.TF_DOUBLE || 0) : 0, T.bDoubleRate || 0,
        scActive.SC_KAGEMUSYA ? scActive.SC_KAGEMUSYA.val1 * 10 : 0);
      const chain = weaponType === 'Revolver' ? 5 * (learned.GS_CHAINACTION || 0) : 0;
      const fb = scActive.SC_FEARBREEZE && weaponType === 'Bow' && eq.base.ammoType ? scActive.SC_FEARBREEZE.val1 : 0;
      // Fear Breeze: chance (in %) of 2..5 hits by level, checked first
      const fear = fb >= 5 ? { 5: 4, 4: 3, 3: 3, 2: 3 } : fb === 4 ? { 4: 7, 3: 3, 2: 3 } : fb === 3 ? { 3: 10, 2: 3 } : fb ? { 2: 13 } : {};
      const fearP = Object.values(fear).reduce((a, b) => a + b, 0);
      const fearHits = fearP ? Object.entries(fear).reduce((a, [h, p]) => a + h * p, 0) / fearP : 1;
      const rest = 1 - fearP / 100;
      const pDbl = rest * Math.min(100, dbl) / 100;
      const pChain = (rest - pDbl) * chain / 100;
      if (fearP || pDbl || pChain) {
        multi = { chance: Math.round((fearP / 100 + pDbl + pChain) * 10000) / 100, avgHits: (fearP / 100) * fearHits + (pDbl + pChain) * 2
          + (1 - fearP / 100 - pDbl - pChain), fear: fearP / 100, fearHits, double: pDbl + pChain,
          hitBonus: learned.TF_DOUBLE || 0 };
        steps.push(['Double attack', `${multi.chance}% (no critical on a multi-hit)`]);
      }
    }
    steps.push(['Status ATK ×2', trunc(S.batk * neutralMod / 100) * 2], ['Weapon ATK', `${wMin} ~ ${wMax}`],
      ['Size modifier', sizeMod + '%'], ['Element', `${element} → ${mob.ele} ${mob.eleLv}: ${eleMod}%`],
      ['Equip ATK', eq.status.equipAtk], ['ATK %', atkRate + '%'], ['Race/Element/Size/Class', (cardfix / 10).toFixed(1) + '%'],
      ['P.ATK', S.patk + '%'], ['Mastery ATK', masteryAtk], [isLong ? 'Long range %' : 'Short range %', (isLong ? longRate : shortRate) + '%'],
      ['Target RES', mob.res], ['Target DEF', `${mob.def} (${ign}% ignored) / soft ${mob.def2}`],
      ['Skill damage %', skillAtkBonus + '%'], ['Hits', hits]);
    if (special) steps.push(['Special base damage', special.kind === 'spiral' ? 'Spiral Pierce (weight ' + trunc(eq.base.weaponWeight / 10) + ')' : special.weapon]);
    if (constAdd) steps.push(['Flat skill damage', constAdd + constNote]);
    if (pierce) steps.push(['DEF piercing', '+DEF × ratio / 200']);
    else if (ignoreDef) steps.push(['DEF', 'ignored']);
    steps.push(['HIT − FLEE', `${r.hit} − ${mob.flee} → ${hitRate}%`], ['Perfect Hit', ph + '%']);
    return { min, max, avg: Math.round((min + max) / 2), crit, critRate, hitRate, perfectHit: ph, multi };
  }

  /** battle_calc_skill_base_damage cases (renewal). Returns null for the normal formula. */
  function specialBase() {
    const lv = S.base_level, k = opt.skill;
    if (k === 'PA_SACRIFICE') return { weapon: trunc(S.max_hp * 9 / 100) };
    if (k === 'LK_SPIRALPIERCE' || k === 'ML_SPIRALPIERCE') return { kind: 'spiral' };
    if (k === 'CR_SHIELDBOOMERANG' || k === 'PA_SHIELDCHAIN') {
      const sh = eq.base.shield ? 4 * eq.base.shieldRefine + trunc(eq.base.shieldWeight / 10) : 0;
      return { status: S.batk, weapon: sh };
    }
    if (k === 'RK_DRAGONBREATH' || k === 'RK_DRAGONBREATH_WATER') {
      let v = (trunc(S.hp / 50) + trunc(S.max_sp / 4)) * skillLv;
      if (lv > 100) v = trunc(v * lv / 100);
      const dt = learned.RK_DRAGONTRAINING || 0;
      v = trunc(v * (90 + 10 * dt + (learned.DK_DRAGONIC_AURA ? trunc(S.pow / 5) : 0)) / 100);
      return { weapon: v };
    }
    if (k === 'NC_SELFDESTRUCTION') {
      let v = (skillLv + 1) * ((learned.NC_MAINFRAME || 0) + 8) * (S.sp + S.vit);
      if (lv > 100) v = trunc(v * lv / 100);
      return { weapon: v + S.hp };
    }
    if (k === 'KO_HAPPOKUNAI') {
      const ammo = opt.ammoAtk ?? eq.base.arrowAtk ?? 0;              // the equipped Kunai's ATK
      let v = trunc(3 * (2 * S.batk + (eq.base.atk ?? eq.status.weaponAtk) + ammo) * (skillLv + 5) / 5);
      if (scActive.SC_KAGEMUSYA) v += trunc(v * scActive.SC_KAGEMUSYA.val2 / 100);
      return { weapon: v };
    }
    return null;
  }

  // ================================================================ magic
  function magic() {
    const statusMatk = r.matk;
    const wMatk = eq.status.weaponMatk + eq.status.refineMatk;
    const variance = trunc(wMatk * (eq.base.weaponLevel || 0) / 10);
    let mMin = statusMatk + wMatk - variance, mMax = statusMatk + wMatk + variance;
    if (eq.status.overRefineMax > 0) { mMin += 1; mMax += eq.status.overRefineMax - 1; }
    const mp = scActive.SC_MAGICPOWER?.val3 || 0;                     // Mystical Amplification (status_calc_bl)
    if (mp) { mMin += trunc(mMin * mp / 100); mMax += trunc(mMax * mp / 100); }
    mMin += eq.status.equipMatk + (r.scMatk || 0); mMax += eq.status.equipMatk + (r.scMatk || 0);
    const matkRate = 100 + (eq.status.matkRate || 0);
    mMin = trunc(mMin * matkRate / 100); mMax = trunc(mMax * matkRate / 100);
    const eleMod = flags.has('IgnoreElement') ? 100 : attr(db, element, mob, scActive, mob.debuffActive || {}, true);
    let mdef = mob.mdef;
    const ign = Math.min(100, Math.max(0, bonusOf(T, 'bIgnoreMdefRaceRate', raceKey, 'RC_All') + bonusOf(T, 'bIgnoreMdefClassRate', classKey, 'Class_All')));
    if (ign) mdef = mdef - mdef * ign / 100;
    if (mdef < 0) mdef = 0;
    let mres = mob.mres;
    mres = mres - Math.min(50, bonusOf(T, 'bIgnoreMresRaceRate', raceKey, 'RC_All')) * mres / 100;
    const applyRe = (d, fix) => d - trunc(d * (100 - Math.max(0, 100 + fix)) / 100);
    const one = (m) => {
      let d = m;
      if (!flags.has('IgnoreAtkCard')) {
        d = applyRe(d, bonusOf(T, 'bMagicAddSize', sizeKey, 'Size_All'));
        if (!flags.has('IgnoreElement')) {
          d = applyRe(d, bonusOf(T, 'bMagicAddEle', eleKey, 'Ele_All'));
          d = applyRe(d, bonusOf(T, 'bMagicAtkEle', 'Ele_' + element, 'Ele_All'));
        }
        d = applyRe(d, bonusOf(T, 'bMagicAddRace', raceKey, 'RC_All'));
        d = applyRe(d, bonusOf(T, 'bMagicAddClass', classKey, 'Class_All'));
      }
      if (weaponType === '2hStaff' && learned.AG_TWOHANDSTAFF) d += trunc(d * learned.AG_TWOHANDSTAFF / 100);
      if (S.smatk > 0) d += trunc(d * S.smatk / 100);
      d = trunc(d * ratio / 100);
      if (mres > 0) d -= trunc(mres / (mres + 400) * 80 / 100 * d);
      d = trunc(d * (1000 + mdef) / (1000 + mdef * 10)) - mob.mdef2;
      if (skillAtkBonus) d = trunc(d + d * skillAtkBonus / 100);
      if (d < 1) d = 1;
      d = trunc(d * eleMod / 100);
      return Math.max(1, d) * hitMul;
    };
    const min = one(mMin), max = one(mMax);
    steps.push(['MATK', `${mMin} ~ ${mMax}`], ['S.MATK', S.smatk + '%'], ['Element', `${element} → ${mob.ele} ${mob.eleLv}: ${eleMod}%`],
      ['Target MRES', mob.mres], ['Target MDEF', `${mob.mdef} (${ign}% ignored) / soft ${mob.mdef2}`],
      ['Skill damage %', skillAtkBonus + '%'], ['Hits', hits]);
    return { min, max, avg: Math.round((min + max) / 2), crit: null, critRate: 0, hitRate: 100, perfectHit: 0 };
  }
}

/** Player element from armor (bDefEle), size and race as rAthena sets them (summoners: Small / Player_Doram). */
function armorElement(T) {
  const k = Object.keys(T).find((x) => x.startsWith('bDefEle:'));
  return k ? k.split(':')[1].replace('Ele_', '') : 'Neutral';
}
function isSummoner(db, b) { return ((db.equip.jobs?.[b.status.job.id]?.mapid ?? 0) & 0xFF) === 10; }
function playerSize(db, b) { return isSummoner(db, b) ? 'Small' : 'Medium'; }
function playerRace(db, b) { return isSummoner(db, b) ? 'Player_Doram' : 'Player_Human'; }

/** A player build in the shape calculateDamage uses for monsters. */
function playerAsTarget(db, b) {
  const s = b.status, t = s.total;
  return { name: 'Player: ' + (s.job.name || s.job.id), lv: s.baseLv, hp: s.hp, atk: 0, atk2: 0,
    def: s.hardDef, def2: s.def, mdef: s.hardMdef, mdef2: s.mdef, res: s.res, mres: s.mres,
    str: t.str, agi: t.agi, vit: t.vit, int: t.int, dex: t.dex, luk: t.luk,
    size: playerSize(db, b), race: playerRace(db, b), ele: armorElement(b.equip.totals), eleLv: 1, class: 'Normal', mvp: false,
    raceGroups: [], hit: s.hit, flee: s.flee, flee2: s.flee2 || 0, isPlayer: true };
}

/** Damage reduction of a player target (battle_calc_cardfix, BF_WEAPON / BF_MAGIC target part). Returns x/1000. */
function targetCardfix(T, a) {
  const sub = (name, ...keys) => bonusOf(T, name, ...keys);
  const step = (cf, pct) => trunc(cf * (100 - pct) / 100);
  let cf = 1000;
  cf = step(cf, sub('bSubEle', 'Ele_' + a.atkEle, 'Ele_All'));
  cf = step(cf, sub(a.magic ? 'bMagicSubDefEle' : 'bSubDefEle', 'Ele_' + a.srcEle, 'Ele_All'));
  cf = step(cf, sub(a.magic ? 'bMagicSubSize' : 'bSubSize', 'Size_' + a.srcSize, 'Size_All'));
  if (!a.magic) cf = step(cf, sub('bWeaponSubSize', 'Size_' + a.srcSize, 'Size_All'));
  cf = step(cf, (a.srcRaceGroups || []).reduce((s, g) => s + (T['bSubRace2:RC2_' + g] || 0), 0));
  cf = step(cf, sub('bSubRace', 'RC_' + a.srcRace, 'RC_All'));
  cf = step(cf, sub('bSubClass', a.srcClass, 'Class_All'));
  if (a.magic) cf = step(cf, T.bMagicAtkDef || 0);
  else cf = step(cf, a.isLong ? (T.bLongAtkDef || 0) : (T.bNearAtkDef || 0));
  return cf;
}

/**
 * Monster -> player (basic attacks). rAthena: is_attack_hitting, battle_calc_base_damage (mob), RES,
 * battle_calc_defense_reduction (tsd), element vs. armor element, battle_calc_cardfix (target = player).
 * @param opt { mobId, attackers: number of monsters attacking (FLEE penalty from 3), debuffs: { SM_PROVOKE: lv } }
 */
export function calculateDefense(db, build, opt) {
  const r = build.status, T = build.equip.totals;
  const mobBase = db.mobs[opt.mobId];
  if (!mobBase) throw new Error('unknown monster ' + opt.mobId);
  const deb = debuffEffects(opt.debuffs, db);
  const mob = mobStatus(mobBase, deb, db);
  const learned = { ...(build.skills || {}), ...(opt.skills || {}) };
  const steps = [];
  // ---- hit chance: mob HIT vs player FLEE (agi_penalty_type 1: -10% FLEE per attacker from the 3rd)
  const attackers = Math.max(1, opt.attackers || 1);
  let flee = r.flee;
  if (attackers >= 3) flee = Math.max(1, trunc(flee * (100 - (attackers - 2) * 10) / 100));
  const hitRate = Math.min(100, Math.max(5, mob.hit - flee));
  const pd = Math.min(100, (r.flee2 ?? (r.perfectDodge * 10)) / 10);        // Lucky Dodge: rnd()%1000 < flee2
  let land = (1 - pd / 100) * hitRate / 100;
  // ---- damage: rnd(atk*80%, atk*120%) + (str + lv); Provoke on the monster adds ATK%
  const atkPct = 100 + (deb.active.includes('SM_PROVOKE') ? 2 + 3 * Math.min(10, opt.debuffs.SM_PROVOKE) : 0);
  const baseMin = trunc(mob.atk * 80 / 100) + mob.batk, baseMax = trunc(mob.atk * 120 / 100) + mob.batk;
  const isLong = (mob.range || 1) >= 4;
  let armorEle = armorElement(T);
  if (r.scCalc) armorEle = ELE_NAMES[r.scCalc('element', eleIndex(armorEle))] || armorEle;   // armor endows (status_calc_element)
  const eleMod = db.battle.attr[1]?.Neutral?.[armorEle] ?? 100;
  let vitDef = r.def;
  const undeadOrDemon = mob.ele === 'Undead' || mob.race === 'Undead' || mob.race === 'Demon';
  if (learned.AL_DP && undeadOrDemon) vitDef += trunc((r.baseLv / 25 + 3) * learned.AL_DP + 0.5);
  if (learned.RA_RANGERMAIN && ['Brute', 'Player_Doram', 'Fish', 'Plant'].includes(mob.race)) vitDef += learned.RA_RANGERMAIN * 5;
  if (learned.NC_RESEARCHFE && ['Fire', 'Earth'].includes(mob.ele)) vitDef += learned.NC_RESEARCHFE * 10;
  let def1 = r.hardDef;
  if (def1 === -400) def1 = -399;
  const res = r.res || 0;
  const cardfix = targetCardfix(T, { atkEle: 'Neutral', srcEle: mob.ele, srcSize: mob.size, srcRace: mob.race, srcRaceGroups: mob.raceGroups,
    srcClass: mob.class === 'Boss' || mob.mvp ? 'Class_Boss' : 'Class_Normal', isLong, magic: false });
  const one = (base) => {
    let d = trunc(base * atkPct / 100);
    if (res > 0) d -= trunc(res / (res + 400) * 80 / 100 * d);
    d = trunc(d * (4000 + def1) / (4000 + 10 * def1)) - vitDef;
    d = trunc(d * eleMod / 100);
    d -= trunc(d * (1000 - cardfix) / 1000);
    return Math.max(1, d);
  };
  let min = one(baseMin), max = one(baseMax);
  // ---- a monster skill (opt.mobSkill = { skill, level }): battle_calc_weapon_attack / battle_calc_magic_attack for a monster
  let mobSkillInfo = null;
  if (opt.mobSkill?.skill) {
    const sk = db.skills.skills[opt.mobSkill.skill];
    if (!sk) throw new Error('unknown skill ' + opt.mobSkill.skill);
    const lv = Math.max(1, Math.min(opt.mobSkill.level || 1, sk.maxLv || 10));
    const hitsRaw = levelValue(sk.hits, lv) || 1, nHits = Math.abs(hitsRaw);
    const C = db.equip.constants;
    const S = { str: mob.str, agi: mob.agi, vit: mob.vit, int_: mob.int, dex: mob.dex, luk: mob.luk, batk: mob.batk,
      base_level: mob.lv, max_hp: mob.hp, hp: mob.hp, max_sp: 0, sp: 0 };
    const Tst = { race: 'RC_' + playerRace(db, build).toUpperCase(), size: SIZE_C[playerSize(db, build)], def_ele: 'ELE_' + armorEle.toUpperCase(),
      hp: r.hp, max_hp: r.hp, vit: r.base?.vit, int_: r.base?.int, luk: r.base?.luk, class_: 'CLASS_NORMAL' };
    const funcs = { pc_checkskill: () => 0, status_get_lv: (w) => (w === 'target' ? r.baseLv : mob.lv),
      status_get_max_hp: (w) => (w === 'target' ? r.hp : mob.hp), status_get_hp: (w) => (w === 'target' ? r.hp : mob.hp),
      status_get_class_: () => (mob.class === 'Boss' || mob.mvp ? 'CLASS_BOSS' : 'CLASS_NORMAL'), status_get_size: () => Tst.size,
      status_has_mode: () => 0, distance_xy: () => 0, distance_bl: () => 0, rnd_chance: () => 0, BL_CAST: () => null,
      getSkillId: () => opt.mobSkill.skill, min: Math.min, max: Math.max, cap_value: (v, a, b) => Math.min(Math.max(v, a), b),
      floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt };
    const noSC = { getSCE: () => 0, hasSCE: () => 0, empty: () => 1 };
    const ctx = { skill_lv: lv, constants: C, funcs,
      vars: { S, T: Tst, SD: null, TSD: null, SC: noSC, TSC: noSC, WD: { miscflag: 0, flag: 0, div_: hitsRaw }, MFLAG: 0, src: 'src', target: 'target' } };
    let ratio = 100;
    const unsup = [];
    if (sk.ratio) { const o = runRatio(sk.ratio, { ...ctx, skillratio: 100 }); ratio = o.skillratio; unsup.push(...o.unsupported); }
    let ele = sk.ele === 'Weapon' || !sk.ele ? 'Neutral' : levelValue(sk.ele, lv);
    if (sk.eleMod) { const o = runVar(sk.eleMod, { ...ctx, constants: { ...C, ...ELE_CONST } }, 'element', eleIndex(ele)); if (ELE_NAMES[o.value]) ele = ELE_NAMES[o.value]; }
    const skMod = db.battle.attr[1]?.[ele]?.[armorEle] ?? 100;
    const flagsSk = new Set(sk.flags || []);
    const skLong = Math.abs(levelValue(sk.range, lv) || 1) >= 4 || LONG_SKILLS.has(opt.mobSkill.skill);
    const magicHit = sk.type === 'Magic';
    const cf = targetCardfix(T, { atkEle: ele, srcEle: mob.ele, srcSize: mob.size, srcRace: mob.race, srcRaceGroups: mob.raceGroups,
      srcClass: mob.class === 'Boss' || mob.mvp ? 'Class_Boss' : 'Class_Normal', isLong: skLong, magic: magicHit });
    const sub = T[`bSubSkill:${opt.mobSkill.skill}`] || 0;
    let perHit;
    // skills with their own base damage (battle_calc_magic_attack / battle_calc_misc_attack)
    const msk = opt.mobSkill.skill;
    let mMin = mob.int + mob.lv + trunc((mob.atk2 || 0) * 70 / 100), mMax = mob.int + mob.lv + trunc((mob.atk2 || 0) * 130 / 100);
    let special = false, minus = 0;
    if (msk === 'NPC_DARKBREATH') { mMin = mMax = trunc(r.hp * (lv <= 5 ? trunc(100 / (2 * (6 - lv))) : 50) / 100); ratio = 100; special = true; }
    if (msk === 'NPC_EARTHQUAKE') { mMin = baseMin; mMax = baseMax; ratio = 200 + 100 * lv + 100 * trunc(lv / 2) + (lv > 4 ? 100 : 0); special = true; }
    if (msk === 'NPC_ICEMINE' || msk === 'NPC_FLAMECROSS') { mMin = mMax = mob.atk * 20 * lv; ratio = 100; special = true; }
    if (msk === 'NPC_GRANDDARKNESS') {
      mMin = trunc((baseMin + mMin) / 2); mMax = trunc((baseMax + mMax) / 2); ratio = 100 + 40 * lv; special = true;
      minus = (r.hardDef || 0) + (r.hardMdef || 0);                 // renewal: − (DEF + MDEF) after the ratio
    }
    const MISC = { NPC_SELFDESTRUCTION: mob.hp, NPC_KILLING_AURA: 10000, NPC_SMOKING: 3 };
    if (sk.type === 'Misc' && MISC[msk] !== undefined) {
      const fixed = MISC[msk];
      perHit = () => {
        let d = fixed;
        if (!flagsSk.has('IgnoreElement')) d = trunc(d * skMod / 100);
        if (!flagsSk.has('IgnoreDefCard')) d -= trunc(d * (1000 - cf) / 1000);
        return Math.max(1, d);
      };
      steps.push(['Monster skill base', `${fixed} (fixed)`]);
      min = perHit(); max = perHit(); special = true;
    } else if (magicHit) {
      const mdef = r.hardMdef || 0, mdef2 = r.mdef || 0, mres = r.mres || 0;
      perHit = (base) => {
        let d = trunc(base * ratio / 100);
        if (mres > 0 && !minus) d -= trunc(mres / (mres + 400) * 80 / 100 * d);   // renewal MRES (same shape as RES)
        if (minus) d -= minus;
        else if (!flagsSk.has('IgnoreDefense')) d = trunc(d * (1000 + mdef) / (1000 + mdef * 10)) - mdef2;
        if (!flagsSk.has('IgnoreElement')) d = trunc(d * skMod / 100);
        if (!flagsSk.has('IgnoreDefCard')) d -= trunc(d * (1000 - cf) / 1000);
        d -= trunc(d * sub / 100);
        return Math.max(1, d);
      };
      steps.push([special ? 'Monster skill base' : 'Monster MATK', `${mMin} ~ ${mMax}`]);
      min = perHit(mMin); max = perHit(mMax);
    } else {
      perHit = (base) => {
        let d = trunc(trunc(base * atkPct / 100) * ratio / 100);
        if (res > 0) d -= trunc(res / (res + 400) * 80 / 100 * d);
        if (!flagsSk.has('IgnoreDefense')) d = trunc(d * (4000 + def1) / (4000 + 10 * def1)) - vitDef;
        d = trunc(d * skMod / 100);
        d -= trunc(d * (1000 - cf) / 1000);
        d -= trunc(d * sub / 100);
        return Math.max(1, d);
      };
      min = perHit(baseMin); max = perHit(baseMax);
    }
    const mul = hitsRaw > 0 ? hitsRaw : 1;   // negative hit count: one damage shown split (not multiplied)
    min *= mul; max *= mul;
    if (magicHit || sk.type === 'Misc') land = 1;   // magic and misc skills ignore FLEE and Perfect Dodge
    mobSkillInfo = { skill: opt.mobSkill.skill, name: sk.name, level: lv, type: sk.type, element: ele, ratio, hits: hitsRaw,
      isLong: skLong, unsupported: unsup,
      note: !special && SPECIAL_MOB_SKILLS.has(msk) ? 'this skill has its own damage formula in battle.cpp; the generic one is shown' : null };
    steps.push(['Monster skill', `${sk.name} Lv${lv} (${sk.type}, ${ele}) ratio ${ratio}% × ${hitsRaw > 0 ? hitsRaw : 1} (${nHits} hit(s))`],
      ['Skill element → armor ' + armorEle, skMod + '%']);
  }
  // battle_calc_damage on you: Assumptio, Steel Body, Defender, Energy Coat... (your statuses as the target)
  const myAct = r.scCalc?.active || {};
  if (r.scCalc?.finalDamage && Object.keys(myAct).length) {
    const fo = { noCaster: true, flag: 1 | (isLong ? 64 : 16) | 512, target: { active: myAct, type: 'BL_PC' } };
    const b0 = min + max;
    min = Math.max(1, r.scCalc.finalDamage(min, fo)); max = Math.max(1, r.scCalc.finalDamage(max, fo));
    if (min + max !== b0) steps.push(['Your statuses (battle_calc_damage)', `×${((min + max) / b0).toFixed(3)}`]);
  }
  const avg = Math.round((min + max) / 2);
  // battle_status_block_damage: statuses that soak whole hits
  const blocks = [];
  if (myAct.SC_KYRIE) blocks.push({ status: 'SC_KYRIE', absorbHp: myAct.SC_KYRIE.val2, hits: myAct.SC_KYRIE.val3 });
  if (myAct.SC_SAFETYWALL && !isLong) blocks.push({ status: 'SC_SAFETYWALL', hits: myAct.SC_SAFETYWALL.val2 || null });
  if (myAct.SC_PNEUMA && isLong) blocks.push({ status: 'SC_PNEUMA', hits: null });
  if (myAct.SC_MILLENNIUMSHIELD) blocks.push({ status: 'SC_MILLENNIUMSHIELD', hits: myAct.SC_MILLENNIUMSHIELD.val2, absorbHp: 1000 });
  if (myAct.SC_AUTOGUARD) blocks.push({ status: 'SC_AUTOGUARD', chance: myAct.SC_AUTOGUARD.val2 });
  if (myAct.SC_PARRYING) blocks.push({ status: 'SC_PARRYING', chance: myAct.SC_PARRYING.val2 });
  // damage you send back to the monster (Reflect Shield, bShortWeaponDamageReturn...) per landed hit
  const isMagicHit = mobSkillInfo?.type === 'Magic', hitLong = mobSkillInfo ? mobSkillInfo.isLong : isLong;
  const ret = returnDamage(T, myAct, { isLong: hitLong, magic: isMagicHit, skillId: mobSkillInfo?.skill });
  const reflect = { ...ret, avg: Math.round(avg * ret.percent / 100) };
  if (ret.percent) steps.push(['Reflected to the monster', `${ret.percent}% → ${reflect.avg} per hit`]);
  if (ret.magicChance) steps.push(['Magic reflected (chance)', ret.magicChance + '%']);
  const delay = mob.adelay || 2000;
  const hitsToDie = Math.ceil(r.hp / avg);
  steps.push(['Monster ATK', `${baseMin} ~ ${baseMax}`], ['Monster HIT − your FLEE', `${mob.hit} − ${flee} → ${hitRate}%`],
    ['Perfect Dodge', pd + '%'], ['Your RES', res], ['Your DEF', `${def1} / soft ${vitDef}`],
    ['Neutral → armor ' + armorEle, eleMod + '%'], ['Damage reduction (cards)', (100 - cardfix / 10).toFixed(1) + '%'],
    [isLong ? 'Ranged attack' : 'Melee attack', `range ${mob.range}`]);
  return { mob: mobBase, mobStatus: mob, hitRate, perfectDodge: pd, flee, land: Math.round(land * 10000) / 100,
    dodge: Math.round((1 - land) * 10000) / 100, min, max, avg, isLong, attackDelay: delay,
    dpsTaken: avg * land * 1000 / delay, hitsToDie, blocks, reflect, mobSkill: mobSkillInfo,
    mobSkills: (db.mobskills?.[opt.mobId] || []).filter((m) => m.attack), secondsToDie: land > 0 ? Math.round(hitsToDie / land * delay) / 1000 : null,
    steps };
}

export { ELE };
