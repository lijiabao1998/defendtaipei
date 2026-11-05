# @lijiabao/character-rig

Shared kit for the 白面人 (faceless mannequin) characters used by **DefendTaipei-Lab** (the baseline, this repo) and **魔都生存 / shanghaisurvival**.

## What is in it (v0.1.0, first slice)

- `fabric.ts`: procedural garment fabrics (`Fabric`, `fabricMat`). Falls back to plain materials when there is no DOM, for Node checks.
- `kit.ts`: mannequin materials (`matS`, `matC`, `SKIN`), `Parts` (per-joint geometry merged into one mesh per joint and material, LOD-detail tagging, optional `lite` single-material mode), joint/primitive helpers (`jt`, `lathe`, `cyl`, `sph`, `box`, `cap`) and the garment fabric picker (`pickFabrics`, `bluish`).

Each game keeps its own `makeRig` body/wardrobe and `animate` gait and imports the kit from here.

## Rules

- Taipei is the baseline. Change the kit here first, then sync it to Shanghai.
- Game-specific details (Shanghai hair, occupation gear, crowd clones, shamble; Taipei guns and soldiers) stay in the games, not in this package.
- Shanghai keeps a byte-identical vendored copy in `web/vendor/character-rig/`. Its `tools/sync-character-rig.mjs` refreshes the copy, and `tools/test-character-rig-sync.mjs` fails CI if the copy is hand-edited.

## Next steps

1. Move the shared skeleton (joint hierarchy and proportions) out of `makeRig`.
2. Move the gait core (stride-locked walk/run, springs, lean) out of `animate`, with per-game overlay hooks.
