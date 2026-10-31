# V66 cooperative combat slice (not production-deployed)

Built on merged PR #22. This is **not** a fully shared survival/city/story simulation.

## Implemented

- Protocol `coop: 2` advertises server-owned inventory. Existing v1 servers remain on the legacy client path.
- Every newly created survivor receives a fixed cooperative kit (hammer, pipe, pistol, 12 pistol rounds, 2 medkits). Solo inventories are never uploaded/imported.
- Weapon ownership, range, damage, cooldown and gun ammunition are validated by the shared server simulation using the item catalog. Invalid attacks never consume ammunition. One confirmed enemy death produces one shared drop.
- A green starting supply crate and green defeated-enemy drops have server-owned positions and contents. Interaction claims the whole container atomically. Client coordinates cannot invent or relocate loot.
- Desktop interaction and the existing mobile interact control use the same authoritative claim. The ordinary inventory equips weapons and uses server-validated medical supplies.
- Player health, inventory, position, command sequence, shared enemies and claimed loot survive disconnect and cold D1 recovery. After the grace period only the live session expires, not its survivor. At most 4 players may be online; at most 64 survivor identities may be retained in a room to bound storage growth. New identities beyond that require a new room.
- Existing solo save guards remain intact. Multiplayer attacks do not enter the solo combat/ammo path on v2 servers; ordinary local city container interactions are disabled on v2.

## Verification boundary

Unit coverage includes ownership, weapon damage/ammo, cooldown, double-kill protection, fabricated and prototype-key loot, remote loot coordinates, contested claims, medical items, delta replication, cold recovery and active-player capacity. The branch workflow uses only a disposable local Wrangler Worker and local D1, with desktop/mobile Chromium clients and screenshots. No production API is needed for that workflow.

## Not implemented / not claimed

Shared city containers, story, missions, time, occupation, shelter, vehicles and collision/line-of-sight authority remain future work. The current movement validator and enemy simulation retain prototype limitations. This slice does not implement magazines/reloading, shared food/thirst progression, revives, account login, retention administration or abuse-resistant public hosting. No FPV changes are included. Anonymous token loss means a new identity, not recovery of the old survivor.

No new dependencies or schema migrations. No production Worker deployment, production D1 writes/migrations, R2 or paid plan changes are authorized by this branch. `server/wrangler.toml` retains its local placeholder and must not be blindly deployed. Review and approve deployment separately before exposing v2 on the public service.

## Low-quality rendering trial

This experimental trial uses a 0.5 pixel-ratio cap for low quality, disables MSAA and dynamic shadow-map rendering, and leaves CSS HUD/text resolution unchanged. Game imagery is visibly less sharp. Medium/high retain the previous rendering settings; select one and reload to restore shadows and antialiasing. This only changes rendering cost, not simulation steps, enemies, health, collisions, movement validation, networking or storage. No FPV-specific code is modified.

This is a measured-candidate change, not a performance claim: before it, the two-client Actions software-WebGL natural-route job measured about 0.46 RAF/s and failed its unchanged 180-second route. The additional reconnect-near-door diagnostic measured about 0.22 RAF/s; real phone loot and door opening passed but both survivors subsequently died before the remaining closure. Both original failures and the full natural-route check are retained. Fresh same-route timing, complete gameplay and image review are required before release; viewport/touch emulation is not physical-phone performance evidence.
