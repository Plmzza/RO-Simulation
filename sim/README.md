# RO Simulator (`/sim/`)

One page with the six systems of the planned UI, using the calculator engine in `../calc` and the data in `../data`:

1. **Skill** – skill tree of the selected job by tab (Novice → 1st → 2nd (+ trans) → 3rd → 4th), laid out by prerequisite
   depth. Skill points per tab: earlier tabs use that job's max Job Lv − 1, the current job uses Job Lv − 1. Like the game,
   a skill can only be raised when its prerequisites (and job level) are met and the tab has points; a skill cannot be
   lowered while another learned skill needs it. Click a skill for its details (`data/skillinfo.json`, built by
   `tools/build_skill_info.py` from skill_db): type, element, range, area, weapons, items, prerequisites, per-level SP /
   cast / fixed cast / delay / cooldown / duration, this character's real cast time, and its damage on the selected monster.
   Learned skills feed passives, self buffs and the damage skill list.
2. **Status** – base stats (+ job bonus and equipment shown as `+n`), cost of the next point, Advanced Status (traits) for 4th jobs.
3. **Equipment** – General and Special / Shadow (shadow gear + costumes) tabs; click a slot to wear an item from the inventory.
4. **Equipment Status** – totals of every equipment bonus by All / Status / Ability / Combat / Race (`labels.js`).
5. **Inventory** – Consume (buff items to toggle, "ในเกม" = only items in the GGT client) and Equipment (crafted items:
   wear, edit, duplicate, delete; up to 100).
6. **Equipment Craft** – pick an item, refine, grade, cards (only cards for that slot), enchants and random options ("ออฟ").

Plus buffs (own skills / from others / monster debuffs) and a Damage panel (you → monster, monster → you, calculation steps).

Everything is saved in the browser (`localStorage`, key `ro-sim-v1`); Export / Import writes and reads the same JSON.
Needs to be served over HTTP (ES modules + fetch), e.g. the preview server or GitHub Pages.

## Credits

- Formulas, item, skill and enchant data: [rAthena](https://github.com/rathena/rathena) (GPL-3.0), from the server's own files.
- Skill tree positions and 29 newer skill icons: [Divine Pride](https://www.divine-pride.net).
- Font: [MiSans](https://hyperos.mi.com/font/) (Latin + Thai) by Xiaomi, free licence.
- Item icons and descriptions: the GGT (Thai) Ragnarok Online client. Ragnarok Online © Gravity Co., Ltd.
- GGT enchant tables: ro.gnjoy.in.th event and enchant pages.
