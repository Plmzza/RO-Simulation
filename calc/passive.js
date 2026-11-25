/**
 * Passive skill bonuses that rAthena adds in status_calc_pc (src/map/status.cpp, RENEWAL), written as the item bonuses
 * they amount to. Masteries that add ATK, HP/SP and ASPD passives are handled elsewhere (damage.js mastery(),
 * status_get_hpbonus / status_calc_aspd via calc/sc.js, status.js).
 *
 *   passiveBonuses({ skills, weapon, shield, mapid, jobLv }) -> { stats: { dex: 10 }, script: 'bonus bHit,20; ...' }
 */

const GUN = ['Revolver', 'Rifle', 'Gatling', 'Shotgun', 'Grenade'];
/** per-size tables used by DK_TWOHANDDEF / MT_TWOAXEDEF / CD_MACE_BOOK_M / ABC_DAGGER_AND_BOW_M / ABC_MAGIC_SWORD_M */
const SIZE_TABLE_A = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 3, 5, 6, 8, 9, 11, 12, 14, 15], [3, 5, 7, 9, 10, 12, 13, 15, 16, 18]];
const SIZE_TABLE_B = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 3, 5, 6, 8, 9, 11, 12, 14, 15], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]];
const SIZE_TABLE_C = [[2, 3, 5, 6, 8, 9, 11, 12, 14, 15], [2, 3, 5, 6, 8, 9, 11, 12, 14, 15], [2, 3, 5, 6, 8, 9, 11, 12, 14, 15]];
const SIZES = ['Size_Small', 'Size_Medium', 'Size_Large'];

export function passiveBonuses({ skills = {}, weapon = 'Fist', shield = false, mapid = 0, jobLv = 1, superNoviceNoDeath = true }) {
  const lv = (n) => skills[n] || 0;
  const stats = {};
  const out = [];
  const b = (s) => out.push(s);
  const add = (k, v) => { stats[k] = (stats[k] || 0) + v; };

  // Super Novice that never died, job level 70+ (or expanded): all stats +10
  if ((mapid & 0x0FFF) === 0x100 && (jobLv >= 70 || (mapid & 0x1000)) && superNoviceNoDeath) {
    ['str', 'agi', 'vit', 'int', 'dex', 'luk'].forEach((k) => add(k, 10));
  }
  // stats
  if (lv('BS_HILTBINDING')) add('str', 1);
  if (lv('SA_DRAGONOLOGY')) add('int', Math.trunc((lv('SA_DRAGONOLOGY') + 1) / 2));
  if (lv('AC_OWL')) add('dex', lv('AC_OWL'));
  if (lv('RA_RESEARCHTRAP')) add('int', lv('RA_RESEARCHTRAP'));
  if (lv('SU_POWEROFLAND')) add('int', 20);
  if (lv('NW_GRENADE_MASTERY')) add('con', lv('NW_GRENADE_MASTERY'));
  if (lv('SOA_SOUL_MASTERY')) add('spl', lv('SOA_SOUL_MASTERY'));
  // critical (status value x10 -> bCritical in whole points)
  if (lv('SU_POWEROFLIFE')) b('bonus bCritical,20;');
  if (lv('DC_DANCINGLESSON')) b(`bonus bCritical,${lv('DC_DANCINGLESSON')};`);
  if (lv('PR_MACEMASTERY') && (weapon === 'Mace' || weapon === '2hMace')) b(`bonus bCritical,${lv('PR_MACEMASTERY')};`);
  if (lv('SHC_SHADOW_SENSE')) {
    if (weapon === 'Dagger') b(`bonus bCritical,${10 + 4 * lv('SHC_SHADOW_SENSE')};`);
    else if (weapon === 'Katar') b(`bonus bCritical,${5 + 2 * lv('SHC_SHADOW_SENSE')};`);
  }
  // hit
  if (GUN.includes(weapon)) {
    if (lv('GS_SINGLEACTION')) b(`bonus bHit,${2 * lv('GS_SINGLEACTION')};`);
    if (lv('GS_SNAKEEYE')) b(`bonus bHit,${lv('GS_SNAKEEYE')};`);
  }
  if (lv('NC_TRAININGAXE')) {
    if (weapon === '1hAxe' || weapon === '2hAxe') b(`bonus bHit,${3 * lv('NC_TRAININGAXE')};`);
    if (weapon === 'Mace' || weapon === '2hMace') b(`bonus bHit,${2 * lv('NC_TRAININGAXE')};`);
  }
  if (lv('SU_POWEROFLIFE')) b('bonus bHit,20;');
  if (lv('IG_SPEAR_SWORD_M') && ['1hSword', '1hSpear', '2hSpear'].includes(weapon)) b(`bonus bHit,${3 * lv('IG_SPEAR_SWORD_M')};`);
  if (lv('SKE_WAR_BOOK_MASTERY') && weapon === 'Book') b(`bonus bHit,${3 * lv('SKE_WAR_BOOK_MASTERY')};`);
  // flee
  if (lv('TF_MISS')) {
    const thief2 = (mapid & 0xFF) === 6 && (mapid & 0x300);           // 2nd job (or later) of the thief line
    b(`bonus bFlee,${lv('TF_MISS') * (thief2 ? 4 : 3)};`);
  }
  if (lv('MO_DODGE')) b(`bonus bFlee,${Math.trunc(lv('MO_DODGE') * 3 / 2)};`);
  if (lv('SU_POWEROFLIFE')) b('bonus bFlee,20;');
  if (lv('SHC_SHADOW_SENSE')) b(`bonus bFlee,${10 * lv('SHC_SHADOW_SENSE')};`);
  // traits
  if (lv('TR_STAGE_MANNER') && ['Bow', 'Musical', 'Whip'].includes(weapon)) {
    b(`bonus bPAtk,${3 * lv('TR_STAGE_MANNER')}; bonus bSMatk,${3 * lv('TR_STAGE_MANNER')};`);
  }
  if (lv('HN_SELFSTUDY_TATICS')) b(`bonus bPAtk,${lv('HN_SELFSTUDY_TATICS')};`);
  if (lv('HN_SELFSTUDY_SOCERY')) b(`bonus bSMatk,${lv('HN_SELFSTUDY_SOCERY')};`);
  if (lv('NW_P_F_I') && GUN.includes(weapon)) b(`bonus bPAtk,${lv('NW_P_F_I') + 2};`);
  if (lv('SOA_TALISMAN_MASTERY')) b(`bonus bSMatk,${lv('SOA_TALISMAN_MASTERY')};`);
  if (lv('SKE_WAR_BOOK_MASTERY') && weapon === 'Book') b(`bonus bPAtk,${lv('SKE_WAR_BOOK_MASTERY') + 2};`);
  if (lv('AG_TWOHANDSTAFF') && weapon === '2hStaff') b(`bonus bSMatk,${2 * lv('AG_TWOHANDSTAFF')};`);
  if (lv('SH_MYSTICAL_CREATURE_MASTERY')) {
    const v = Math.trunc(lv('SH_MYSTICAL_CREATURE_MASTERY') * 15 / 10);
    b(`bonus bSMatk,${v}; bonus bPAtk,${v};`);
  }
  if (lv('IG_SHIELD_MASTERY') && shield) b(`bonus bRes,${3 * lv('IG_SHIELD_MASTERY')};`);
  // race / element / size
  if (lv('CR_TRUST')) b(`bonus2 bSubEle,Ele_Holy,${5 * lv('CR_TRUST')};`);
  if (lv('BS_SKINTEMPER')) b(`bonus2 bSubEle,Ele_Neutral,${lv('BS_SKINTEMPER')}; bonus2 bSubEle,Ele_Fire,${5 * lv('BS_SKINTEMPER')};`);
  if (lv('SA_DRAGONOLOGY')) {
    const s = 4 * lv('SA_DRAGONOLOGY');
    b(`bonus2 bAddRace,RC_Dragon,${s}; bonus2 bMagicAddRace,RC_Dragon,${2 * lv('SA_DRAGONOLOGY')}; bonus2 bSubRace,RC_Dragon,${s};`);
  }
  if (lv('AB_EUCHARISTICA')) {
    const s = lv('AB_EUCHARISTICA');
    b(`bonus2 bAddRace,RC_Demon,${s}; bonus2 bAddEle,Ele_Dark,${s}; bonus2 bMagicAddRace,RC_Demon,${s}; bonus2 bMagicAddEle,Ele_Dark,${s}; `
      + `bonus2 bSubRace,RC_Demon,${s}; bonus2 bSubEle,Ele_Dark,${s};`);
  }
  const sizeBonus = (name, table, l) => SIZES.forEach((sz, i) => b(`bonus2 ${name},${sz},${table[i][l - 1]};`));
  if (lv('DK_TWOHANDDEF') && ['2hSword', '2hSpear', '2hAxe'].includes(weapon)) sizeBonus('bWeaponSubSize', SIZE_TABLE_A, lv('DK_TWOHANDDEF'));
  if (lv('IQ_WILL_OF_FAITH') && weapon === 'Knuckle') {
    const l = lv('IQ_WILL_OF_FAITH');
    b(`bonus2 bAddRace,RC_Undead,${l + 2}; bonus2 bAddRace,RC_Demon,${l + 2}; bonus2 bSubRace,RC_Undead,${l}; bonus2 bSubRace,RC_Demon,${l};`);
  }
  if (lv('CD_MACE_BOOK_M') && ['Mace', '2hMace', 'Book'].includes(weapon)) sizeBonus('bAddSize', SIZE_TABLE_A, lv('CD_MACE_BOOK_M'));
  if (lv('CD_FIDUS_ANIMUS')) b(`bonus2 bMagicAtkEle,Ele_Holy,${[1, 3, 4, 6, 7, 9, 10, 12, 13, 15][lv('CD_FIDUS_ANIMUS') - 1]};`);
  if (lv('MT_TWOAXEDEF') && weapon === '2hAxe') sizeBonus('bWeaponSubSize', SIZE_TABLE_A, lv('MT_TWOAXEDEF'));
  if (lv('ABC_DAGGER_AND_BOW_M') && ['Dagger', 'Bow'].includes(weapon)) sizeBonus('bAddSize', SIZE_TABLE_B, lv('ABC_DAGGER_AND_BOW_M'));
  if (lv('ABC_MAGIC_SWORD_M') && ['Dagger', '1hSword'].includes(weapon)) sizeBonus('bMagicAddSize', SIZE_TABLE_C, lv('ABC_MAGIC_SWORD_M'));
  if (lv('EM_MAGIC_BOOK_M') && weapon === 'Book') {
    for (const e of ['Water', 'Earth', 'Fire', 'Wind', 'Poison']) b(`bonus2 bMagicAtkEle,Ele_${e},${lv('EM_MAGIC_BOOK_M')};`);
  }
  return { stats, script: out.join('\n') };
}
