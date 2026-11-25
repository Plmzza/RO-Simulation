/**
 * Buffs on the player and debuffs on the monster.
 *
 * Buff skills come from the server (data/sc.json, tools/build_sc_data.py): every skill that starts a status change
 * which changes stats / ATK / MATK / ASPD / cast / damage. Their effects are computed by calc/sc.js with the server's
 * own code, so values match the server. This file only adds the rules for who can use them, the manual food numbers,
 * consumables and the monster debuffs.
 *
 *   calculateBuild(db, { ...input, buffs: { AL_BLESSING: 10, KN_TWOHANDQUICKEN: 10 }, consumables: [12202] });
 *   buffList(db)                   // every buff skill for the UI
 *   buffAvailability(db, build)    // which ones this build can turn on (job skill tree, equipment, weapon)
 *   calculateDamage(db, build, { ..., debuffs: { SM_PROVOKE: 10, PR_LEXAETERNA: 1 } });
 */

/** Manual entries (no skill): food stats as plain numbers, ASPD potion by level. */
export const EXTRA_BUFFS = [
  { id: 'ASPD_POTION', name: 'ASPD potion (1=Concentration, 2=Awakening, 3=Berserk)', maxLv: 3, kind: 'item',
    sc: (lv) => ({ ['SC_ASPDPOTION' + (lv - 1)]: { val1: [4, 6, 9][lv - 1] } }) },
  ...['str', 'agi', 'vit', 'int', 'dex', 'luk'].map((k) => ({ id: 'FOOD_' + k.toUpperCase(), name: 'Food ' + k.toUpperCase(),
    maxLv: 30, kind: 'item', stats: (v) => ({ [k]: v }) })),
];

/** Buffs whose damage part is computed by hand in damage.js (not in the extracted status code). */
const HAND_EFFECT = new Set(['SC_MAGICPOWER']);

/** All buffs for the UI: [{ id, name, maxLv, kind: self|party|support|item, sc, effect, weapons, spheres }] */
export function buffList(db) {
  const out = [];
  for (const [id, b] of Object.entries(db.sc?.buffs || {})) out.push({ id, ...b });
  // Mystical Amplification: its MATK % is in status_calc_bl, applied in damage.js
  if (!out.some((b) => b.id === 'HW_MAGICPOWER')) out.push({ id: 'HW_MAGICPOWER', sc: 'SC_MAGICPOWER', name: 'Mystical Amplification', maxLv: 10, kind: 'self', effect: 'hand' });
  for (const b of EXTRA_BUFFS) out.push({ id: b.id, name: b.name, maxLv: b.maxLv, kind: b.kind, effect: 'item' });
  return out;
}

/** Skills a job has, including the jobs it inherits from: { SKILL: maxLv } */
export function jobSkills(tree, jobName, seen = new Set()) {
  const j = tree?.[jobName];
  if (!j || seen.has(jobName)) return {};
  seen.add(jobName);
  const out = {};
  for (const p of j.inherit || []) Object.assign(out, jobSkills(tree, p, seen));
  for (const [sk, lv] of j.skills) out[sk] = Math.max(out[sk] || 0, lv);
  return out;
}

/** Jobs whose own skill list (not inherited) contains the skill. */
function jobsWithOwnSkill(tree, skill) {
  return Object.entries(tree || {}).filter(([, j]) => j.skills.some(([s]) => s === skill)).map(([n]) => n);
}

/** Tree name of the build's job (Job_Assassin_Cross -> Assassin_Cross). */
export function jobTreeName(db, classId) {
  const C = db.equip.constants;
  return Object.keys(C).find((k) => k.startsWith('Job_') && C[k] === classId)?.slice(4);
}

/**
 * Which buffs this build can use, following the game:
 *   self    – only the caster gets it: the job must learn the skill (skill tree incl. earlier jobs) or equipment must
 *             grant it (`skill "ASC_EDP",5` in an item / card / combo script)
 *   party   – party / area buff (songs, Gloria...): anyone can get it from a party member who has the skill
 *   support – cast on another player (Blessing...): anyone can get it
 *   item    – consumable / manual number
 * Weapon checks: the caster's weapon for self skills (skill_db Requires), the receiver's weapon where the server
 * refuses the status otherwise (status_change_start, e.g. Adrenaline Rush needs an axe or a mace).
 * @returns [{ id, name, maxLv, kind, available, fromJob, fromEquip, castBy, reason, note, effect }]
 */
export function buffAvailability(db, build) {
  const tree = db.skills.tree;
  const own = jobSkills(tree, jobTreeName(db, build.classId));
  const granted = build.equip.grantedSkills || {};
  const weapon = build.status.weapon || 'Fist';
  const recvWeapons = (sc) => {
    const sk = db.sc?.receiverWeaponSkill?.[sc];
    return sk ? db.sc.skillWeapons?.[sk] : null;
  };
  // consumables that cast the buff (scrolls, rune stones...): { SKILL: [item ids] }
  const byItem = {};
  for (const [id, it] of Object.entries(db.consumables || {})) {
    for (const e of it.effects) if (e.buff) (byItem[e.buff] ||= []).push(Number(id));
  }
  return buffList(db).map((b) => {
    const fromJob = own[b.id] || 0;
    const fromItems = (byItem[b.id] || []).filter((id) => itemUsableBy(db.equip, db.consumables[id], build.classId, build.status.baseLv).ok
      && db.consumables[id].effects.some((e) => e.buff === b.id && effectConditionMet(db, e.cond, build.classId, build.status.baseLv)));
    const fromEquip = granted[b.id] ? { lv: granted[b.id].lv, source: granted[b.id].source } : null;
    const castBy = b.kind === 'item' ? [] : jobsWithOwnSkill(tree, b.id);
    let available = true, reason = null, maxLv = b.maxLv;
    const notes = [];
    if (b.kind === 'self') {
      const lv = Math.max(fromJob, fromEquip?.lv || 0);
      if (!lv && fromItems.length) notes.push('ใช้ได้ผ่านไอเท็ม: ' + fromItems.map((id) => db.consumables[id].name).join(', '));
      else if (!lv) { available = false; reason = 'อาชีพนี้ไม่มีสกิลนี้ และไม่มีอุปกรณ์หรือไอเท็มที่ให้ใช้สกิลนี้'; }
      else maxLv = Math.min(b.maxLv, lv);
      if (available && b.weapons?.length && !b.weapons.includes(weapon)) {
        available = false; reason = `ต้องใช้อาวุธ: ${b.weapons.join(', ')}`;
      }
    } else if (b.kind !== 'item' && !castBy.length && !fromEquip) {
      if (fromItems.length) notes.push('ได้จากไอเท็ม: ' + fromItems.map((id) => db.consumables[id].name).join(', '));
      else notes.push('ไม่มีอาชีพผู้เล่นที่เรียนสกิลนี้ได้');
    }
    if (b.vals && b.kind !== 'self') notes.push('ค่าบัพขึ้นกับสกิลของผู้ร่าย: ถ้าคนอื่นร่ายให้ คิดว่าผู้ร่ายมีสกิลที่เกี่ยวข้องเต็ม');
    const rw = b.sc ? recvWeapons(b.sc) : null;
    if (available && rw?.length && !rw.includes(weapon)) { available = false; reason = `ผู้รับต้องใช้อาวุธ: ${rw.join(', ')}`; }
    if (b.spheres) notes.push(`ต้องมี Spirit Sphere ${b.spheres} ลูก`);
    if (b.effect === 'battle') notes.push('ผลของบัพนี้อยู่ในสูตรดาเมจ: ดูผลได้ที่ Damage');
    return { id: b.id, name: b.name, maxLv, kind: b.kind, sc: b.sc, effect: b.effect, available, fromJob, fromEquip, fromItems, castBy,
      selfCast: fromJob > 0 || !!fromEquip, reason, note: notes.join(' · ') || null };
  });
}

import { itemUsableBy } from './equip.js';
import { compile, run } from './script.js';

/**
 * Does the condition the item script puts around an effect hold for this job? (rune stones: "if ((eaclass()&EAJ_THIRDMASK)
 * == EAJ_RUNE_KNIGHT)"). Only job / level conditions are judged; anything else (party, items in inventory) counts as met.
 */
export function effectConditionMet(db, cond, classId, baseLv) {
  if (!cond) return true;
  if (!/eaclass|BaseLevel|BaseJob|\bClass\b/.test(cond) || /countitem|getpartnerid|strcharinfo|\.@|Hp\b|getequip/.test(cond)) return true;
  const C = db.equip.constants;
  const mapid = db.equip.jobs?.[classId]?.mapid ?? 0;
  const prog = compile(`if (${cond}) bonus bOk,1;`);
  const r = run(prog, { constants: C, eaclass: () => mapid,
    param: (n) => (n === 'BaseLevel' ? baseLv : n === 'Class' ? classId : n === 'BaseJob' ? db.equip.jobs?.[classId]?.baseJob : undefined) });
  return r.bonuses.length > 0;
}

/** Monster debuffs computed by hand in damage.js (their effect is in battle_calc_damage, not in the status code). */
export const DEBUFFS = [
  { id: 'PR_LEXAETERNA', sc: 'SC_AETERNA', name: 'Lex Aeterna (first attack ×2)', maxLv: 1 },
  { id: 'SC_RAID', sc: 'SC_RAID', name: 'Raid debuff (+30% / Boss +15%)', maxLv: 1 },
];

/** Every monster debuff for the UI: [{ id, sc, name, maxLv, skills }] (generic ones from data/sc.json + DEBUFFS) */
export function debuffList(db) {
  const out = DEBUFFS.map((d) => ({ ...d, skills: [d.id] }));
  for (const d of Object.values(db.sc?.debuffs || {})) out.push({ id: d.skill, sc: d.sc, name: d.name, maxLv: d.maxLv, skills: d.skills });
  return out;
}

/**
 * Status changes on the monster. selected: { SKILL or SC_X: lv }. Returns
 * { active: [ids], aeterna, raid, sc: { SC_X: lv } } – the stat changes are run by calc/sc.js in mobStatus().
 */
export function debuffEffects(selected = {}, db) {
  const out = { aeterna: false, raid: false, sc: {}, active: [] };
  for (const [key, lvRaw] of Object.entries(selected || {})) {
    const lv = Number(lvRaw) || 0;
    if (lv <= 0) continue;
    if (key === 'PR_LEXAETERNA' || key === 'SC_AETERNA') { out.aeterna = true; out.active.push(key); continue; }
    if (key === 'SC_RAID') { out.raid = true; out.active.push(key); continue; }
    const d = Object.values(db?.sc?.debuffs || {}).find((x) => x.sc === key || x.skills.includes(key));
    if (!d) continue;
    const skill = d.skills.includes(key) ? key : d.skill;
    if (!(out.sc[skill] >= lv)) out.sc[skill] = Math.min(lv, db.sc.skillMax?.[skill] || lv);
    out.active.push(key);
  }
  return out;
}

/**
 * Expected share of time an autobonus is active: each trigger (attack / hit taken / skill use) has rate/1000 chance,
 * the bonus lasts durationMs. Uptime = 1 - (1 - p)^(triggers during one duration). Feed the result back as
 * calculateBuild({ ..., autobonus: uptime }) to scale the proc bonuses, or 'on' to count them as always active.
 */
export function autobonusUptime(rate, durationMs, triggersPerSec) {
  const p = Math.min(1, Math.max(0, rate / 1000));
  const n = Math.max(0, triggersPerSec * durationMs / 1000);
  return 1 - Math.pow(1 - p, n);
}

/**
 * Buff consumables chosen by the user (data/consumables.json, built from the server item_db + status.yml).
 * Effects in the same group do not stack in game; the strongest one is kept.
 * @param cons  db.consumables
 * @param ids   item ids that are active
 * @returns { scripts: [{ key, script, source }], buffs: { SKILL: lv }, sc: { SC_X: { val1..val4 } }, active, replaced }
 */
export function consumableEffects(cons, ids = [], who = null) {
  const best = new Map();
  for (const id of ids) {
    const it = cons?.[id];
    if (!it) continue;
    it.effects.forEach((e, n) => {
      if (who && e.cond && !effectConditionMet(who.db, e.cond, who.classId, who.baseLv)) return;   // e.g. rune stone, wrong job
      const cur = best.get(e.group);
      if (!cur || e.value > cur.e.value) best.set(e.group, { id, n, e, it });
    });
  }
  const out = { scripts: [], buffs: {}, sc: {}, active: [], replaced: [] };
  const used = new Set();
  for (const [group, { id, n, e, it }] of best) {
    used.add(id);
    if (e.script) out.scripts.push({ key: `u${id}:${n}`, script: e.script, source: it.name });
    if (e.buff) out.buffs[e.buff] = Math.max(out.buffs[e.buff] || 0, e.lv);
    if (e.sc) {                                   // status change put on directly: { sc: 'SC_ASPDPOTION2', vals: [9, 0, 0, 0] }
      const v = { val1: e.vals?.[0] || 0, val2: e.vals?.[1] || 0, val3: e.vals?.[2] || 0, val4: e.vals?.[3] || 0 };
      if (!(out.sc[e.sc]?.val1 >= v.val1)) out.sc[e.sc] = v;
    }
    out.active.push({ id, group });
  }
  // items none of whose effects count because a stronger item of the same group is active
  for (const id of ids) if (cons?.[id] && !used.has(id)) out.replaced.push(id);
  return out;
}

/**
 * Consumables this build may use (item_db Jobs / Classes / level), for the UI list.
 * @returns [{ id, name, res, usable, reason, groups }]
 */
export function consumableAvailability(db, build) {
  return Object.entries(db.consumables || {}).map(([id, it]) => {
    let u = itemUsableBy(db.equip, it, build.classId, build.status.baseLv);
    if (u.ok && !it.effects.some((e) => effectConditionMet(db, e.cond, build.classId, build.status.baseLv))) {
      u = { ok: false, reason: 'สคริปต์ของไอเท็มไม่ให้ผลกับอาชีพนี้' };
    }
    return { id: Number(id), name: it.name, res: it.res || null, inGame: !!it.inGame, usable: u.ok, reason: u.reason,
      groups: it.effects.map((e) => e.group) };
  });
}
