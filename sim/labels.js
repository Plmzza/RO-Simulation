/** Thai labels for equipment bonuses (Equipment Status window) and the random-option list of the craft window. */

export const STAT_TABS = [['all', 'All'], ['status', 'Status'], ['ability', 'Ability'], ['combat', 'Combat'], ['race', 'Race']];

export const RACES = [['RC_All', 'ทุกเผ่า'], ['RC_DemiHuman', 'Demi-Human'], ['RC_Player_Human', 'Player (Human)'], ['RC_Player_Doram', 'Player (Doram)'],
  ['RC_Brute', 'Brute'], ['RC_Plant', 'Plant'], ['RC_Insect', 'Insect'], ['RC_Fish', 'Fish'], ['RC_Demon', 'Demon'], ['RC_Undead', 'Undead'],
  ['RC_Formless', 'Formless'], ['RC_Angel', 'Angel'], ['RC_Dragon', 'Dragon']];
export const ELES = [['Ele_All', 'ทุกธาตุ'], ['Ele_Neutral', 'Neutral'], ['Ele_Water', 'Water'], ['Ele_Earth', 'Earth'], ['Ele_Fire', 'Fire'],
  ['Ele_Wind', 'Wind'], ['Ele_Poison', 'Poison'], ['Ele_Holy', 'Holy'], ['Ele_Dark', 'Dark'], ['Ele_Ghost', 'Ghost'], ['Ele_Undead', 'Undead']];
export const SIZES = [['Size_All', 'ทุกขนาด'], ['Size_Small', 'เล็ก'], ['Size_Medium', 'กลาง'], ['Size_Large', 'ใหญ่']];
const CLASSES = [['Class_All', 'ทุกประเภท'], ['Class_Normal', 'มอนสเตอร์ทั่วไป'], ['Class_Boss', 'Boss']];
const ARG = Object.fromEntries([...RACES, ...ELES, ...SIZES, ...CLASSES]);
const arg = (a) => ARG[a] || String(a).replace(/^(RC|Ele|Size|Class|RC2)_/, '').replace(/_/g, ' ');

// bonus -> [category, order, text(arg), percent?]
const B = {
  bStr: ['status', 1, 'STR'], bAgi: ['status', 2, 'AGI'], bVit: ['status', 3, 'VIT'], bInt: ['status', 4, 'INT'], bDex: ['status', 5, 'DEX'],
  bLuk: ['status', 6, 'LUK'], bAllStats: ['status', 0, 'All Stats'], bPow: ['status', 7, 'POW'], bSta: ['status', 8, 'STA'], bWis: ['status', 9, 'WIS'],
  bSpl: ['status', 10, 'SPL'], bCon: ['status', 11, 'CON'], bCrt: ['status', 12, 'CRT'], bAllTraitStats: ['status', 6.5, 'All Trait'],
  bMaxHP: ['status', 13, 'MaxHP'], bMaxHPrate: ['status', 14, 'MaxHP', 1], bMaxSP: ['status', 15, 'MaxSP'], bMaxSPrate: ['status', 16, 'MaxSP', 1],
  bMaxAP: ['status', 17, 'MaxAP'], bMaxAPrate: ['status', 17.5, 'MaxAP', 1],
  bAtk: ['combat', 20, 'ATK'], bAtk2: ['combat', 20, 'ATK'], bBaseAtk: ['combat', 20, 'ATK'], bAtkRate: ['combat', 21, 'ATK', 1],
  bMatk: ['combat', 22, 'MATK'], bMatkRate: ['combat', 23, 'MATK', 1], bPAtk: ['combat', 24, 'P.ATK'], bSMatk: ['combat', 25, 'S.MATK'],
  bPAtkRate: ['combat', 24.5, 'P.ATK', 1], bSMatkRate: ['combat', 25.5, 'S.MATK', 1],
  bHit: ['combat', 26, 'HIT'], bHitRate: ['combat', 26.5, 'HIT', 1], bFlee: ['combat', 27, 'FLEE'], bFleeRate: ['combat', 27.5, 'FLEE', 1],
  bFlee2: ['combat', 28, 'Perfect Dodge'], bCritical: ['combat', 29, 'CRI'], bCriticalRate: ['combat', 29.5, 'CRI', 1],
  bDef: ['combat', 30, 'DEF'], bDefRate: ['combat', 30.5, 'DEF', 1], bDef2: ['combat', 30.6, 'Soft DEF'], bMdef: ['combat', 31, 'MDEF'],
  bMdefRate: ['combat', 31.5, 'MDEF', 1], bMdef2: ['combat', 31.6, 'Soft MDEF'], bRes: ['combat', 32, 'RES'], bMres: ['combat', 33, 'MRES'],
  bHPlus: ['combat', 34, 'H.Plus'], bCRate: ['combat', 35, 'C.Rate'], bCritAtkRate: ['combat', 36, 'Damage คริติคอล', 1],
  bShortAtkRate: ['combat', 37, 'Damage ทางกายภาพระยะใกล้', 1], bLongAtkRate: ['combat', 38, 'Damage ทางกายภาพระยะไกล', 1],
  bPerfectHitRate: ['combat', 39, 'Perfect Hit', 1], bPerfectHitAddRate: ['combat', 39, 'Perfect Hit', 1],
  bAspd: ['ability', 40, 'ASPD'], bAspdRate: ['ability', 41, 'ASPD', 1], bDelayrate: ['ability', 42, 'Delay หลังใช้สกิล', 1],
  bVariableCastrate: ['ability', 43, 'ระยะเวลาร่ายแบบแปรผัน', 1], bFixedCastrate: ['ability', 44, 'ระยะเวลาร่ายแบบคงที่', 1],
  bFixedCast: ['ability', 45, 'ระยะเวลาร่ายแบบคงที่ (ms)'], bUseSPrate: ['ability', 46, 'การใช้ SP', 1], bHealPower: ['ability', 47, 'ความแรงฮีล', 1],
  bHealPower2: ['ability', 47.5, 'ฮีลที่ได้รับ', 1], bSPrecovRate: ['ability', 48, 'ฟื้น SP', 1], bHPrecovRate: ['ability', 48, 'ฟื้น HP', 1],
  bNoSizeFix: ['ability', 49, 'ไม่มีผลลดดาเมจตามขนาด'], bSpeedRate: ['ability', 50, 'ความเร็วเดิน', 1], bSpeedAddRate: ['ability', 50, 'ความเร็วเดิน', 1],
  bIntravision: ['ability', 51, 'มองเห็นคนซ่อนตัว'], bUnbreakableWeapon: ['ability', 52, 'อาวุธไม่แตก'], bUnbreakableArmor: ['ability', 52, 'เกราะไม่แตก'],
  bAtkEle: ['combat', 19, 'ธาตุการโจมตี'], bDefEle: ['combat', 19.5, 'ธาตุเกราะ'], bArrowEle: ['combat', 19, 'ธาตุลูกธนู/กระสุน'],
};
// two-argument bonuses: name -> [category, order, text(arg), percent?]
const B2 = {
  bAddRace: ['race', 60, (a) => `Damage กายภาพต่อเผ่า ${arg(a)}`, 1], bMagicAddRace: ['race', 61, (a) => `Damage เวทต่อเผ่า ${arg(a)}`, 1],
  bSubRace: ['race', 62, (a) => `ลด Damage จากเผ่า ${arg(a)}`, 1], bAddEle: ['race', 63, (a) => `Damage กายภาพต่อธาตุ ${arg(a)}`, 1],
  bMagicAddEle: ['race', 64, (a) => `Damage เวทต่อธาตุ ${arg(a)}`, 1], bSubEle: ['race', 65, (a) => `ลด Damage จากธาตุ ${arg(a)}`, 1],
  bAddSize: ['race', 66, (a) => `Damage กายภาพต่อขนาด ${arg(a)}`, 1], bMagicAddSize: ['race', 67, (a) => `Damage เวทต่อขนาด ${arg(a)}`, 1],
  bSubSize: ['race', 68, (a) => `ลด Damage จากขนาด ${arg(a)}`, 1], bAddClass: ['race', 69, (a) => `Damage กายภาพต่อ ${arg(a)}`, 1],
  bMagicAddClass: ['race', 70, (a) => `Damage เวทต่อ ${arg(a)}`, 1], bSubClass: ['race', 71, (a) => `ลด Damage จาก ${arg(a)}`, 1],
  bMagicAtkEle: ['race', 72, (a) => `Damage เวทธาตุ ${arg(a)}`, 1], bSubDefEle: ['race', 73, (a) => `ลด Damage จากศัตรูธาตุ ${arg(a)}`, 1],
  bIgnoreDefRaceRate: ['race', 74, (a) => `เพิกเฉย DEF เผ่า ${arg(a)}`, 1], bIgnoreMdefRaceRate: ['race', 75, (a) => `เพิกเฉย MDEF เผ่า ${arg(a)}`, 1],
  bIgnoreDefClassRate: ['race', 76, (a) => `เพิกเฉย DEF ${arg(a)}`, 1], bIgnoreMdefClassRate: ['race', 77, (a) => `เพิกเฉย MDEF ${arg(a)}`, 1],
  bIgnoreResRaceRate: ['race', 78, (a) => `เพิกเฉย RES เผ่า ${arg(a)}`, 1], bIgnoreMresRaceRate: ['race', 79, (a) => `เพิกเฉย MRES เผ่า ${arg(a)}`, 1],
  bCriticalAddRace: ['race', 80, (a) => `CRI ต่อเผ่า ${arg(a)}`], bAddRace2: ['race', 81, (a) => `Damage ต่อกลุ่ม ${arg(a)}`, 1],
  bWeaponDamageRate: ['combat', 39.5, (a) => `Damage อาวุธ ${arg(a)}`, 1],
  bSkillAtk: ['ability', 55, (a, db) => `Damage สกิล ${skill(a, db)}`, 1], bSkillCooldown: ['ability', 56, (a, db) => `คูลดาวน์ ${skill(a, db)} (ms)`],
  bVariableCastrate: ['ability', 57, (a, db) => `ร่ายแปรผัน ${skill(a, db)}`, 1], bFixedCastrate: ['ability', 57.5, (a, db) => `ร่ายคงที่ ${skill(a, db)}`, 1],
  bSkillFixedCast: ['ability', 57.6, (a, db) => `ร่ายคงที่ ${skill(a, db)} (ms)`], bSkillVariableCast: ['ability', 57.7, (a, db) => `ร่ายแปรผัน ${skill(a, db)} (ms)`],
  bSkillDelay: ['ability', 57.8, (a, db) => `ดีเลย์ ${skill(a, db)} (ms)`], bSkillUseSP: ['ability', 58, (a, db) => `SP ที่ใช้ ${skill(a, db)}`],
  bSkillUseSPrate: ['ability', 58.5, (a, db) => `SP ที่ใช้ ${skill(a, db)}`, 1], bSubSkill: ['race', 82, (a, db) => `ลด Damage จาก ${skill(a, db)}`, 1],
  bResEff: ['ability', 59, (a) => `ต้านทาน ${arg(a).replace(/^Eff /, '')}`, 2],
};
const skill = (a, db) => db?.skills?.names?.[a]?.[0] || a;

export function categoryOf(key) {
  const name = key.split(':')[0];
  if (B[name]) return B[name][0];
  if (B2[name]) return B2[name][0];
  return 'ability';
}

/** { v, text, order } for one entry of equip.totals, or null to hide it */
export function labelOf(key, value, db) {
  const [name, a, b] = key.split(':');
  if (b === 'list' || Array.isArray(value)) {
    if (/AutoSpell/.test(name)) return { v: '', order: 90, text: `Autospell ${skill(a, db)} (${value.length})` };
    return { v: '', order: 99, text: `${name} ${a ?? ''}` };
  }
  if (typeof value !== 'number') return value ? { v: '', order: 95, text: name.replace(/^b/, '') } : null;
  if (!value && !B[name]?.[2]?.startsWith('ไม่')) return null;
  const sign = (pct) => `${value > 0 ? '+' : ''}${value}${pct === 1 ? '%' : pct === 2 ? '%' : ''}`;
  if (B[name] && a === undefined) {
    const [, order, text, pct] = B[name];
    if (/^b(Atk|Def|Arrow)Ele$/.test(name)) return { v: '', order, text: `${text}: ${['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Dark', 'Ghost', 'Undead'][value] ?? value}` };
    if (['bNoSizeFix', 'bIntravision', 'bUnbreakableWeapon', 'bUnbreakableArmor'].includes(name)) return { v: '✓', order, text };
    return { v: sign(pct), order, text };
  }
  if (B2[name]) {
    const [, order, fn, pct] = B2[name];
    return { v: pct === 2 ? `${value > 0 ? '+' : ''}${value / 100}%` : sign(pct), order, text: fn(a, db) };
  }
  return { v: sign(0), order: 98, text: `${name.replace(/^b/, '')}${a ? ' ' + arg(a) : ''}` };
}

// ------------------------------------------------------------------ random options ("ออฟ")
const opt = (name, script, extra = {}) => ({ name, script, label: (o) => `${name}${o.a ? ' ' + arg(o.a) : ''} ${o.v > 0 ? '+' : ''}${o.v}`, ...extra });
export const OPTIONS = {
  atk: opt('ATK', (o) => `bonus bAtk,${o.v};`), atkRate: opt('ATK %', (o) => `bonus bAtkRate,${o.v};`),
  matk: opt('MATK', (o) => `bonus bMatk,${o.v};`), matkRate: opt('MATK %', (o) => `bonus bMatkRate,${o.v};`),
  str: opt('STR', (o) => `bonus bStr,${o.v};`), agi: opt('AGI', (o) => `bonus bAgi,${o.v};`), vit: opt('VIT', (o) => `bonus bVit,${o.v};`),
  int: opt('INT', (o) => `bonus bInt,${o.v};`), dex: opt('DEX', (o) => `bonus bDex,${o.v};`), luk: opt('LUK', (o) => `bonus bLuk,${o.v};`),
  allStats: opt('All Stats', (o) => `bonus bAllStats,${o.v};`),
  pow: opt('POW', (o) => `bonus bPow,${o.v};`), sta: opt('STA', (o) => `bonus bSta,${o.v};`), wis: opt('WIS', (o) => `bonus bWis,${o.v};`),
  spl: opt('SPL', (o) => `bonus bSpl,${o.v};`), con: opt('CON', (o) => `bonus bCon,${o.v};`), crt: opt('CRT', (o) => `bonus bCrt,${o.v};`),
  patk: opt('P.ATK', (o) => `bonus bPAtk,${o.v};`), smatk: opt('S.MATK', (o) => `bonus bSMatk,${o.v};`),
  maxhp: opt('MaxHP', (o) => `bonus bMaxHP,${o.v};`), maxhpRate: opt('MaxHP %', (o) => `bonus bMaxHPrate,${o.v};`),
  maxsp: opt('MaxSP', (o) => `bonus bMaxSP,${o.v};`), maxspRate: opt('MaxSP %', (o) => `bonus bMaxSPrate,${o.v};`),
  hit: opt('HIT', (o) => `bonus bHit,${o.v};`), flee: opt('FLEE', (o) => `bonus bFlee,${o.v};`), cri: opt('CRI', (o) => `bonus bCritical,${o.v};`),
  def: opt('DEF', (o) => `bonus bDef,${o.v};`), mdef: opt('MDEF', (o) => `bonus bMdef,${o.v};`),
  aspd: opt('ASPD', (o) => `bonus bAspd,${o.v};`), aspdRate: opt('ASPD %', (o) => `bonus bAspdRate,${o.v};`),
  delay: opt('ลด Delay หลังใช้สกิล %', (o) => `bonus bDelayrate,${-Math.abs(o.v)};`),
  vct: opt('ลดร่ายแปรผัน %', (o) => `bonus bVariableCastrate,${-Math.abs(o.v)};`),
  critDmg: opt('Damage คริติคอล %', (o) => `bonus bCritAtkRate,${o.v};`),
  shortDmg: opt('Damage ระยะใกล้ %', (o) => `bonus bShortAtkRate,${o.v};`), longDmg: opt('Damage ระยะไกล %', (o) => `bonus bLongAtkRate,${o.v};`),
  addRace: opt('Damage กายภาพต่อเผ่า %', (o) => `bonus2 bAddRace,${o.a},${o.v};`, { arg: 'race' }),
  magicRace: opt('Damage เวทต่อเผ่า %', (o) => `bonus2 bMagicAddRace,${o.a},${o.v};`, { arg: 'race' }),
  addEle: opt('Damage กายภาพต่อธาตุ %', (o) => `bonus2 bAddEle,${o.a},${o.v};`, { arg: 'ele' }),
  magicEle: opt('Damage เวทต่อธาตุ %', (o) => `bonus2 bMagicAddEle,${o.a},${o.v};`, { arg: 'ele' }),
  magicAtkEle: opt('Damage เวทธาตุ (สกิลธาตุ) %', (o) => `bonus2 bMagicAtkEle,${o.a},${o.v};`, { arg: 'ele' }),
  addSize: opt('Damage กายภาพต่อขนาด %', (o) => `bonus2 bAddSize,${o.a},${o.v};`, { arg: 'size' }),
  magicSize: opt('Damage เวทต่อขนาด %', (o) => `bonus2 bMagicAddSize,${o.a},${o.v};`, { arg: 'size' }),
  boss: opt('Damage กายภาพต่อ Boss %', (o) => `bonus2 bAddClass,Class_Boss,${o.v};`),
  normal: opt('Damage กายภาพต่อมอนทั่วไป %', (o) => `bonus2 bAddClass,Class_Normal,${o.v};`),
  ignDef: opt('เพิกเฉย DEF เผ่า %', (o) => `bonus2 bIgnoreDefRaceRate,${o.a},${o.v};`, { arg: 'race' }),
  ignMdef: opt('เพิกเฉย MDEF เผ่า %', (o) => `bonus2 bIgnoreMdefRaceRate,${o.a},${o.v};`, { arg: 'race' }),
  subRace: opt('ลด Damage จากเผ่า %', (o) => `bonus2 bSubRace,${o.a},${o.v};`, { arg: 'race' }),
  subEle: opt('ลด Damage จากธาตุ %', (o) => `bonus2 bSubEle,${o.a},${o.v};`, { arg: 'ele' }),
};
export function optionScript(o) {
  const d = OPTIONS[o?.k];
  if (!d || !Number.isFinite(o.v) || !o.v) return null;
  if (d.arg && !o.a) return null;
  return d.script(o);
}
