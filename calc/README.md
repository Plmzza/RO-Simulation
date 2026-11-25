# Calculation engine

Plain ES modules with no UI. Every calculator page can import them.

| File | What it does |
|---|---|
| `index.js` | Entry point: `loadAll()`, `calculateBuild()`, re-exports the helpers below |
| `status.js` | Renewal status formulas (HP/SP/AP, ATK/MATK, HIT, FLEE, CRIT, DEF/MDEF, ASPD, traits, cast) |
| `equip.js` | Equipment, card, enchant and set (combo) bonuses, refine and grade bonuses |
| `script.js` | Small interpreter for rAthena item scripts (`bonus`, `if`, `getrefine()`, `readparam()` ...) |
| `damage.js` | Renewal damage against a monster: basic attack, physical and magic skills, crit, hit rate, cast time, DPS |
| `cskill.js` | Runs C code taken from the server source (skill ratios, hit modifiers, status code) |
| `sc.js` | Status-change engine: starts buffs/debuffs and runs the server's `status_calc_*`, cast and damage status code |
| `buffs.js` | Buff / debuff / consumable lists and who can use them (job skill tree, equipment, weapon, item job checks) |

Data files live in `../data/`:

| File | Source |
|---|---|
| `status.json` | rAthena `job_stats`, `job_basepoints`, `job_exp`, `job_aspd`, `statpoint` |
| `items.json` | Item list and names from the RO GGT client; stats and scripts from rAthena `item_db` (weapons, armor, cards, shadow gear) |
| `combos.json` | rAthena `item_combos` (set bonuses) |
| `refine.json` | rAthena `refine` and `enchantgrade` |
| `constants.json` | Script constants and job class info from rAthena sources |
| `skills.json` | Attack skills (type, element, hits, range, cast/delay/cooldown, damage flags), their ratio code, and the skill tree per job |
| `mobs.json` | Monsters (level, HP, DEF/MDEF, RES/MRES, stats, race, element, size, class) |
| `battle.json` | Element table (`attr_fix`) and weapon size modifiers (`size_fix`) |
| `sc.json` | Status changes from the server source: `status_change_start` values, `status_calc_*`, ATK% / skill ratio / damage bonus / cast parts, buff and debuff skills (target type, party, weapons, values the skill passes) |
| `consumables.json` | Buff items (potions, food, scrolls, rune stones) from `item_db_usable` + `status.yml`, with job / class / level limits and script conditions |

All of it is built from the server repo (`Project-RO/server`: `db/re` + `db/import`, and `src/` for formulas), so custom
items, combos and monsters of the server are included. RO GGT items that rAthena does not have are added by
`tools/build_ggt_items.py`, which translates their Thai client descriptions into item scripts.

Rebuild them with the scripts in `../tools/` in this order (see the usage line at the top of each script):

1. `build_status_data.py` → `status.json`
2. `build_equip_data.py` → `items.json`, `combos.json`, `refine.json` (+ `ggt-only.json` work list)
3. `build_ggt_items.py` → adds GGT-only items/combos to `items.json` / `combos.json`, writes a report of untranslated lines
4. `build_script_constants.py` → `constants.json`
5. `build_skills_data.py` → `skills.json`
6. `build_battle_data.py` → `mobs.json`, `battle.json`
7. `build_consumables.py <server> <data> [items_all.json]` → `consumables.json` (buff items: `db/re/item_db_usable.yml` + `db/re/status.yml`)
8. `build_sc_data.py <server> <data>/sc.json` → `sc.json` (reads `src/map/status.cpp`, `battle.cpp`, `skill.cpp`, `skills/**`, `db/re/skill_db.yml`, `db/re/status.yml`)
9. `build_mob_skills.py <server> <data>/mobskills.json` → `mobskills.json` (`db/re/mob_skill_db.txt` + `db/import/mob_skill_db.txt`;
   optional – `loadAll` works without it)

## Usage

```js
import { loadAll, calculateBuild, itemsForSlot, SLOTS } from '../calc/index.js';

const db = await loadAll('../data/');

const result = calculateBuild(db, {
  jobId: 4054, trans: true,             // job id from data/status.json "jobs"; trans = transcendent 3rd
  baseLv: 200, jobLv: 70,
  base: { str: 120, agi: 90, vit: 100, int: 1, dex: 100, luk: 1 },
  bonus: { str: 0 },                     // optional manual extra stats
  traitBase: { pow: 0 },                 // 4th jobs only
  weapon: '2hSword',                     // used only when no weapon is equipped
  equipment: {                           // slot names: see SLOTS in equip.js
    weapon:  { id: 1599, refine: 10, grade: 0, cards: [4001], enchants: [] },
    armor:   { id: 2357, refine: 7 },
    headTop: { id: 5171 },
  },
  skills: { KN_TWOHANDQUICKEN: 10 },     // read by getskilllv() in item scripts
});

result.status.hp, result.status.atk, result.status.equipAtk, result.status.aspd ...
result.equip.bonuses   // [{ source: 'Valkyrian Shoes', slot: 'shoes', bonus: ['bMaxSP', 140] }, ...]
result.equip.totals    // { bMaxSP: 140, 'bAddRace:RC_Demon': 10, ... } for damage calculations later
result.equip.ignored   // script parts that are not evaluated (skills, effects)
result.equip.autobonus // procs found in scripts: { source, script, rate, duration, trigger }
```

Damage against a monster:

```js
import { calculateDamage } from '../calc/index.js';

const dmg = calculateDamage(db, result, {
  skill: 'RK_SONICWAVE', level: 10,    // skill: null = basic attack
  mobId: 21066,                         // id from data/mobs.json
  skills: { KN_TWOHANDQUICKEN: 10 },    // learned skills (masteries, pc_checkskill in skill ratios)
});
dmg.min, dmg.max, dmg.avg            // damage of one use (all hits)
dmg.crit                             // { min, max, avg } or null
dmg.hitRate, dmg.critRate            // %
dmg.cast                             // { castTime, delay, cooldown, cycle, perSecond } (ms)
dmg.dps                              // average damage per second (hit rate and crit included)
dmg.steps                            // [label, value] breakdown for the UI
dmg.unsupported                      // parts of the skill code that were not evaluated
```

Buffs, debuffs, time to kill, PvP and the monster's side:

```js
import { buffList, buffAvailability, consumableAvailability, debuffList, calculateDefense, autobonusUptime }
  from '../calc/index.js';

// Every buff skill of the server (205) + manual extras: [{ id, name, maxLv, kind: self|party|support|item, sc, effect }]
buffList(db);
// What this build can turn on: { available, maxLv, reason, note, fromJob, fromEquip, fromItems, castBy }
//   self    – own job skill tree, equipment that grants it (skill "ASC_EDP",5), or a usable item (rune stone, scroll)
//   party / support – anyone can receive it; weapon limits of the receiver are checked (Adrenaline Rush: axe / mace)
buffAvailability(db, build);
consumableAvailability(db, build);    // item_db Jobs / Classes / level + job conditions inside the item script

const buffed = calculateBuild(db, {
  ...input,
  buffs: { AL_BLESSING: 10, AL_INCAGI: 10, KN_TWOHANDQUICKEN: 10, FOOD_STR: 10, ASPD_POTION: 3 },
  consumables: [12202, 657, 12215],      // Steamed Tongue, Berserk Potion, Blessing scroll (ids from consumables.json)
  autobonus: 'on',                       // off (default) | 'on' | uptime 0..1
});
buffed.buffs.active          // { SC_BLESSING: { val1, val2, val3, val4, skill } } as the server would store them
buffed.consumables.replaced  // item ids that do nothing because a stronger item of the same kind is active
buffed.equip.grantedSkills   // { ASC_EDP: { lv: 5, source: 'Set: ...' } } from `skill "X",lv` in item scripts

const dmg = calculateDamage(db, buffed, {
  skill: 'SM_BASH', level: 10, mobId: 1002,
  debuffs: { SM_PROVOKE: 10, AL_CRUCIS: 10, PR_LEXAETERNA: 1 },   // debuffList(db): skill ids or SC names
});
dmg.chance   // { crit, perfectHit, hit, luckyDodge, land } in %: land = chance one attack connects
dmg.kill     // { hits, minHits, maxHits, attempts, seconds } to kill the monster (Lex Aeterna counted once)

// Monster -> you (basic attacks): its HIT vs your FLEE, your Perfect Dodge, damage taken after DEF/RES/cards
const def = calculateDefense(db, buffed, { mobId: 1002, attackers: 1 });
def.hitRate, def.perfectDodge, def.dodge, def.min, def.max, def.hitsToDie, def.secondsToDie
def.blocks      // statuses that soak whole hits: Kyrie (HP / hits), Safety Wall, Pneuma, Millennium Shield, Guard, Parry
def.reflect     // { percent, avg, magicChance } sent back to the monster: Reflect Shield, bShort/LongWeaponDamageReturn,
                // bMagicDamageReturn (chance). In PvP the attacker gets dmg.reflected the same way
def.mobSkills   // the monster's attack skills from mob_skill_db (skill, lv, state, rate %, cast, delay, condition)
// A monster skill: weapon skills use ATK × the skill's ratio, magic skills MATK (int + lv + Attack2 × 70~130 %) vs your
// MDEF / MRES; magic never misses. Own formulas: Dark Breath (% of your HP), Earthquake, Ice Mine / Flame Cross,
// Grand Darkness, Self Destruction (its HP), Killing Aura (10000), Smoking (3).
calculateDefense(db, buffed, { mobId: 1039, mobSkill: { skill: 'NPC_DARKSTRIKE', level: 10 } });

dmg.autospell   // [{ skill, level, chance, from, avg, expectedPerAttack }] – bAutoSpell on weapon attacks,
                // bAutoSpellOnSkill and status procs on basic attacks (Servant Weapon, Falling Star, Duple Light,
                // Abyss Force Weapon, Auto Firing Launcher; sphere procs capped by the sphere regen time);
                // the expected damage is added to dmg.dps

// PvP / GvG: the target is another build (its own buffs – Assumptio, Steel Body... – count as target statuses)
const pvp = calculateDamage(db, buffed, { skill: 'RK_SONICWAVE', level: 10, target: otherBuild, mode: 'gvg' }); // pvp | gvg | pk | bg

// Expected uptime of an autobonus (rate in 1/1000, duration ms, triggers per second)
autobonusUptime(70, 3000, dmg.cast ? dmg.cast.perSecond : buffed.status.hitsPerSec);
```

Hit chance follows `is_attack_hitting`: a critical always hits, then Perfect Hit (highest `bPerfectHitRate` +
`bPerfectHitAddRate`), then HIT − FLEE (5–100 %, after the skill's own `modifyHitRate`, e.g. Bash +5 %/lv).
Perfect Dodge (Lucky Dodge) only works against basic attacks and, with this server's `enable_perfect_flee: 1`,
only players have it — monsters never lucky-dodge.

`itemsForSlot(db.equip, 'weapon')` lists item ids that fit a slot; `itemsForSlot(db.equip, 'armor', { type: 'Card' })`
lists cards for a slot.

How buffs are computed: `calc/sc.js` runs the server code from `data/sc.json` – the `status_change_start` case of the
status (val1..val4), then `status_calc_str/agi/.../hit/flee/def/aspd...`, `status_get_hpbonus`, the ATK% / skill-ratio
part of `battle_calc_attack_skill_ratio`, `battle_attack_sc_bonus` (EDP, Unlimit...) and the status part of
`skill_vfcastfix`. Values a skill passes itself (Fighting Spirit from Rune Mastery, Clementia from Blessing level...)
come from the skill's own code; when someone else casts a party buff, that caster is assumed to have the related
skills maxed. Monster debuffs run the same status code on the monster.

The status part of `battle_calc_damage` (target statuses such as Raid, Dark Crow, Kaite, Assumptio, Steel Body,
Defender; caster statuses such as Poisoning Weapon and Breaking Limit) and of `battle_attr_fix` (Volcano / Deluge /
Violent Gale, Spider Web, the Insignias, Oratio, Venom Impress...) run on every damage result. Skill element
overrides (`modifyElement`: Genetic bombs, Dragon Breath with Dragonic Aura...), Soul Links (val2 = the link skill),
Enchant Blade's extra damage on basic attacks, Shield Chain's random bonus (average) and Happo Kunai's ammo ATK are
included.

## Not covered yet

- Kyrie's absorbed amount is only reported in `def.blocks`; autobonus can be counted 'on' or by uptime, not simulated per hit.
- Evil Land (heal-based) is not calculated; monster skills come from rAthena's `mob_skill_db.txt` – rerun
  `build_mob_skills.py` against the server repo if it has a custom one.
- Battleground rates use rAthena's `battleground.conf` defaults (the server repo here has no override).
- GGT-only item description lines that could not be translated (see the report from `build_ggt_items.py`, about 1,200
  lines, mostly combos with items the server does not have and per-skill "when worn with the weapon above" lines);
  add them by hand in `data/items-ggt-manual.json` (`{ "<item id>": { "script": "..." } }`).
