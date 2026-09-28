---
type: design
category: gameplay-systems
status: unbuilt
resolution: vague
related: [weapons, soldier-progression, missions, campaign-pacing]
---

# Items

What a soldier carries into a mission, where it comes from, and what it costs to lose.

## Loadout

Every soldier has five slots. The slot limit is the only limit — there is no weight.

| Slot | Holds | Count |
|---|---|---|
| Primary | Any weapon | 1 |
| Secondary | Any weapon | 1 |
| Utility | Grenades, stimpacks, health kits | 2 |
| Rig | One jet pack **or** one drone | 1 |

- A soldier with an empty slot deploys with it empty. Nothing is issued for free beyond the recruit's starting weapons.
- Loadouts are set per soldier on the deploy screen and persist between missions until changed.

## Item kinds

| Kind | Slot | Lifetime | Built in |
|---|---|---|---|
| Weapon | Primary / Secondary | Permanent | Engineering |
| Grenade | Utility | Consumable — charges | Engineering |
| Stimpack | Utility | Consumable — charges | Engineering |
| Health kit | Utility | Consumable — charges | Engineering |
| Jet pack | Rig | Permanent, destructible | Robotics |
| Drone | Rig | Permanent, destructible | Robotics |

**Consumables** are carried as a stack in one utility slot (e.g. 3 frag grenades). Charges used in a mission are gone. Unused charges return to base stock on extraction.

**Permanent items** stay with the base until destroyed or lost with a soldier.

## Grenades

A thrown projectile built from the weapon effect vocabulary (`design/weapons.md`) — a grenade is a weapon with one shot and an arc.

| Rule | |
|---|---|
| Throw | Held button to set distance, release to throw; always arcs |
| Fuse | Detonates on a timer, not on contact — it bounces and rolls |
| Effects | Any combination from the vocabulary: frag = explode, incendiary = explode + burn, cryo = explode + slow, concussion = knockback |
| Aim | The soldier's Aim stat tightens the landing spread, as it does for guns |
| Friendly fire | Always on. A grenade does not know whose it is |

## Stimpacks

A short, sharp boost followed by a cost.

| Phase | Effect |
|---|---|
| Boost (8s) | +30% move speed, faster reload, reduced spread |
| Crash (6s) | −20% move speed, increased spread |

- Self only. Instant to use.
- Stacking a second stim during a crash is allowed and deals damage to the user.

## Health kits

Healing that costs time and exposure.

| Rule | |
|---|---|
| Use | Channeled: 2s of standing still, then heals a fixed amount |
| Target | Self, or a squadmate within touching distance |
| Interrupt | Moving, firing, or taking damage cancels the channel; the charge is not spent |
| Limit | Heals only. A dead soldier stays dead — there is no revive, in keeping with permadeath |

## Jet pack

Vertical movement bought with fuel and noise.

| Rule | |
|---|---|
| Thrust | Hold jump in the air to thrust upward; steer horizontally |
| Fuel | A meter that drains while thrusting and refills only while standing on ground |
| Firing | Allowed while airborne, with a spread penalty |
| Noise | Thrusting is loud; enemies that hear it turn toward the source |
| Damage | Has its own hit points. Destroyed = fuel gone for the rest of the mission and the pack is lost |

## Drones

A small companion that belongs to one soldier.

| Rule | |
|---|---|
| Position | Hovers near its owner; follows through the level |
| Role | Each drone has one job, fixed when built — attack (fires at the owner's target), shield (absorbs shots from one side), scout (reveals enemies ahead), or medic (slow heal on its owner) |
| Built from | The same effect vocabulary and cost budget as weapons |
| Damage | Targetable and destructible. A destroyed drone is gone for good |
| Owner dies | The drone drops where it hovers and can be recovered |

## Loss

Permadeath extends to what the soldier carried.

| Event | What happens to the items |
|---|---|
| Soldier dies | Everything they carried drops at the body |
| A squadmate reaches the body | They pick up the lot, overflow ignored — it fills their empty slots first, then is carried as salvage |
| Squad extracts | Salvage returns to base stock; anything left on the map is lost |
| Squad wiped | Everything deployed is lost |

## Where items come from

| Source | Rule |
|---|---|
| Engineering | Weapons and utility items. Costs resources and days |
| Robotics | Jet packs and drones. Costs resources and days |
| Commissioned items | Described in plain language to the room's NPC, authored against the cost budget, then built like any other item |
| Mission loot | Occasional consumables and salvaged enemy parts |

Every item has a cost against its tech tier's budget, as weapons do. A more capable item is a more expensive one, never a free upgrade.

## Squadmates

AI-controlled soldiers use their own items.

| Item | When a squadmate uses it |
|---|---|
| Grenade | Two or more enemies clustered, none of its squad in the blast |
| Stimpack | Never on its own initiative |
| Health kit | Below half health with no enemy in line of sight; heals an adjacent squadmate first if they are lower |
| Jet pack | When the route needs it to reach the player |
| Drone | Always active |

## Controls

| Action | Default |
|---|---|
| Utility 1 | Q |
| Utility 2 | E |
| Rig ability | Jump in the air (jet pack) / F (drone command, if the drone has one) |
