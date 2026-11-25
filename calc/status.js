/**
 * RO Status Calculator - renewal formulas (pure functions, no DOM).
 * Formulas follow rAthena src/map/status.cpp and src/map/pc.cpp (RENEWAL).
 */

export const STATS = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
export const TRAITS = ['pow', 'sta', 'wis', 'spl', 'con', 'crt'];

/** Status point cost to raise a stat from `low` to `low + 1` (renewal). */
export function statCost(low) {
  return low < 100 ? 2 + Math.floor((low - 1) / 10) : 16 + 4 * Math.floor((low - 100) / 5);
}

/** Total status points spent to raise a stat from 1 to `value`. */
export function statSpent(value) {
  let sp = 0;
  for (let v = 1; v < value; v++) sp += statCost(v);
  return sp;
}

/** Job bonus stats for a job level: { str, agi, ..., crt }. */
export function jobBonus(cls, jobLv, keys) {
  const out = {};
  keys.forEach((k) => { out[k.toLowerCase()] = 0; });
  for (const row of cls.bonus) {
    if (row[0] > jobLv) continue;
    keys.forEach((k, i) => { out[k.toLowerCase()] += row[i + 1]; });
  }
  return out;
}

const div = (a, b) => Math.trunc(a / b);

/**
 * @param {object} data   data/status.json
 * @param {object} input  { jobId, trans, baseLv, jobLv, base:{str..luk}, bonus:{...}, traitBase:{pow..crt},
 *                          traitBonus:{...}, weapon, shield, hpRate, spRate, aspdRate, aspdAdd,
 *                          equip }   // equip = evaluateEquipment(...).status (optional)
 */
export function calculate(data, input) {
  const job = data.jobs.find((j) => j.id === input.jobId) || data.jobs[0];
  const useTrans = Boolean(input.trans && job.transClass);
  const cls = data.classes[useTrans ? job.transClass : job.class];
  const upper = job.upper || useTrans;
  const baseLv = clamp(input.baseLv, 1, cls.maxBase);
  const jobLv = clamp(input.jobLv, 1, cls.maxJob);
  const jb = jobBonus(cls, jobLv, data.statKeys);
  const eq = input.equip || EMPTY_EQUIP;
  const sc = input.sc || NO_SC;               // manual extras (food numbers): { stats: { str: 10 } }
  // status changes (buffs): calc/sc.js scCalculator() – runs the server's status_calc_* code; identity when absent
  const SCF = input.scCalc || ((name, v) => (['aspd', 'hpbonus', 'spbonus', 'matk'].includes(name) ? 0 : v));
  const skills = input.skills || {};

  // --- stats -----------------------------------------------------------------
  const total = {};
  const base = {};
  for (const k of STATS) {
    base[k] = clamp(input.base?.[k] ?? 1, 1, job.maxStat);
    total[k] = base[k] + jb[k] + (Number(input.bonus?.[k]) || 0) + (eq.stats?.[k] || 0);
    total[k] += (sc.stats?.[k] || 0) + (input.passiveStats?.[k] || 0);   // food numbers, passive skills (Owl's Eye...)
    total[k] = Math.max(0, SCF(k, total[k]));                      // status_calc_str / _agi / ...
  }
  for (const k of TRAITS) {
    base[k] = job.traits ? clamp(input.traitBase?.[k] ?? 0, 0, data.maxTrait) : 0;
    total[k] = job.traits ? base[k] + jb[k] + (Number(input.traitBonus?.[k]) || 0) + (eq.stats?.[k] || 0) : 0;
    if (job.traits) total[k] = Math.max(0, SCF(k, total[k] + (input.passiveStats?.[k] || 0)));
  }

  const pointsTotal = data.statPoints[baseLv - 1] + (upper ? data.transcendentPoints : 0);
  const pointsUsed = STATS.reduce((s, k) => s + statSpent(base[k]), 0);
  const traitTotal = job.traits ? data.traitPoints[baseLv - 1] + data.traitJobChangePoints : 0;
  const traitUsed = job.traits ? TRAITS.reduce((s, k) => s + base[k], 0) : 0;

  const { str, agi, vit, dex, luk } = total;
  const int_ = total.int;
  const { pow, sta, wis, spl, con, crt } = total;
  const lv = baseLv;
  const weaponInput = eq.weaponType && eq.weaponType !== 'Fist' ? eq.weaponType : input.weapon;
  const ranged = data.rangedWeapons.includes(weaponInput);

  // --- status_base_atk (BL_PC, renewal) --------------------------------------
  const mainAtk = ranged ? dex : str;
  const subAtk = ranged ? str : dex;
  const atk = SCF('batk', div(mainAtk * 10 + div(subAtk * 10, 5) + div(luk * 10, 3) + div(lv * 10, 4), 10) + 5 * pow);
  // --- status_base_matk (BL_PC, renewal) -------------------------------------
  const matk = int_ + div(int_, 2) + div(dex, 5) + div(luk, 3) + div(lv, 4) + 5 * spl;

  // --- status_calc_misc -------------------------------------------------------
  const rate = (v, r) => v + Math.trunc(v * r / 100);
  const hit = SCF('hit', rate(lv + dex + div(luk, 3) + 175 + 2 * con + eq.hit, eq.hitRate));
  const flee = SCF('flee', rate(lv + agi + div(luk, 5) + 100 + 2 * con + eq.flee, eq.fleeRate));
  const def = SCF('def2', Math.trunc((lv + vit) / 2 + agi / 5) + eq.def2);         // soft DEF
  const mdef = SCF('mdef2', Math.trunc(int_ + lv / 4 + (dex + vit) / 5) + eq.mdef2); // soft MDEF
  const hardDef = SCF('def', rate(eq.def, eq.defRate));
  const hardMdef = SCF('mdef', rate(eq.mdef, eq.mdefRate));
  const cri = SCF('critical', rate(10 + luk * 3 + div(lv, 10) + eq.cri, eq.criRate));  // x10
  const flee2 = SCF('flee2', luk + 10 + eq.flee2);                                    // x10
  const patk = SCF('patk', div(pow, 3) + div(con, 5) + eq.patk);
  const smatk = SCF('smatk', div(spl, 3) + div(con, 5) + eq.smatk);
  const res = SCF('res', sta + div(sta, 3) * 5 + eq.res);
  const mres = SCF('mres', wis + div(wis, 3) * 5 + eq.mres);
  const hplus = SCF('hplus', crt + eq.hplus);
  const crate = SCF('crate', div(crt, 3) + eq.crate);
  // Equipment ATK / MATK (right side of the status window); buffs that add weapon ATK (Impositio...) via status_calc_watk
  const scWatk = SCF('watk', eq.weaponAtk) - eq.weaponAtk;
  const weaponAtk = rate(eq.weaponAtk, eq.weaponAtkRate);
  const equipAtk = weaponAtk + eq.refineAtk + eq.equipAtk + scWatk;
  const scMatk = SCF('matk', 0);                                                       // status_calc_pseudobuff_matk
  const equipMatk = rate(eq.weaponMatk + eq.refineMatk, eq.weaponMatkRate) + eq.equipMatk + scMatk;

  // --- MaxHP / MaxSP / MaxAP --------------------------------------------------
  let hp = cls.hp[lv - 1];
  if (vit > 0) hp *= 1 + vit * 0.01;
  if (upper) hp *= 1.25;
  hp += (Number(input.bonus?.vit) || 0) + (eq.stats?.vit || 0); // VIT from equipment gives +1 HP each
  hp += eq.hpFlat + SCF('hpbonus', 'STATUS_BONUS_FIX');           // passive skills (Faith, Breakthrough...) + buffs
  hp += Math.trunc(hp * ((Number(input.hpRate) || 0) + eq.hpRate + SCF('hpbonus', 'STATUS_BONUS_RATE')) / 100);
  let sp = cls.sp[lv - 1];
  if (int_ > 0) sp *= 1 + int_ * 0.01;
  if (upper) sp *= 1.25;
  sp += (Number(input.bonus?.int) || 0) + (eq.stats?.int || 0);
  sp += eq.spFlat + SCF('spbonus', 'STATUS_BONUS_FIX');
  sp += Math.trunc(sp * ((Number(input.spRate) || 0) + eq.spRate + SCF('spbonus', 'STATUS_BONUS_RATE')) / 100);
  let ap = job.traits ? cls.ap[lv - 1] + eq.apFlat : 0;
  ap += Math.trunc(ap * eq.apRate / 100);

  // --- ASPD (status_base_amotion_pc, RENEWAL_ASPD) ---------------------------
  const weapons = Object.keys(cls.aspd).filter((w) => w !== 'Shield');
  const weapon = weapons.includes(weaponInput) ? weaponInput : 'Fist';
  let aspdBase = cls.aspd[weapon] ?? 40;
  const canShield = 'Shield' in cls.aspd;
  const shield = (input.shield || eq.shield) && canShield;
  if (shield) aspdBase += cls.aspd.Shield;
  else if (eq.leftWeaponType && cls.aspd[eq.leftWeaponType] !== undefined) aspdBase += Math.trunc(cls.aspd[eq.leftWeaponType] / 4); // dual wield
  const tempAspd = Math.sqrt(ranged ? (dex * dex) / 7 + agi * agi * 0.5 : (dex * dex) / 5 + agi * agi * 0.5) * 0.25 + 196;
  // Passive skills and fixed SC bonuses scale with AGI (status_base_amotion_pc, RENEWAL_ASPD)
  let aspdVal = SCF('aspd', true);                                // status_calc_aspd(fixed): Quicken, potions...
  if (skills.SA_ADVANCEDBOOK && weapon === 'Book') aspdVal += div(skills.SA_ADVANCEDBOOK - 1, 2) + 1;
  if (skills.SG_DEVIL && jobLv >= cls.maxJob) aspdVal += 1 + skills.SG_DEVIL;
  if (skills.GS_SINGLEACTION && ['Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade'].includes(weapon)) aspdVal += div(skills.GS_SINGLEACTION + 1, 2);
  if (input.riding === 'peco') aspdVal -= 50 - 10 * (skills.KN_CAVALIERMASTERY || 0);
  else if (input.riding === 'dragon') aspdVal -= 25 - 5 * (skills.RK_DRAGONTRAINING || 0);
  let aspd = Math.trunc(tempAspd + aspdVal * agi / 200) - Math.min(aspdBase, 200);
  // status_calc_aspd(false) also holds the passive Musical Lesson / Plagiarism bonus
  const aspdRate = (Number(input.aspdRate) || 0) + eq.aspdRate + SCF('aspd', false);
  if (aspdRate) aspd += div(Math.max(195 - aspd, 2) * aspdRate, 100);
  aspd += (Number(input.aspdAdd) || 0) + eq.aspd;
  // status_calc_fix_aspd works on amotion (10 = 1 ASPD): Fighting Spirit, Heat Barrel...
  const amotion = (200 - aspd) * 10;
  aspd -= Math.trunc((SCF('fix_aspd', amotion) - amotion) / 10);
  aspd = clamp(aspd, 0, job.maxAspd);

  // --- Variable cast time reduction (skill.cpp, vcast_stat_scale 530) ---------
  const vct = Math.min(1, Math.sqrt(Math.max(0, dex * 2 + int_) / 530));
  const flee2Total = flee2;

  return {
    job, cls, useTrans, upper, baseLv, jobLv, weapons, weapon, canShield, jobBonus: jb, base, total,
    points: { total: pointsTotal, used: pointsUsed, left: pointsTotal - pointsUsed },
    traitPoints: { total: traitTotal, used: traitUsed, left: traitTotal - traitUsed },
    nextCost: Object.fromEntries(STATS.map((k) => [k, base[k] >= job.maxStat ? null : statCost(base[k])])),
    hp: Math.max(1, Math.trunc(hp)), sp: Math.max(1, Math.trunc(sp)), ap,
    atk, matk, patk, smatk, hit, flee, def, mdef, res, mres, hplus, crate, shield,
    equipAtk, equipMatk, atkRate: eq.atkRate, matkRate: eq.matkRate, overRefineMax: eq.overRefineMax, hardDef, hardMdef,
    variableCastRate: eq.variableCastRate, sc, scCalc: input.scCalc || null, scWatk, scMatk, flee2: flee2Total, fixedCastRate: eq.fixedCastRate, fixedCast: eq.fixedCast, delayRate: eq.delayRate,
    critRaw: cri, crit: div(cri, 10), perfectDodge: div(flee2, 10),        // the client shows these /10, rounded down
    aspd, hitsPerSec: aspd >= 200 ? Infinity : 50 / (200 - aspd),
    vctReduction: vct * 100,
    weight: Math.trunc((cls.maxWeight + base.str * 300) / 10),
  };
}

const NO_SC = { stats: {}, statPct: {} };

const EMPTY_EQUIP = {
  stats: {}, hpFlat: 0, hpRate: 0, spFlat: 0, spRate: 0, apFlat: 0, apRate: 0,
  weaponAtk: 0, refineAtk: 0, overRefineMax: 0, equipAtk: 0, atkRate: 0, weaponAtkRate: 0,
  weaponMatk: 0, refineMatk: 0, equipMatk: 0, matkRate: 0, weaponMatkRate: 0,
  def: 0, defRate: 0, mdef: 0, mdefRate: 0, def2: 0, mdef2: 0, hit: 0, hitRate: 0, flee: 0, fleeRate: 0, flee2: 0, cri: 0, criRate: 0,
  aspd: 0, aspdRate: 0, variableCastRate: 0, fixedCastRate: 0, fixedCast: 0, delayRate: 0, cooldown: 0,
  patk: 0, smatk: 0, res: 0, mres: 0, hplus: 0, crate: 0, weaponType: 'Fist', shield: false,
};

function clamp(v, lo, hi) {
  v = Math.trunc(Number(v));
  if (!Number.isFinite(v)) v = lo;
  return Math.min(hi, Math.max(lo, v));
}
