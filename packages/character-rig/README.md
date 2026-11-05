# @lijiabao/character-rig

Shared kit for the 白面人 (faceless mannequin) characters used by **DefendTaipei-Lab** (the baseline, this repo) and **魔都生存 / shanghaisurvival**.

## What is in it (v0.2.0)

- `fabric.ts`: procedural garment fabrics (`Fabric`, `fabricMat`). Falls back to plain materials when there is no DOM, for Node checks.
- `kit.ts`: mannequin materials (`matS`, `matC`, `SKIN`), `Parts` (per-joint geometry merged into one mesh per joint and material, LOD-detail tagging, optional `lite` single-material mode), joint/primitive helpers (`jt`, `lathe`, `cyl`, `sph`, `box`, `cap`) and the garment fabric picker (`pickFabrics`, `bluish`).

- `motion.ts` (v0.2.0): easing (`sm`, `eo`, `ei`, `cl01`), the pose keys (`KEYS`, `Pose`, `zero`), the spring solver that writes joint rotations (`applySprings`), motion signals (`trackMotion`: yaw rate, acceleration), the stride-locked base gait (`baseGait`: legs, hip sway, breathing, turn lean, momentum lean, counter arm swing; optional `strideScale`) and the shared proportions (`bodyDims`: thigh/shin length, hip height).

Each game keeps its own wardrobe/gear geometry in `makeRig` and its own action layers in `animate` (Taipei: guns, recoil, soldiers; Shanghai: its own extras), calling `trackMotion` → `baseGait` → its layers → `applySprings`.

## Rules

- Taipei is the baseline. Change the kit here first, then sync it to Shanghai.
- Game-specific details (Shanghai hair, occupation gear, crowd clones, shamble; Taipei guns and soldiers) stay in the games, not in this package.
- Shanghai keeps a byte-identical vendored copy in `web/vendor/character-rig/`. Its `tools/sync-character-rig.mjs` refreshes the copy, and `tools/test-character-rig-sync.mjs` fails CI if the copy is hand-edited.

## Next steps

1. Move the joint hierarchy itself (joint offsets for spine/chest/neck/arms/legs) into a `buildSkeleton`, leaving garment geometry per game.
2. Move shared action layers that are still identical in both games (sneak crouch, loot, hurt, death pose) once they stop diverging.
