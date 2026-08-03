---
type: design
category: gameplay-systems
status: idea
resolution: vague
tags: [levels, traversal, city, brainstorm]
---

# Brainstorm: environment traversal

Blue-sky dump. Not a spec, not a plan, no commitments. The goal is one place to
see every way a soldier might move through, break into, climb onto, drop under, or
otherwise abuse a 2D city street — plus the futurist weirdness that makes our
city not just "XCOM but sideways."

Ideas are numbered so they can be referenced ("kill 47, keep 48"). Each carries a
rough build-cost tag:

- **[S]** small — a new platform flag, a trigger volume, a bit of state
- **[M]** medium — a new interactable type + its own physics/state machine
- **[L]** large — a new movement mode, new camera behaviour, or new world layer

And where useful, a **`primitive:`** note naming the engine piece it would become
(consistent with the primitive-library bet in `gdd.md` §5 — the LLM composes these,
never invents them).

The organizing idea underneath all of it: **the street is not a floor, it's the
middle of a stack.** Everything below assumes a soldier can be above you, below
you, or inside a wall next to you at any moment.

---

## A. The vertical stack — world structure

The single highest-leverage change. XCOM's magic isn't "you can climb," it's "the
building is a real place with an inside, a roof, and a basement." In 2D that means
the level is layered in depth *and* height.

1. **Five bands, always** — sky / roofline / upper interior / street / underground.
   A generated level fills at least three of them. `[L]` `primitive: band`
2. **Depth planes (fore / street / back)** — the sidewalk is one plane; shopfront
   interiors sit one plane back; the alley behind sits two back. Moving between
   planes happens at doors, broken walls, and gaps — not freely. Gives us
   XCOM-ish "go around the building" without going 3D. `[L]` `primitive: plane`
3. **Plane transitions are readable** — the target plane brightens, the current one
   desaturates slightly. Never a hidden layer. `[M]`
4. **Shooting across planes** — bullets cross a plane boundary only through a
   window, doorway, or hole. Makes the back plane genuine cover. `[M]`
5. **The back-alley plane is the flanking route** — parallel to the street, fewer
   sightlines, more verticality (fire escapes, dumpsters, service doors). `[M]`
6. **Cutaway interiors** — the building facade fades to a cross-section when a
   soldier enters, like a dollhouse. The rest of the street stays visible. `[M]`
7. **Roofs connect** — adjacent buildings are a second, mostly-continuous street.
   Traversing the roofline is a real alternate route end to end. `[M]`
8. **The sewer is a third continuous street** — mostly-linear, dark, with vertical
   exits (manholes, grates, sump shafts) at intervals. `[M]`
9. **Elevation asymmetry** — no level is symmetric; one side of the street is 2
   storeys, the other is 6. Forces committed routing decisions. `[S]`
10. **Vertical shafts as spines** — an elevator shaft, atrium, or light well that
    connects all five bands in one spot. The level's "ladder home." `[M]`
11. **The extract point can be on any band** — roof extraction by dropship, sewer
    extraction by tunnel, street extraction by van. Changes routing entirely. `[S]`
12. **Deploy point can also vary** — insert onto a roof and fight downward. `[S]`
13. **One-way descents** — some routes only work downward. Dropping into a sewer
    without a rope means finding another way up. Commitment as a design tool. `[S]`
14. **Sightline bleed between bands** — you can see (and shoot) through a grate,
    stairwell, or hole in a floor, so bands are connected by threat, not just
    movement. `[M]`

---

## B. Core movement verbs

The base vocabulary. Everything in later sections assumes these exist.

15. **Mantle / ledge grab** — jump short, catch the lip, pull up. The single biggest
    "the city is climbable" upgrade. `[M]` `primitive: ledge`
16. **Vault** — hop a waist-high object without losing speed (railings, car hoods,
    counters, planters). `[S]` `primitive: vaultable`
17. **Slide** — crouch at speed to go under a half-open shutter, a low pipe, a
    turret's firing arc. Reuses the existing crouch hitbox. `[S]`
18. **Drop-through one-way platforms** — press down + jump to fall through a fire
    escape grate or a shop awning. `[S]` `primitive: oneway`
19. **Wall jump** — alley walls become vertical shafts you kick up. `[M]`
20. **Wall slide** — controlled descent down a facade, for coming *down* fast
    without fall damage. `[S]`
21. **Ladder / pipe climb** — hold a vertical surface, climb at a fixed rate,
    vulnerable while doing it. `[M]` `primitive: climbable`
22. **Free-hang shimmy** — hang from a ledge or pipe and move sideways; a low-profile
    way to cross a covered gap while shots pass overhead. `[M]`
23. **Roll** — short i-frame dodge that also clears a 1-tile gap. Arcade feel. `[S]`
24. **Fall damage with a landing roll** — time the input to negate it. Rewards
    committing to a big drop. `[S]`
25. **Hanging drop-and-catch** — drop from a ledge and catch the one below,
    descending a facade one floor at a time. `[M]`
26. **Momentum matters** — sprint distance affects jump reach, so a level can gate a
    gap on "you must have a runway." `[S]`
27. **Kick-off-an-object jump** — bounce off a car roof or a hovering drone mid-air
    for extra height. `[M]`
28. **Crawl** — full prone for ducts and crawlspaces (see §D). `[S]`
29. **Braced descent** — rappel down the *outside* of a building using a fired
    anchor line, shooting one-handed at reduced accuracy on the way down. `[L]`
30. **Swim / wade** — flooded sewer sections and rain-flooded underpasses; slow,
    loud, no shooting while submerged. `[M]`

---

## C. Building exteriors — windows, walls, facades

31. **Windows are their own object type** — intact / cracked / shattered / boarded,
    each with different pass-through and sight rules. `[M]` `primitive: window`
32. **Dive through a window** — a running jump through glass, entering the interior
    plane at speed. The signature XCOM breach moment. `[M]`
33. **Shoot out a window first, then walk through** — the safe, slow option. Glass
    on the sidewalk below marks it as done. `[S]`
34. **Glass shards as a hazard** — a crawled-through broken window costs a little
    health. Rewards clearing the frame properly. `[S]`
35. **Windows telegraph** — you can see silhouettes moving behind them before you
    commit. Turns facades into information. `[M]`
36. **Boarded windows** — need two hits or a melee kick; the boards make noise and
    draw attention. `[S]`
37. **Awnings** — one-way platforms that tear after a soldier or two, or collapse
    entirely under a heavy unit. `[M]`
38. **Ledges & window sills** — narrow shimmy routes along the outside of a floor. `[M]`
39. **Drainpipes** — climbable, but they detach under sustained weight or gunfire,
    dropping whoever's on them. `[M]`
40. **Air-conditioner units** — small platforms bolted to walls; also explode
    satisfyingly and can be shot out from under an enemy. `[S]`
41. **Neon signage** — climbable frames; shoot the mounts and drop the whole sign on
    whatever's below. `[M]`
42. **Facade billboards** — big flat climbable surfaces with a gap behind them; a
    hiding spot and a sniper perch. `[M]`
43. **Balconies** — small enclosed platforms with railings you can vault or shoot
    through the gaps of. `[S]`
44. **Scaffolding** — multi-storey lattice of one-way platforms and ladders. A whole
    climbable structure that also collapses in sections. `[M]`
45. **Construction hoists / material lifts** — a rideable platform on the outside of
    a building under construction. `[M]`
46. **Wall damage states** — thin drywall shoots through, brick doesn't, reinforced
    alien-plated walls need a breaching charge. Materials, not just geometry. `[M]`
      `primitive: material`
47. **Breach charges** — a consumable that makes a new door anywhere in a soft wall.
    The player authoring their own route. `[M]`
48. **Explosions punch holes in floors** — turning a rocket into a level-editing
    tool. Downward mobility as a weapon side effect. `[L]`
49. **Partially collapsed buildings** — pre-broken facades that expose interiors,
    giving generated levels free variety. `[S]`
50. **Fire spread on facades** — burning weapons set awnings and signage alight;
    fire eventually destroys the thing you were standing on. `[L]`

---

## D. Building interiors

51. **Interiors are actually playable spaces** — multiple floors, stairwells, rooms
    with doors, not a flat backdrop. `[L]`
52. **Doors: open / closed / locked / breached** — a closed door blocks sight and
    bullets, an open one is a chokepoint. `[M]` `primitive: door`
53. **Kick a door open** — fast, loud, staggers anyone behind it. `[S]`
54. **Doors as cover you can shoot through** — thin wooden interior doors don't stop
    rounds. `[S]`
55. **Barricade a door** — spend a turn's worth of time to slow pursuit. `[M]`
56. **Stairwells** — the ordinary, safe vertical route. Slow, and everyone knows
    where it is, so it's a killzone. `[M]`
57. **Elevators** — rideable, callable, and slow. Doors open onto whatever's waiting
    on that floor. Maximum tension per credit spent. `[M]`
58. **Elevator shafts** — climb the cables, ride the roof of the car, drop down the
    shaft, or cut the cable and drop the car onto something. `[L]`
59. **Cut the cable trap** — an elevator car as a one-shot crushing weapon. `[M]`
60. **Ducts and crawlspaces** — prone-only routes between rooms that bypass doors
    entirely. Slow, silent, and you're helpless inside. `[M]`
61. **Ceiling grates** — drop out of a duct into a room, from above. `[S]`
62. **Floor hatches / trapdoors** — a room-to-room vertical shortcut. `[S]`
63. **Furniture as cover** — desks, counters, shelving; destructible, movable, and
    vaultable. `[M]` `primitive: prop`
64. **Push / drag heavy furniture** — build your own cover mid-firefight, or block a
    doorway. `[M]`
65. **Shop interiors with a back room and a rear exit** — every storefront is a
    through-route to the alley plane. `[M]`
66. **Basements** — below the storefront, and often connecting to the sewer or a
    neighbouring basement. `[M]`
67. **Multi-tenant buildings** — punch through a shared interior wall and you're in
    the next unit over. Lateral movement inside the block. `[M]`
68. **Atriums / light wells** — tall open interiors with catwalks; vertical combat
    arenas inside a building. `[M]`
69. **Interior lighting is destructible** — shoot the lights, fight in the dark, use
    your own light source and become a target. `[M]`
70. **Sprinkler systems** — shoot a sprinkler head, get steam/water that blocks
    sightlines and douses fire. `[M]`
71. **Civilian clutter that reacts** — a knocked-over shelf, a spilled display, a
    rolling can. Mostly cosmetic, occasionally tactical. `[S]`
72. **Furniture piles as improvised stairs** — stack what's in the room to reach a
    ledge the level didn't intend. `[L]`

---

## E. Fire escapes, ladders, scaffolding

73. **Fire escapes as multi-storey zigzag** — the canonical exterior climbing route:
    one-way platform landings, short ladders, thin railings. `[M]`
74. **Drop-ladders** — the bottom ladder starts retracted. Shoot the counterweight,
    jump and grab it, or find another way up. A tiny puzzle at every fire escape. `[M]`
75. **Fire escapes are noisy** — metal clanging alerts nearby enemies. A speed vs.
    stealth choice. `[S]`
76. **Grated landings shoot through** — you can fire down through the floor you're
    standing on, and be shot through it. `[M]`
77. **Fire escapes detach** — sustained damage drops a whole section, and anyone
    on it, and permanently closes the route. `[M]`
78. **Rusted rungs** — a specific ladder breaks the second time it's used. Punishes
    plans that assume a round trip. `[S]`
79. **Scaffold planks you can shoot away** — remove the enemy's footing rather than
    the enemy. `[S]`
80. **Cargo netting / mesh** — climbable in both axes, doesn't block bullets. `[M]`
81. **Rebar and exposed girders** — thin traversable beams on unfinished buildings;
    balance-beam routes across open air. `[S]`
82. **Window-washing gondolas** — a rideable platform on a facade, raised and lowered
    at a control panel, and cuttable. `[M]`
83. **Roof access ladders** — the last rung from top floor to roof, often the only
    one, therefore often guarded. `[S]`

---

## F. Rooftops

84. **The roofline as an alternate street** — a full parallel traversal route with
    its own encounters and its own hazards. `[M]`
85. **Roof gaps of graded difficulty** — some jumpable, some need a plank, a zipline,
    or a boost. `[S]`
86. **Planks and boards** — pick one up on one roof, drop it across a gap. Portable
    level geometry. `[M]` `primitive: carryable`
87. **HVAC clusters** — rooftop mazes of ducting: cover, cover you can climb, and
    cover that vents scalding steam. `[M]`
88. **Water towers** — climbable, and shootable — burst one and flood the roof or the
    floor below, sweeping people off their feet. `[M]`
89. **Rooftop gardens / greenhouses** — soft cover, breakable glass floors over the
    top storey. `[M]`
90. **Skylights** — glass floors that break under weight. Fall into the room below,
    deliberately or otherwise. `[M]`
91. **Antenna masts and dishes** — the highest climbable point on a level; a sniper
    perch you can be shot off of. `[M]`
92. **Roof-to-roof ziplines** — pre-strung by whoever lived here, or fired by the
    player. One-way, fast, and totally exposed mid-transit. `[M]` `primitive: zipline`
93. **Clotheslines & cable runs** — thin ziplines between the tenements, snappable
    under weight or fire. `[S]`
94. **Pigeon coops / rooftop shacks** — tiny interiors on the roof; hiding places
    with one entrance. `[S]`
95. **Parapets as chest-high cover** — the roof has an edge you can crouch behind and
    pop over. `[S]`
96. **Roof-edge peek** — lie prone at the edge to see the street without being seen
    from it. `[M]`
97. **Roof collapse** — enough explosive damage and the roof becomes the top floor's
    ceiling, then its floor. Multi-stage destruction. `[L]`
98. **Helipads** — flat, exposed, obvious extraction points that everyone converges on. `[S]`
99. **Billboard catwalks** — service walkways behind big signs, hidden from the
    street, connecting two roofs. `[S]`

---

## G. Street level — cars, junk, and furniture

100. **Cars are climbable** — hood, roof, then a jump to a fire escape. The classic
     "car as first step" ladder. `[S]`
101. **Cars are enterable** — get inside an abandoned car for cover with poor
     sightlines and one exit. Suicide or salvation. `[M]`
102. **Car windows blow out** — shoot through a car and the glass goes, then it stops
     being cover. Progressive cover degradation. `[M]`
103. **Cars explode** — telegraphed, on a fuse, with a burning wreck left behind. `[M]`
104. **Wrecked cars as permanent terrain** — the burnt husk stays and changes the
     level's cover map for the rest of the mission. `[S]`
105. **Push a car** — slow, needs two soldiers, creates mobile cover. `[L]`
106. **Cars on their side** — pre-flipped wrecks as tall cover and a climbing step. `[S]`
107. **Buses** — long, walk-on-top, enter/exit at both ends, windows all along. A
     whole traversal structure by themselves. `[M]`
108. **Delivery trucks with open backs** — a small interior, plus a roof to climb. `[S]`
109. **Dumpsters** — climbable, hideable-inside, pushable, and they burn. `[M]`
110. **Dumpster dive** — hide inside; enemies lose track of you. Pop the lid to
     shoot. Comic and useful. `[M]`
111. **Newspaper boxes, mailboxes, hydrants** — small vaultable clutter that reads as
     a real street and gives micro-cover. `[S]`
112. **Fire hydrants burst** — a vertical water jet that blocks sight and can boost a
     light soldier upward. `[M]`
113. **Bus shelters** — glass box: a platform on top, breakable walls, terrible
     cover. `[S]`
114. **Market stalls & awnings** — soft cover that collapses, plus a canopy to run
     across. `[M]`
115. **Planters and street trees** — climbable trees as a soft vertical route, and
     foliage that blocks sight but not bullets. `[M]`
116. **Traffic lights and lamp posts** — climbable poles; shoot the base and drop the
     pole to bridge a gap. Player-made bridges. `[M]`
117. **Scaffolding over the sidewalk** — a covered walkway: a roof to run along and a
     tunnel to run through. Two routes in one prop. `[M]`
118. **Manhole covers** — pry one open, drop into the sewer. Also throwable as a
     shield. `[S]`
119. **Grates and vents in the pavement** — see and shoot into the sewer below. `[S]`
120. **Kiosks and ATMs** — hard cover; futuristic ones can be hacked (§I). `[S]`
121. **Construction barriers & jersey blocks** — modular chest-high cover the
     generator can place freely along any street. `[S]`
122. **Trash bags** — soft landings that negate fall damage. A tiny mercy the level
     can place deliberately. `[S]`
123. **Parked bikes / scooters** — rideable for a short burst of speed, or thrown. `[M]`
124. **Subway entrance stairwells** — a street-level hole leading to the underground
     layer. `[S]`
125. **Cellar doors** — angled sidewalk hatches into a basement. `[S]`

---

## H. Under the street

126. **Sewers as a full third route** — a continuous, low-visibility path with its
     own layout, hazards, and inhabitants. `[M]`
127. **Manhole shafts** — vertical ladders down, spaced across the street, so the
     sewer and street routes stay coupled. `[S]`
128. **Sewer as bypass** — skip a heavily-defended street section by going under it,
     at the cost of time and darkness. `[S]`
129. **Flooded sections** — wading slows you, swimming disarms you, and the water
     level can change. `[M]`
130. **Sluice gates and valves** — open one to flood a section, drain another, or
     sweep enemies down a channel. Player-controlled water. `[L]`
131. **Pipe crawls** — prone-only tubes connecting sewer branches. `[S]`
132. **Utility tunnels** — cleaner, lit, cabled service corridors distinct from the
     sewer proper; they run under buildings and pop up in basements. `[M]`
133. **Subway tunnels** — big, straight, with platforms, tracks, and third rails. `[M]`
134. **Live third rail** — instant-death floor strip you can switch off at a panel. `[M]`
135. **Trains that still run** — a scheduled, telegraphed hazard that also functions
     as a rideable moving platform. `[L]`
136. **Abandoned subway cars** — enterable interiors with windows, in a tunnel. `[M]`
137. **Maintenance shafts up into buildings** — the sewer connects to basements, so
     you can enter a building from underneath and skip the ground floor entirely. `[M]`
138. **Steam pipes** — burst them for a scalding, sight-blocking hazard, or ride the
     vertical blast upward. `[M]`
139. **Darkness as a real mechanic** — the sewer needs a light; carrying one makes you
     visible; muzzle flash briefly reveals the room. `[L]`
140. **Sewer wildlife / things that live down there** — a reason the shortcut isn't
     free. `[M]`
141. **Sewer rises into a storm drain outfall** — a large, open, one-way exit that
     dumps you somewhere unexpected on the map. `[S]`
142. **Cave-ins** — explosives underground close routes permanently, including
     behind you. `[M]`
143. **Buried alien infrastructure** — the deepest layer isn't human. Where a level's
     objective sometimes hides. `[M]`

---

## I. Futuristic city infrastructure

The part that makes the city *ours*. Rule of thumb: each of these is a traversal
verb with a visible, hackable, breakable, weaponizable physical object attached.

144. **Pneumatic tube network** — climb in, get fired across the level. Entry pods on
     several bands; the destination is chosen at a junction panel. `[L]`
     `primitive: tube`
145. **Tube junction hacking** — reroute the network so *enemy* reinforcements
     arriving by tube get dumped somewhere useless. `[M]`
146. **Tubes are transparent** — you can see who's in transit and shoot the tube to
     break it, dumping them out mid-route. `[M]`
147. **Cargo tubes** — bigger, slower, carry objects; ride one by clinging to a
     canister. `[M]`
148. **Teleporter pads** — short-range paired pads. Instant, loud, visible flash, and
     a cooldown. `[M]` `primitive: teleporter`
149. **Pad re-pairing** — rewire which pad connects to which; makes the enemy's own
     fast-travel network work for you. `[M]`
150. **Unstable pads** — a damaged pad has a scatter radius. Sometimes you arrive
     inside a wall's worth of trouble. `[S]`
151. **One-shot emergency recall pads** — a get-out-of-here button placed sparsely in
     a level. Consumable escape. `[S]`
152. **Grav lifts / updraft columns** — a vertical column of lift you jump into and
     ride upward, exit at any floor. The city's elevator replacement. `[M]`
     `primitive: gravlift`
153. **Grav lift polarity flip** — reverse it into a fast descent chute, or into a
     trap that pins someone at the top. `[M]`
154. **Grav lifts push projectiles too** — bullets fired through one curve upward.
     Chaotic and great. `[M]`
155. **Mag-rail rungs** — magnetic strips up a facade; with the right boots you walk
     straight up a wall. Gated by equipment, not skill. `[L]`
156. **Mag-rail transit lines** — clip onto a public rail and get carried along the
     street at speed, exposed the whole way. `[M]`
157. **Drone delivery lanes** — a stream of cargo drones at roof height. Jump onto
     one and ride it. Timing-based moving platforms with personality. `[L]`
158. **Hijack a delivery drone** — hack one to carry you where *you* want. Slow,
     obvious, hilarious. `[M]`
159. **Personal flying drone (squad kit)** — a deployable that carries one soldier one
     way, then needs to recharge. A hard-limited traversal resource. `[L]`
160. **Drone as a mobile platform** — hover it and stand on it; it sags under weight
     and drifts. `[M]`
161. **Drone as a mobile shield** — position it to eat shots; it has HP. `[M]`
162. **Scout drone** — no passenger, just vision. Fly it into a building to reveal
     interiors before breaching. `[M]`
163. **Holo-billboards** — light-only, walk straight through them. Concealment
     without cover; sightline denial you can also turn off. `[M]`
164. **Hard-light bridges** — projected walkways that exist only while the emitter
     has power. Shoot the emitter and drop everyone on it. `[M]`
     `primitive: emitter`
165. **Emitter hacking** — turn a hard-light bridge on to make a route the enemy
     didn't expect, or off to strand them. `[M]`
166. **Powered fences / light barriers** — pass-through-blocking fields with a visible
     power conduit to cut. `[M]`
167. **Building power grid** — one substation per block; killing it disables lifts,
     lights, hard-light, and doors. A big, expensive, level-wide lever. `[L]`
168. **Backup power kicks in** — the grid comes back after N seconds, so the outage is
     a window, not a state. `[M]`
169. **Auto-shutters** — a building in alert mode seals its windows and doors; you
     have a countdown to get in, or a new problem getting out. `[M]`
170. **Maglev freight loop** — a scheduled heavy platform running along the street at
     mid-height. Rideable, lethal, hackable. `[L]`
171. **Vertical farm towers** — dense, climbable interior lattices of trays and lifts.
     Distinct interior geometry with soft cover. `[M]`
172. **Coolant / cryo vents** — freeze a puddle into a slide, or ice a wall into a
     climbable surface. Terrain you author with a weapon. `[L]`
173. **Public autocab pods** — call one to a curb, ride it a short distance along the
     street, exit anywhere. Slow public transit as cover-on-rails. `[M]`
174. **Refuse chutes** — building-side one-way slides that dump into a basement or a
     compactor. Fast descent with a bad ending if you're careless. `[M]`
175. **Utility spider bots** — climbing maintenance robots you can ride up a facade,
     or hack to carry cargo. `[M]`
176. **Sign gantries with mag-clamps** — clip to a gantry and swing across the street
     as a pendulum. Momentum traversal. `[L]`
177. **Air-curtain vents** — building entrances blast air; they slow projectiles and
     push light units. `[M]`
178. **Data-cable runs** — thick bundles between buildings; walkable tightropes at
     roof height. `[S]`
179. **Kinetic dampener fields** — zones where fall damage is nullified. Turns a
     building side into a legitimate descent route. `[M]`
180. **Drone traffic control tower** — hack it and every civilian drone in the level
     reroutes, changing the moving-platform layout mid-mission. `[L]`

---

## J. Squad-specific traversal

XCOM's other magic: the squad is a machine, not four copies of the same guy.

181. **Boost a teammate** — cup hands, throw them to a ledge nobody can reach alone.
     The one that makes the squad feel like a squad. `[M]`
182. **Rope down to a boosted teammate** — the boosted soldier drops a line so the
     rest follow. Turns a one-man route into a squad route. `[M]`
183. **Deployable ladder** — a consumable that permanently opens a vertical route. `[M]`
184. **Deployable bridge plank** — same, horizontally. `[S]`
185. **Grapple gun** — a per-soldier kit item: fire at a ledge, get pulled up. Limited
     charges, limited anchor points, clearly telegraphed anchors. `[L]`
     `primitive: anchor`
186. **Grapple an enemy** — yank a sniper off a roof. Traversal tech as a weapon. `[M]`
187. **Zipline gun** — fire a line between two anchors and create a route the whole
     squad uses. `[M]`
188. **Carry a downed soldier** — slower, can't shoot, changes every route decision.
     Permadeath pressure applied to traversal. `[L]`
189. **Throw equipment across a gap** — pass a weapon or kit item to a soldier on the
     other side. `[M]`
190. **Squad-order traversal commands** — tell an AI companion "take the roof" or
     "go under" and they route themselves. `[L]`
191. **Companion pathing that actually uses the layers** — AI that climbs, drops, and
     breaches instead of getting stuck on the street. Big AI investment, huge payoff. `[L]`
192. **Overwatch a route** — one soldier holds a sightline while the others move
     through it. Traversal as a coordinated act. `[M]`
193. **Class-gated verbs** — a heavy can't climb a drainpipe, a scout can't kick a
     reinforced door. Routes differ per soldier, so squad composition changes the
     map. `[M]`
194. **Weight matters** — heavies break awnings, snap clotheslines, and collapse
     scaffolds that a scout crosses fine. `[M]`
195. **A soldier left behind** — a route that only some of the squad can take, with
     the rest fighting through separately. Deliberate splitting. `[M]`

---

## K. Enemies use all of it

Non-negotiable if the city is to feel alive rather than like a playground.

196. **Aliens climb** — they take fire escapes, drop from roofs, and come through
     windows. Every route the player has, something else can use. `[L]`
197. **Enemies breach** — they blow their own holes in walls to reach you. Cover is
     temporary. `[M]`
198. **Enemies use the tubes and pads** — reinforcements arrive by infrastructure, so
     the infrastructure becomes a target. `[M]`
199. **Wall-crawlers** — a class that ignores geometry, forcing verticality to matter
     defensively. `[M]`
200. **Flyers** — force the player off exposed roofs and into interiors. `[M]`
201. **Burrowers** — come up through the sewer layer, making "safe" underground
     routes contested. `[M]`
202. **Enemies collapse routes** — they cut the ladder you came up, or the zipline
     you planned to leave on. `[M]`
203. **Enemies hold the vertical** — snipers on masts, turrets on parapets, so
     roofline traversal is a real risk. `[M]`
204. **Alien infrastructure grafted onto human** — the aliens have added their own
     tubes, spires, and growths to the city, giving them routes the player must take
     apart. `[M]`
205. **A hunter that follows you across layers** — one enemy that tracks you into
     the sewer, the interior, the roof. Makes traversal feel pursued. `[L]`

---

## L. Destruction & authoring your own route

206. **Structural destruction with consequences** — take out enough of a ground floor
     and the upper floors come down, along with everyone on them. `[L]`
207. **Destruction as the answer to a puzzle** — no route up? Blow the wall and the
     rubble becomes a ramp. `[M]`
208. **Rubble is real terrain** — debris piles are climbable, and they persist. `[M]`
209. **Shot-out floors** — hole-punching downward, deliberately, to drop onto someone. `[M]`
210. **Cutting torch** — slow, quiet, makes a hole anywhere in metal. The stealth
     counterpart to a breaching charge. `[M]`
211. **Weakened structures telegraph** — cracks, sagging, groaning audio before a
     collapse. Never a surprise, always a decision. `[M]`
212. **Fire that spreads through a building** — a slow, moving hazard that rewrites
     the level's routes over the course of a fight. `[L]`
213. **Water that spreads and rises** — same idea, from a burst main or a sluice gate. `[L]`
214. **Level state persists into results** — "you levelled half a city block" shows up
     in the debrief and the campaign story. `[S]`
215. **Destroy the extraction route** — the horror scenario the generator should
     occasionally allow: you have to find a new way out. `[M]`

---

## M. The city fights back — hazards & reactive systems

216. **Traffic** — a street with moving vehicles is a timed hazard *and* a set of
     moving platforms. `[L]`
217. **Automated traffic that reroutes** — hack the grid to send a truck into a wall. `[M]`
218. **Police / civil drones** — a neutral third party that reacts to gunfire and
     complicates the fight for everyone. `[L]`
219. **Civilians** — panicking, running, opening doors, drawing fire, giving away
     your position by fleeing from you. `[L]`
220. **Alarms** — tripping one changes enemy routing and closes auto-shutters. `[M]`
221. **Security cameras** — visible cones, shootable, hackable, and they open new
     routes when disabled. `[M]`
222. **Weather** — rain reduces sight and makes metal surfaces slippery; a storm turns
     the roofline into a real risk. `[M]`
223. **Wind at altitude** — pushes you mid-jump on the highest roofs. `[S]`
224. **Day/night** — the same generated street plays completely differently in the
     dark. `[M]`
225. **Smog layers** — visibility gradient by altitude: the street is clear, the
     upper floors are in haze. `[M]`
226. **Power surges** — periodic flickers that briefly kill hard-light and lifts. `[S]`
227. **Building AI** — some buildings have an opinion about you being inside them,
     and act through doors, lifts, and shutters. `[L]`

---

## N. Traversal as combat

228. **Drop attacks** — landing on an enemy from height as a real damage move. `[M]`
229. **Shoot while hanging** — reduced accuracy, but you can hold a ledge and fire. `[M]`
230. **Slide-shoot** — the arcade classic; slide under fire and shoot the whole way. `[S]`
231. **Kick someone off a roof** — a melee shove with a height check. Enormously
     satisfying, and terrifying when used on you. `[M]`
232. **Shoot the thing they're standing on** — an explicit, encouraged tactic
     supported by everything in §C–§G. `[S]`
233. **Vault-over takedown** — vault a counter into a melee finish. `[M]`
234. **Zipline pass shooting** — fire while transiting, unable to stop. High risk,
     high style. `[M]`
235. **Grenades that use the layers** — bank one through a window, drop one down a
     shaft, roll one along a duct. `[M]`
236. **Verticality changes weapon value** — shotguns rule stairwells, snipers rule the
     roofline. The level chooses the loadout. `[S]`
237. **Height advantage as a stat** — a small accuracy bonus shooting downward, so
     climbing is always tactically worth it. `[S]`
238. **Cover that only works from one band** — a parapet that stops street fire but
     not fire from the taller building opposite. `[M]`

---

## O. Stealth, sightlines, information

239. **Sightline occlusion by geometry** — real line-of-sight through windows, doors,
     grates, and holes. The backbone of everything stealthy. `[L]`
240. **Peek verbs** — lean around a corner, peek over a parapet, peer through a grate.
     Information gathering as a move. `[M]`
241. **Noise propagation** — glass, fire escapes, kicked doors, and gunfire have
     radii; the sewer carries sound further. `[M]`
242. **Silent routes exist** — ducts, sewers, and prone crawls that let a scout get
     ahead of the fight. `[M]`
243. **Enemies investigate** — noise draws them to the wrong place, which is what
     makes the layers useful. `[M]`
244. **Blind fire through a wall** — shoot at a silhouette you can only half see. `[M]`
245. **Thermal / scanner kit** — see through one plane of wall for a few seconds. `[M]`
246. **The level map fills in as you explore it** — routes discovered are routes
     remembered, and shown on the debrief. `[M]`

---

## P. Wildcards — the stuff that has no business working

247. **Ride a collapsing sign to the ground** — surf a falling object as a descent. `[M]`
248. **Grav-lift juggling** — two lifts facing each other, and whatever's between them
     never comes down. `[S]`
249. **The tube network as a weapon** — fire an armed explosive into the pneumatic
     system and route it to the enemy's staging area. `[M]`
250. **A teleport pad pointed at a wall** — turn the enemy's own network into a
     grinder. `[S]`
251. **Elevator surfing between floors, shooting through the doors as they pass**. `[M]`
252. **A shopping cart / cargo dolly** — ride it down a hill, jump off before the
     wall. Pure joy, zero tactical value. `[S]`
253. **Deployable trampoline / crash pad** — negate fall damage anywhere, once. `[S]`
254. **Umbrella descent** — grab a market awning and glide. Slow, silly, effective. `[M]`
255. **A hacked cargo drone carries a car** — and you decide where the car goes. `[L]`
256. **Grease / oil slicks** — slide fast, but you can't stop or turn. `[M]`
257. **The building you're in becomes the objective** — bring it down with your squad
     still inside and get out ahead of the collapse. `[L]`
258. **A soldier who knows this city** — a trait that reveals shortcuts on deployment.
     Ties traversal to the roster and to permadeath: lose them, lose the shortcuts. `[M]`
259. **Persistent city damage across missions** — return to a block you levelled and
     the rubble is still there, as terrain. `[L]`
260. **A vertical mission with no street at all** — the whole level is one tower.
     Everything above still applies, rotated 90°. `[M]`

---

## Q. What this implies for the engine (not a plan, just the shape)

The recurring pattern: **almost every idea above is one of a small number of
primitives with different art and different numbers.** If we build these, the level
generator and the LLM author can compose the entire list without new engine work —
which is exactly the bet in `gdd.md` §5.

The candidate primitive set:

| Primitive | Covers |
|---|---|
| `oneway` | fire escape landings, awnings, scaffolding, catwalks, grates |
| `ledge` | mantling, shimmying, hanging, drop-and-catch |
| `climbable` | ladders, drainpipes, netting, mag-rails, cables |
| `vaultable` | railings, cars, counters, barriers, parapets |
| `material` | drywall/brick/glass/alien-plate — what shoots through, what breaches |
| `window` | every glass surface, its states, and diving through it |
| `door` | doors, shutters, hatches, gates, barricades |
| `plane` | the fore/street/back depth layers and their transitions |
| `carryable` | planks, ladders, crates, downed soldiers, furniture |
| `prop` | destructible/pushable/climbable street and interior clutter |
| `mover` | elevators, lifts, gondolas, trains, drones, autocabs — anything rideable |
| `launcher` | tubes, grav lifts, ziplines, teleport pads — anything that moves you *for* you |
| `emitter` | hard-light bridges, barriers, fields, anything with a power source to shoot |
| `anchor` | grapple points, zipline endpoints, rope drops |
| `hazard` | steam, third rail, fire, water, electricity, coolant |
| `trigger` | alarms, cameras, panels, switches, hackables |

Two structural notes that everything else hangs off:

- **Reachability must understand every verb.** `src/game/gen/reach.js` currently
  proves a level is traversable by jumping. If climbing, mantling, ziplines, and
  grav lifts exist, the reachability solver has to know about them, or the generator
  will produce levels that are either unsolvable or trivially solvable. This is the
  real cost of this whole document, and it's worth paying early.
- **Every route wants a second route.** The generator should guarantee at least two
  distinct band-paths from insert to extract, so the city reads as a place with
  options rather than a corridor with decoration.

---

## R. If we only built ten of these

A personal shortlist, ordered by how much city-feel per unit of work:

1. **#18 one-way platforms** — unlocks fire escapes, awnings, catwalks, everything.
2. **#15 mantle / ledge grab** — the single verb that makes a facade climbable.
3. **#73 fire escapes** — the most recognizable "this is a city" structure there is.
4. **#31/#32 windows you can dive through** — the signature XCOM breach beat.
5. **#100 climbable cars** — free verticality on every street, and it's already art
   we'd draw anyway.
6. **#2 depth planes** — the expensive one, but it's what turns a backdrop into a
   building.
7. **#126 sewers** — a whole second level for the cost of one tileset.
8. **#152 grav lifts** — the cheapest futurist verb with the biggest movement payoff.
9. **#144 pneumatic tubes** — the one nobody else has, and it's pure identity.
10. **#181 boost a teammate** — makes the squad a squad instead of three guns.
