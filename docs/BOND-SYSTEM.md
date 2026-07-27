---
status: plan
tags: [soldiers, meta]
---

# Bond System — soldier relationships, the Lounge, and the LLM as chronicler

Soldiers get a bio when hired and a log line when they die; nothing happens in
between. This system fills the middle with **relationships between pairs of
soldiers** — friendships, rivalries, and eventually romances — that grow from
shared missions, produce small combat benefits (biggest when the pair deploys
together), and play out visibly in a new base area, the **Lounge**, where the
LLM writes the scenes. Kept deliberately simple: one number per pair, random
events after missions (no in-mission tracking), no proximity requirements.

---

## 1. The model: one number per pair

```
state.bonds[pairKey] = {          // pairKey = sorted ids, "reyes|vance"
  a, b,                           // soldier ids
  affinity: 0,                    // -100 .. +100
  special: null,                  // null | "romance" | "sworn" | "nemesis"
  log: [],                        // last ~10 events: { day, text, delta }
}
```

`affinity` maps to a **band**, which is all the rest of the game reads:

| Affinity | Band | Notes |
|---|---|---|
| ≤ −60 | Bitter Rivals | can upgrade to `nemesis` via event |
| −59 .. −25 | Rivals | |
| −24 .. +24 | Neutral | no record kept until first nonzero event |
| +25 .. +59 | Friends | |
| ≥ +60 | Close Friends | can upgrade to `romance` or `sworn` via event |

`special` is a one-way upgrade that a **defining-moment event** (§2) can apply
at the top bands: `romance` or `sworn` (deep platonic — brothers/sisters in
arms) on the positive side, `nemesis` on the negative. Which one fires is
decided by the fiction (traits/bios via the LLM; procedural fallback picks
`sworn`, and never `romance` — romance only happens when the LLM affirms it
fits the two people). Specials change flavor and the strength of a few effects,
not the core numbers.

Soldiers get one new field: `morale: null | { kind, daysLeft, over }` for the
death reactions in §4.

---

## 2. How affinity moves: random post-mission events, mostly positive

Fighting together bonds people — that's the default. Soldiers who deploy
together get closer ~90% of the time; friction is rare and comes from a
campaign under **strain**, not from dice. No in-mission bookkeeping. After
`applyMissionResult`, roll `bondEventsPerMission` (2) **relationship events**.
Each event:

1. Picks a pair — weighted toward pairs who just deployed together (they're
   where the story is), but any two living roster members can hit.
2. Rolls direction: negative with probability `bondNegBase` (8%) +
   `strain × bondNegPerStrain` (0.5%/pt), capped at `bondNegCap` (50%);
   positive otherwise. High-ego and low-stability pairs (§2.2) take a
   disproportionate share of the negatives when they come.
3. Rolls size (3..12, warmth-scaled for positives), writes a one-line log
   entry (template text immediately; LLM upgrade later, §5), applies the delta.

If a pair crosses into a top band, the *next* event for that pair is a
**defining moment**: a bigger beat that can set `special`. Downtime also moves
affinity passively: each `advanceDay`, every pair with both members on the
roster drifts `bondDriftPerDay` (+1, warmth-leaning) — they live in the same
bunker. Slow, so missions stay the main driver.

### 2.1 Strain — where the bad times come from

One campaign-level number, `state.strain` (0–100): +`strainPerDeath` (25) per
KIA, +`strainPerFailure` (15) per failed mission, +`strainLowHealth` (2) per
day while campaignHealth is below 40, −`strainDecay` (5) per quiet day. The
Lounge's "cool it down" nudge also vents a few points. The consequence: a
winning campaign is a band of brothers; a bleeding one starts eating itself —
rivalries and `nemesis` bonds *emerge from hard campaigns* instead of random
rolls, which is the GDD's "darkness is earned" rule made mechanical. Strain is
also a readable feedback signal (show it in the Lounge as room temperature).

### 2.2 Trait chemistry — social axes, not a pair matrix

Traits optionally carry `social: { warmth, ego, stability }`, each −2..+2;
chemistry is always computed from summed axes, never from trait names — so
LLM-generated recruits with brand-new traits work automatically (the generator
fills the axes; unknown/missing traits read as zeros, and pure competence tags
like `Steady Hands` simply carry none).

- **warmth** — how easily they open up. Pair warmth scales drift and positive
  event size. `Loyal` +2, `Green` +1, `Mercenary` −2 (slow to bond — which
  makes the eventual friendship a story).
- **ego** — need to be the best in the room. Both-high-ego pairs bond fine in
  good times (their events read competitive), but are first in line for
  negatives under strain. `Insubordinate` +2, `Mercenary` +1, `Reckless` +1.
- **stability** — how they hold up when things go dark. Low pair stability
  multiplies strain-driven negatives; individually it scales grief length
  (§4). `Veteran`/`Fearless`/`Zealot` +2, `Reckless`/`Vengeful` −1,
  `Green` −2.

---

## 3. Combat effects

No proximity checks, no positioning requirements — effects key off who is on
the deploy list, resolved once at `loadMission` time into flat per-soldier stat
modifiers. Everything below is a config knob.

**Deployed together (the main benefits):**

| Band | Effect while both alive on the mission |
|---|---|
| Friends | +0.5 Aim each |
| Close Friends | +1 Aim, damage taken ×0.9 each |
| Rivals | +1 Aim each (they show off), but −0.5 Nerve* |
| Bitter Rivals | +1.5 Aim, −1 Nerve* |
| `romance` / `sworn` | Close Friends effect, plus if one dies mid-mission the other gets +2 Aim for the rest of it |
| `nemesis` | Bitter Rivals effect, plus each starts the mission with +10% max health (neither will die before the other) |

*Nerve isn't wired into missions yet (GDD §7.1); until the panic system lands
the rival penalty is recorded but inert. Rivals are intentionally the
high-upside pick even so.

**Not deployed together (minor, always-on):** a soldier with any Close
Friend, `romance`, or `sworn` partner *alive anywhere on the roster* gets +0.5
Aim on every mission — someone to come home to. This is the only apart-effect;
one rule, easy to show on the soldier card.

---

## 4. Death

When a soldier dies, each partner's reaction depends on the band:

- **Close Friends / `romance` / `sworn`** → **grief**: −1 Aim, −1 Speed for
  `griefDays` (3–5, scaled by band; low-stability soldiers grieve longer,
  high-stability shorter). Shown on the Barracks card.
- **Rivals / Bitter Rivals / `nemesis`** → **hollow**: +1 Aim on their next
  mission only ("it wasn't supposed to be *them*"), then nothing. Losing a
  rival costs you something no buff shows.

The bond record survives death (the log is the memorial); the always-on apart
bonus obviously ends. Morale ticks down in `advanceDay`.

---

## 5. The Lounge — a new base room

A bar/rec room in the bunker (GDD §6 gets one more row; name candidate: **The
Foxhole**). What it does:

- **Watch.** The room shows 2–4 soldiers present (rotating daily, weighted
  toward pairs with recent events). Selecting a pair plays a short scene — 4–8
  lines of dialogue between them, written by the LLM from their bios, traits,
  affinity band, and recent bond log (template one-liners as fallback).
  Scenes are generated when the pair's latest event fires and cached into the
  bond log, so the Lounge reads instantly and replays are free.
- **Intervene (one nudge per day).** A single, cheap verb so the player has a
  hand without a management minigame: pick any pair and either **encourage**
  them (+`nudgeDelta` (4) affinity) or **cool it down** (halve a negative
  pair's next negative event). One nudge/day, resets on `advanceDay`. That's
  the whole intervention system for now; if it feels good, later slices can
  add more verbs.

The Lounge is also where band changes and defining moments are announced —
the player finds out two soldiers became something by walking in on it.

---

## 6. LLM integration — generation-time, cached, disposable

All calls via the existing `Player2Client.chatJSON` (same client id config the
Enemy Designer uses). The simulation always writes template text first; LLM
calls are fire-and-forget and upgrade the record in place when they return.
No app / no credits / bad JSON → templates stay, game unaffected.

Three call sites:

1. **Event text** (per post-mission event): input both soldier JSONs, band,
   the delta and mission name; output `{ text }` — one line for the bond log
   ("Tanaka bet Vance she couldn't hit the mess-hall clock from the door.
   Vance now owes her dinner."). The numbers are already decided by the sim —
   the LLM only narrates them.
2. **Defining moments**: input the pair + full bond log; output
   `{ special, text }` with `special` validated against the enum for that band
   (invalid → `sworn`/`nemesis` fallback). The one call where the LLM makes a
   real decision: whether these two specific people are a romance, sworn
   friends, or true nemeses.
3. **Lounge scenes**: input the pair + log + band; output
   `{ lines: [{who, say}] }`, ≤8 lines, cached into the log entry it
   dramatizes.

Prompts live in `src/game/bonds/prompts.js`; every prompt carries the tone rule
(soldiers talk like soldiers; darkness is earned, not front-loaded). Budget
guard: at most `bondCallsPerDay` (4) generations queued per day.

---

## 7. Config & editor

Numbers → `config.js` SCHEMA: `bondEventsPerMission`, `bondDriftPerDay`, band
thresholds, each band's Aim/damage numbers, `bondNegBase`, `bondNegPerStrain`,
`bondNegCap`, `strainPerDeath`, `strainPerFailure`, `strainLowHealth`,
`strainDecay`, `griefDays`, `nudgeDelta`, `bondCallsPerDay`. Process → a **Bond Lab** editor tool (standard
`createX(container, onBack)`): pick two soldiers, set affinity, fire fake
events, preview all three LLM calls and their fallbacks.

---

## 8. Slices

1. **Core, no LLM.** `state.bonds` + `state.strain`, post-mission event roll
   with template text, social axes on the built-in traits, drift, bands,
   deployed-together + apart modifiers through `loadMission`, grief/hollow,
   Barracks card display, deploy-screen synergy preview. Tests: band math,
   strain accrual/decay, negative-chance curve, axis chemistry, modifier
   flattening, morale.
2. **The Lounge.** Room screen, daily presence rotation, nudge action +
   daily reset, defining moments (procedural `sworn`/`nemesis` only).
   Tests: nudge rules, upgrade one-way-ness.
3. **LLM chronicler.** The three call sites with validate/fallback, caching,
   budget guard, romance unlocked (LLM-gated), Bond Lab tool. Tests: shape
   validation, fallback firing, in-place upgrades (stubbed client).

Slice 1 alone changes squad selection and makes deaths ripple; the LLM then
turns the numbers into people.
