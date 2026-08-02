---
status: plan
tags: [ai, enemies, companions, movement, navigation]
---

# Agent navigation — pathing on platformed geometry

The design for Behavior-Lab **Slice 2**, the gap that doc names as dominant:
agents steer toward a point and hop crudely; they cannot decide *which platform
to get onto* or cross a multi-elevation level. Everything below is additive —
no existing spec changes behavior unless it opts in.

References: `docs/BEHAVIOR-LAB.md` (the roadmap this slots into),
`docs/LOCOMOTOR-REFACTOR.md` (the brain/locomotor seam this sits on),
`docs/smarter_enemy_ai_2d_action_shooter_platformer.md` §2 and ladder items 2–3,
`docs/LEVEL-GENERATION.md` (the geometry being navigated).

## Audit — what movement actually does today

The pipeline is `motionRequest()` (brain layer, `src/mission/enemyspec/
runtime.js`) → one MotionRequest → `locomotorFor(ent).apply()`
(`src/mission/locomotion.js`). Every vertical decision an agent can make lives
in two places:

| Path | Vertical behavior | Where |
|---|---|---|
| `chase` controller | `driveX { hopToward }` → legged locomotor hops when the target is >40px above and we're grounded | `controllerRequest` / `LEGGED.apply` |
| `{ jump: {} }` step | one impulse, if grounded | `execStep` → `locomotorFor(self).jump()` |
| `dash` step | a committed burst; the legged body takes the **horizontal component only** | `LEGGED` via `actuateHorizontal` |
| `moveTo` step / `moveTo` controller | `steer` → **horizontal only on a legged body. No hop, ever.** | `LEGGED.apply` |
| soldier locomotor | `steer`/`driveX` hop when the point is >60px above (`wantHop`) | `SOLDIER.apply` |
| flying locomotor | steers freely in x and y | `FLYING.apply` |

Two things fall out of that table.

**A real gap, not just a missing feature.** `{ moveTo: { target: "lastSeen" } }`
on a legged enemy walks *underneath* a perch forever — `steer` never hops for a
legged body, only `chase` does, and only on its 40px heuristic. The built-in
roster masks this: the only specs using `moveTo` toward the player
(`strafe_raider`, `sky_duelist`) are flyers, and `cowardly_duelist` gets by on
dashes. A legged spec that hunts `lastSeen` is broken today. Fixing this is
part of the slice, not a separate errand.

**Legged and soldier bodies disagree** about when a steering intent implies a
jump (40px vs 60px, different requests). Both heuristics exist because nothing
tells the locomotor "jump *now*, this is the takeoff point." That is the one
piece of vocabulary navigation needs from the locomotor layer.

Perception's spatial awareness is a single 8px probe:
`sense.groundAhead` = "is there floor under my front edge." No gap width, no
notion of what is above or reachable, no target-relative topology.

### What already exists and should be reused

`src/game/gen/reach.js` (`jumpEnvelope`) turns `{ gravity, jumpSpeed, runSpeed }`
into `maxRise`, `flatReach`, and `maxRunTo(dh)` — the horizontal distance you can
still cover while landing on a surface `dh` above takeoff. The level generator
already guarantees geometry against it.

`auditGeometry` in `src/game/gen/levelgen.js` already **builds this exact graph
and flood-fills it** — nodes are usable stand segments, links are jumps validated
through `env.maxRunTo` plus body-aware clearance. It is private, build-time, and
hardcoded to the soldier's envelope. The runtime graph is that function
generalized over an arbitrary body, so the two should end up as one
implementation. That is the cheapest correct starting point available, and it
means the generator and the AI can never disagree about what is reachable.

Geometry facts that shape the design:

- **Platforms are solid AABBs.** `collideAxis` blocks from every direction —
  you cannot jump up through a platform, and there is no drop-through. So the
  edge kinds are `walk`, `jump` (up or across), and `drop` (walk off and fall).
  A one-way-platform edge kind is not needed and should not be invented yet.
- **Generated levels have a continuous ground slab** spanning the world, so the
  graph is usually connected through the ground. The design must not *assume*
  that — `docs/CITY-TRAVERSAL-IDEAS.md` heads somewhere else — but it does mean
  the first useful capability is vertical (get onto and off perches), not
  long-range horizontal routing.
- **Bodies differ.** Enemies jump with `config.enemyJumpImpulse` (520) /
  `enemyHopImpulse` (560); the soldier uses `config.jumpSpeed`; `body.gravity`
  scales the world's gravity per spec (0 = flying, 2 = heavy). Envelopes are
  per-body, so the graph's *edges* are per-body even though its *nodes* are
  mostly geometry.

## Design

Four pieces, in dependency order.

### 1. The nav graph — `src/game/nav.js`

Game-side and pure (no DOM, no canvas, guarded like every other game module) so
both `src/game/gen/levelgen.js` and the mission runtime can import it.

```
buildNavGraph(platforms, world, body) → NavGraph
  body: { w, h, envelope }     // envelope from jumpEnvelope(); see below
```

**Nodes = stand segments.** A maximal horizontal span on a platform's top
surface where a body of width `w` fits and has `h` of headroom (nothing
overhanging within `h`). One platform yields several segments when something
sits on it or hangs over it.

```
Node = { id, plat, x0, x1, y }      // y = top surface; [x0,x1] = standable span
```

**Edges are directed**, carry a kind and a cost in **seconds** (estimated
traversal time, so path cost is directly comparable to anything else the brain
reasons about):

| Kind | Condition | Cost |
|---|---|---|
| `walk` | segments touch on the same surface | `dx / runSpeed` |
| `jump` | `dh = A.y − B.y > 0`, gap ≤ `env.maxRunTo(dh)`, B's landing span ≥ `w`, headroom over B ≥ `h`, takeoff clearance over A ≥ `dh + h` | `env.airtime + dx / runSpeed` |
| `hop` | `dh ≤ 0`, gap ≤ `env.flatReach`, landing span ≥ `w` | same |
| `drop` | B below A, horizontally within `flatReach` of A's edge, fall path clear of intervening platforms | `sqrt(2·dh/g) + dx / runSpeed` |

The takeoff-clearance term is deliberately approximate (it checks headroom at
the edge, not the whole parabola). Approximate is fine: a failed jump costs the
agent a repath, and the stuck detector in §3 catches the pathological case. Do
not build swept-parabola collision for this slice.

**All-pairs at build time.** Node counts are small — a generated level runs
~10–40 platforms, so ~15–60 nodes. Precompute the next-hop matrix
(Floyd–Warshall, ≤60³ ≈ 216k ops, once per body class per mission) and every
runtime query becomes an O(1) table lookup. This removes the whole question of
"how often may an agent repath" — it can repath every frame for free.

```
NavGraph = {
  nodes, edges,
  nodeAt(x, y) → Node | null,       // segment under a point, else null (airborne/off-graph)
  step(fromId, toId) → Edge | null, // next hop, O(1)
  cost(fromId, toId) → seconds | Infinity,
  hops(fromId, toId) → n | -1,
}
```

**Caching.** Graphs are keyed by body class —
`` `${w}x${h}:${round(maxRise)}:${round(flatReach)}` `` — and cached on the
scene. A mission with six enemy specs plus soldiers builds at most a handful,
each in well under a millisecond. Flying bodies (`body.gravity === 0`) are never
given a graph; they already move in two dimensions.

**Determinism.** Same platforms + same body → byte-identical graph. This is
testable as a golden fixture and matches how seeded generation is already
verified.

**Refactor `auditGeometry` onto it.** Once `buildNavGraph` exists, the
generator's audit becomes `buildNavGraph(platforms, world, soldierBody)` plus a
reachability query from the spawn segment. One flood-fill implementation, not
two, and the generator's guarantee and the AI's beliefs become the same fact.

### 2. Perception — new `sense.*` keys

Computed on the existing perception cadence in `src/mission/enemyspec/
perception.js` (0.2s, scaled by `config.labPerceptionScale`). Because
`exprCtx` resolves `sense.*` straight off `root.sense`, every key below is
usable in `when` / `score` expressions the moment it is written — no schema
change, no validator change, no new entry in `EXPR_FUNCTIONS`.

| Key | Meaning |
|---|---|
| `sense.node` | current node id, or −1 when airborne / off-graph |
| `sense.targetNode` | the hostile's node id, or −1 |
| `sense.onSameSurface` | `node === targetNode` (and both ≥ 0) |
| `sense.pathHops` | hops to the target's node; 0 = same surface, −1 = no path |
| `sense.pathCost` | estimated seconds to reach it; `99999` when unreachable |
| `sense.nextEdge` | kind of the first hop: `"walk"` / `"jump"` / `"hop"` / `"drop"` / `""` |
| `sense.targetAbove` | target's node is higher than mine (topology, not the existing 40px `playerAbove` band) |
| `sense.gapAhead` | width in px of the gap in front of me; 0 = solid ground |
| `sense.ledgeAhead` | `gapAhead > env.flatReach` — a gap I cannot clear |

`sense.groundAhead` stays as-is; `gapAhead` is the graded version, and existing
specs keep working untouched.

These are worth landing on their own, before any movement changes: they make the
Behavior Lab's inspector show what an agent *knows* about the level, and a spec
can gate on `sense.pathHops` / `sense.onSameSurface` while still moving the old
way.

### 3. Movement — `navigate` controller and `navigateTo` step

New vocabulary in `src/game/enemyspec/schema.js`:

```
MOTIONS.navigate = { target: "player", speed: 160 }
ACTIONS.navigateTo = { blocking: true }
  // { navigateTo: { target|at:[x,y], speed?, timeout? } }
```

Both resolve their goal exactly like `moveTo` does (`resolveTargetPoint`, so
`"player" | "parent" | "spawn" | "anchor" | "lastSeen" | at:[x,y]` and the
`offset` form all work unchanged), then run the same loop in the brain layer:

```
goal point → goal node (nodeAt, else nearest node below the point)
my node    → graph.step(myNode, goalNode) → the next edge
edge       → a waypoint (the takeoff point on my current segment)
waypoint   → a MotionRequest
```

The requests are the ones that already exist, with **one addition**: `driveX`
gains an explicit `hop: true` flag meaning "the brain says jump now." Today both
grounded locomotors guess from `hopToward`'s height (40px legged / 60px
soldier); with a graph, the brain knows the takeoff point, so the guess is
replaced by an instruction. `hopToward` stays for `chase` and the legacy
heuristic. That is the whole locomotor change:

| Edge kind | Request |
|---|---|
| `walk` | `driveX { v }` toward the waypoint |
| `jump` / `hop` | `driveX { v, hop: true }` once within a takeoff window of the edge; `driveX { v }` while closing on it |
| `drop` | `driveX { v }` off the edge — no jump |
| none (same node) | `driveX`/`stop` toward the goal point, i.e. exactly `moveTo` |

**Fallback discipline** (CLAUDE.md: the game must stay playable at every step).
Any of — no graph, agent off-graph (airborne, mid-dash, on a moving thing),
goal off-graph, no path, `config.navEnabled` off — degrades to today's `steer`
behavior. Navigation is strictly an improvement path; its failure mode is
current behavior.

**Stuck detector.** Track the agent's node and its distance to the current
waypoint on the perception cadence. If neither improves for `config.navStuckTime`
(default ~1.5s), fall back to direct steering for a cooldown and set
`root.navStuck` — which the Behavior Lab draws and, later, the metrics panel
counts. This is the honest answer to approximate edge validation: detect and
recover rather than trying to be exactly right.

**`chase` is unchanged.** It stays the cheap fodder controller with its
auto-hop. `navigate` is what a spec opts into when it should look deliberate.

**Companions get it first.** `src/game/companionspecs.js` escorts with
`{ moveTo: { target: "anchor", offset: [-90, 0] } }`, which is precisely the
never-hops case — BEHAVIOR-LAB Slice 1 already records "blue has no path to the
fight" as the Lab's main missing capability. Switching that one step to
`navigateTo` is the slice's most visible payoff and its best test case.

### 4. Observability and knobs

Behavior Lab (`src/editor/tools/behavior-lab.js`) additions:

- **Graph overlay** — stand segments drawn as bars, edges color-coded by kind,
  toggleable, for the selected agent's body class (so you see *its* envelope,
  not the soldier's).
- **Path overlay** — the selected agent's current route highlighted, next
  waypoint marked, takeoff window shown, `navStuck` flagged.
- **Sense rows** for the new keys in the existing inspector grid.
- **A traversal preset** — the "cross three gaps to reach the fight" scenario
  BEHAVIOR-LAB Slice 1 deferred; it is only meaningful once blue can path.

Config `SCHEMA` (per the everything-tweakable convention; a new "Agent
navigation" group, or extend "Agent brain"):

| Key | Default | Purpose |
|---|---|---|
| `navEnabled` | `true` | global kill switch → everything falls back to `steer` |
| `navStuckTime` | `1.5` | seconds of no progress before the fallback trips |
| `navTakeoffWindow` | `24` | px from the edge within which `hop` fires |
| `navDrawGraph` | `false` | Lab overlay default (lab-only, no-op in a mission) |

## Slices

Each lands independently, keeps `node test/run.mjs` green, and changes nothing
the player sees until N3.

**N1 — the graph module.** `src/game/nav.js` + `test/nav.test.mjs`: node
extraction, each edge kind, per-body envelopes, all-pairs correctness, a golden
graph for a fixed platform set, and the degenerate cases (one platform, no
platforms, a body too tall for any headroom). Then refactor `levelgen`'s
`auditGeometry` onto it and confirm `test/gen.test.mjs` still passes unchanged —
that is the proof the generalization did not move the generator's guarantee.
*No runtime behavior change.*

**N2 — perception.** The `sense.*` keys above, the per-scene graph cache, and
the body-class key. Lab inspector rows. Extend the `vocabularyDoc()` sense list
so the LLM can gate on them. *Still no movement change* — specs can read the new
facts and keep moving the old way, which makes this safe to land alone.

**N3 — movement.** `navigate` / `navigateTo`, the `driveX { hop }` locomotor
flag, waypoint following, fallback, stuck detector, config knobs. Migrate the
companion escort step. Guard with `test/locomotion-characterization.test.mjs`
(unchanged specs must still match the golden — proof the addition is inert for
everyone who did not opt in) plus a new nav suite: an agent placed under a perch
with the target on it gets onto the perch; an agent with no path degrades to
`steer` and does not freeze; the stuck detector trips on a deliberately
impossible goal.

**N4 — Lab surfaces.** Graph + path overlays, the traversal preset, `navStuck`
display. Headless mount test as usual; visuals are an eyeball check.

**N5 — content.** Give part of the built-in roster nav-aware behavior:
`husk_charger` navigates instead of chasing; `lurk_gunner` relocates to a perch
with line of sight; `cowardly_duelist` drops off a ledge to break contact.
Update the `intelligence` rubric in `schema.js` (level 3 may use `navigate`;
level 5 gates actions on `sense.pathHops` / `sense.nextEdge`) and bump the
specs that earn it.

Rationale for the order: N1 is pure and testable with no risk; N2 is read-only
and immediately improves the Lab; N3 is the only slice that can regress
anything, and by then the graph is already trusted. N5 is deliberately last —
authoring against a vocabulary that has not been watched in the Lab is how you
get specs that look smart in JSON and dumb on screen.

## Out of scope, and why

- **Flyers.** They already move in two dimensions. Their real problem is
  different — `resolveFlyerTerrain` pushes them out of a platform while `steer`
  keeps pushing them back in, so they can grind against geometry. That is a
  clearance/steering fix, not a graph, and it deserves its own pass.
- **Dynamic geometry.** Nothing moves or breaks terrain today. `buildNavGraph`
  is a pure function of the platform list, so the hook is "rebuild on change";
  do not build invalidation machinery for a case that does not exist.
- **Crouch-height nodes.** A soldier can crouch to 22px, so some spans are
  crouch-only. Real, but it needs a second envelope per body and a
  crouch-while-walking intent. Note it; skip it.
- **Group-aware routing** (lane reservation, not all flanking through the same
  gap) belongs to Behavior-Lab Slice 3's team blackboard, which is where the
  shared state to do it will exist.
- **Swept-parabola jump validation.** The approximate edge test plus the stuck
  detector is the cheaper equilibrium. Revisit only if the Lab shows agents
  failing jumps often enough to read as clumsy.
