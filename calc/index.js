/**
 * RO-Simulation calculation engine (no UI).
 *
 *   import { loadAll, calculateBuild } from '../calc/index.js';
 *   const db = await loadAll('../data/');
 *   const result = calculateBuild(db, {
 *     jobId: 4252, trans: false, baseLv: 275, jobLv: 60,
 *     base: { str: 130, agi: 100, vit: 100, int: 1, dex: 120, luk: 1 }, traitBase: { pow: 100, con: 40 },
 *     equipment: { weapon: { id: 21051, refine: 12, grade: 2, cards: [4140], enchants: [] }, armor: { id: 15376, refine: 9 } },
 *     skills: { RK_DRAGONTRAINING: 5 },
 *   });
 *   result.status   -> HP, SP, ATK, MATK, HIT, FLEE, ASPD ... (see calc/status.js)
 *   result.equip    -> per-item bonuses, totals, scripts that were ignored
 *
 *   const dmg = calculateDamage(db, result, { skill: 'RK_SONICWAVE', level: 10, mobId: 1002, skills: { ... } });
 *   dmg.min / dmg.max / dmg.avg, dmg.crit, dmg.hitRate, dmg.critRate, dmg.cast, dmg.dps, dmg.steps
 */
import { calculate } from './status.js';
import { loadEquipData, evaluateEquipment } from './equip.js';
import { calculateDamage } from './damage.js';
import { consumableEffects, EXTRA_BUFFS, jobSkills, jobTreeName } from './buffs.js';
import { scActivate, scCalculator } from './sc.js';
import { passiveBonuses } from './passive.js';

export { calculate } from './status.js';
export { SLOTS, itemsForSlot, cardsForSlot, refineBonus, evaluateEquipment, sumBonuses } from './equip.js';
export { calculateDamage, calculateDefense, mobStatus } from './damage.js';
export { DEBUFFS, debuffList, EXTRA_BUFFS, buffList, buffAvailability, consumableAvailability, debuffEffects, autobonusUptime, consumableEffects, jobSkills, jobTreeName } from './buffs.js';
export { scActivate, scCalculator } from './sc.js';
export { passiveBonuses } from './passive.js';
export { itemUsableBy } from './equip.js';

export async function loadAll(base = '../data/') {
  const get = (f) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
  const [status, equip, skills, mobs, battle, consumables, sc] = await Promise.all([
    get('status.json'), loadEquipData(base), get('skills.json'), get('mobs.json'), get('battle.json'), get('consumables.json'),
    get('sc.json'),
  ]);
  const mobskills = await get('mobskills.json').catch(() => ({}));   // optional: monster skills (build_mob_skills.py)
  return { status, equip, skills, mobs, battle, consumables, sc, mobskills };
}

/** rAthena class id for the selected job (uses the transcendent class when ticked). */
export function classIdOf(db, input) {
  const job = db.status.jobs.find((j) => j.id === input.jobId) || db.status.jobs[0];
  if (input.trans && job.transClass) {
    const id = db.equip.constants['Job_' + job.transClass];
    if (id !== undefined) return id;
  }
  return job.id;
}

/**
 * Stats -> equipment scripts -> stats again. Scripts that read stats (readparam) see the stats including
 * equipment, so we evaluate twice like the game does when it recalculates.
 *
 * Buffs: input.buffs = { SKILL: lv } (buffList(db) / buffAvailability()) plus EXTRA_BUFFS (FOOD_STR: 10, ASPD_POTION: 3),
 * input.consumables = [item ids] (data/consumables.json). Their status changes are run by calc/sc.js.
 */
export function calculateBuild(db, input) {
  const build = input.equipment || {};
  const classId = classIdOf(db, input);
  const cons = consumableEffects(db.consumables, input.consumables || [], { db, classId, baseLv: input.baseLv });
  const sel = { ...(input.buffs || {}) };
  for (const [k, lv] of Object.entries(cons.buffs)) sel[k] = Math.max(sel[k] || 0, lv);
  const skillSel = {}, direct = { ...cons.sc }, foodStats = {};
  for (const [id, lv] of Object.entries(sel)) {
    if (!(lv > 0)) continue;
    const extra = EXTRA_BUFFS.find((b) => b.id === id);
    if (/^SC_/.test(id) && !db.sc?.buffs?.[id]) { if (!(direct[id]?.val1 >= lv)) direct[id] = { val1: lv }; continue; }   // a status given directly (Shadow Chaser skills are named SC_* too)
    if (extra?.stats) for (const [k, v] of Object.entries(extra.stats(lv))) foodStats[k] = (foodStats[k] || 0) + v;
    else if (extra?.sc) {
      for (const [sc, v] of Object.entries(extra.sc(Math.min(lv, extra.maxLv)))) if (!(direct[sc]?.val1 >= v.val1)) direct[sc] = v;
    } else skillSel[id] = lv;
  }
  const extraSc = { stats: foodStats };
  const mapid = db.equip.jobs?.[classId]?.mapid ?? 0;
  const who = (stats) => ({ classId, baseLv: input.baseLv, jobLv: input.jobLv, sex: input.sex ?? 1,
    stats, skills: input.skills || {}, autobonus: input.autobonus });
  // without status changes first, to know the stats the buffs start from
  let status = calculate(db.status, { ...input, sc: extraSc, equip: undefined });
  let equip = evaluateEquipment(db.equip, build, who(status.total), cons.scripts);
  status = calculate(db.status, { ...input, sc: extraSc, equip: equip.status, baseLv: status.baseLv, jobLv: status.jobLv });
  // passive skills of status_calc_pc (Owl's Eye, Shadow Sense, Dragonology...) depend on the weapon
  const passive = passiveBonuses({ skills: input.skills || {}, weapon: status.weapon, shield: !!equip.base.shield, mapid,
    jobLv: status.jobLv, superNoviceNoDeath: input.superNoviceNoDeath !== false });
  const extras = passive.script ? [...cons.scripts, { key: 'passive:' + passive.script, script: passive.script, source: 'Passive skills' }] : cons.scripts;
  input = { ...input, passiveStats: passive.stats };
  equip = evaluateEquipment(db.equip, build, who(status.total), extras);
  status = calculate(db.status, { ...input, sc: extraSc, equip: equip.status, baseLv: status.baseLv, jobLv: status.jobLv });
  // status changes
  const own = db.skills?.tree ? jobSkills(db.skills.tree, jobTreeName(db, classId)) : {};
  // cast by yourself: own skill, skill granted by equipment, or used from an item (rune stone, scroll)
  const selfCast = new Set(Object.keys(skillSel).filter((k) => own[k] || equip.grantedSkills?.[k] || cons.buffs[k]));
  const env = { skills: input.skills || {}, weapon: status.weapon, weaponLv: db.equip.items[build.weapon?.id]?.wlv || 0, riding: input.riding, selfCast,
    paramBonus: equip.status.stats, spiritball: input.spiritball || 0,
    status: { ...status.total, baseLv: status.baseLv, jobLv: status.jobLv, hp: status.hp, sp: status.sp, atk: status.atk } };
  const act = db.sc ? scActivate(db.sc, { ...skillSel, ...direct }, env) : { active: {}, refused: [], unsupported: [] };
  const scCalc = db.sc ? scCalculator(db.sc, act.active, env) : null;
  for (let pass = 0; pass < 2; pass++) {
    status = calculate(db.status, { ...input, sc: extraSc, scCalc, equip: equip.status, baseLv: status.baseLv, jobLv: status.jobLv });
    equip = evaluateEquipment(db.equip, build, who(status.total), extras);
  }
  status = calculate(db.status, { ...input, sc: extraSc, scCalc, equip: equip.status, baseLv: status.baseLv, jobLv: status.jobLv });
  return { status, equip, skills: input.skills || {}, consumables: cons, classId,
    buffs: { active: act.active, refused: act.refused, unsupported: [...act.unsupported, ...(scCalc ? scCalc.unsupported : [])] } };
}
