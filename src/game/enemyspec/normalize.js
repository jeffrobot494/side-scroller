// ---------------------------------------------------------------------------
// NORMALIZE — sparse authored EnemySpec → fully-defaulted spec.
//
// The authored/LLM representation stays sparse (doc §9); the runtime consumes
// ONLY the normalized form, so every default lives here and nowhere else.
// Normalization never mutates its input and its output stays plain
// JSON-serializable data (expressions are still strings — the runtime compiles
// them via expr.js at instantiate time).
// ---------------------------------------------------------------------------

import {
  SPEC_VERSION, DEFAULT_LIMITS, LIMIT_CAPS, MOTIONS, FLYING_MOTIONS,
} from "./schema.js";

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function normalizeSpec(spec) {
  const s = clone(spec) || {};
  s.v = s.v ?? SPEC_VERSION;
  s.id = s.id || "unnamed_enemy";
  s.name = s.name || s.id;
  s.threat = s.threat ?? 50;
  s.role = s.role || "skirmisher";
  s.tier = s.tier ?? 1;
  s.vars = s.vars || {};
  s.defs = s.defs || {};

  // Engine safety limits: fill defaults, clamp to hard caps.
  const lim = { ...DEFAULT_LIMITS, ...(s.limits || {}) };
  for (const k of Object.keys(LIMIT_CAPS)) lim[k] = Math.min(Math.max(1, lim[k] ?? DEFAULT_LIMITS[k]), LIMIT_CAPS[k]);
  s.limits = lim;

  s.root = normalizeEntity(s.root || {}, { isRoot: true });
  for (const [id, def] of Object.entries(s.defs)) {
    s.defs[id] = normalizeEntity({ id, ...def }, { isRoot: false });
  }

  s.brain = normalizeBrain(s.brain);
  return s;
}

// ---- entities -------------------------------------------------------------

function normalizeEntity(e, { isRoot }) {
  const out = { ...e };
  out.id = out.id || (isRoot ? "root" : "part");
  out.tags = out.tags || [];
  out.vars = out.vars || {};
  out.on = out.on || {};
  if (!isRoot) out.at = out.at || [0, 0];

  // visual: default a small box so every entity draws SOMETHING readable.
  const vis = { shape: "box", size: [24, 24], color: "#e05a5a", ...(out.visual || {}) };
  out.visual = vis;

  // body defaults to the visual footprint; gravity defaults by motion type
  // (flying controllers float, everything else falls) unless authored.
  const motion = normalizeMotion(out.motion);
  const body = { ...(out.body || {}) };
  body.w = body.w ?? vis.size[0];
  body.h = body.h ?? vis.size[1];
  if (body.gravity === undefined) {
    body.gravity = motion && FLYING_MOTIONS.includes(motion.type) ? 0 : 1;
  }
  out.body = body;
  if (motion) out.motion = motion;

  if (out.health) out.health = { max: Math.max(1, out.health.max ?? 1) };

  if (out.contact) {
    out.contact = { damage: 0, destroySelf: false, knockback: 0, cooldown: 0.6, ...out.contact };
  }

  if (out.emitters) {
    const em = {};
    for (const [name, def] of Object.entries(out.emitters)) {
      em[name] = { at: [0, 0], ...def };
      if (em[name].projectile) em[name].projectile = normalizeProjectile(em[name].projectile);
    }
    out.emitters = em;
  }

  if (out.life) out.life = { ttl: out.life.ttl ?? 8 };

  // link: children die with their parent by default; their own death removes
  // them (doc §4 defaults).
  if (!isRoot) {
    out.link = { onParentDeath: "destroy", onOwnDeath: "destroy", followParent: true, ...(out.link || {}) };
  }

  out.children = (out.children || []).map((c) => normalizeEntity(c, { isRoot: false }));
  return out;
}

function normalizeMotion(m) {
  if (!m) return null;
  const type = m.type || "static";
  const defaults = MOTIONS[type] ? MOTIONS[type].params : {};
  return { ...defaults, ...m, type };
}

// Plain projectile: fill the mission Projectile spec shape; a bare `damage`
// becomes a standard damage effect resolved by mission/combat.js.
function normalizeProjectile(p) {
  const out = { speed: 420, w: 10, h: 10, color: "#8affc1", life: 2.0, gravity: 0, ...p };
  if (!out.effects) out.effects = [{ kind: "damage", amount: out.damage ?? 8 }];
  return out;
}

// ---- brain ----------------------------------------------------------------

function normalizeBrain(b) {
  // No brain: a single idle state so the runtime never special-cases "brainless".
  if (!b || !b.states || !Object.keys(b.states).length) {
    return { mode: "tracks", start: "idle", states: { idle: { enter: [], tracks: [], transitions: [] } } };
  }
  const mode = b.mode || "tracks";
  const states = {};
  for (const [id, st] of Object.entries(b.states)) {
    const out = { enter: st.enter || [], transitions: st.transitions || [] };
    if (mode === "utility") {
      out.decisionInterval = st.decisionInterval ?? 0.3;
      out.actions = (st.actions || []).map((a, i) => ({
        id: a.id || `action${i}`,
        when: a.when,
        score: a.score ?? 1,
        windup: a.windup ?? 0,
        steps: a.steps || [],
        recovery: a.recovery ?? 0,
        cooldown: a.cooldown ?? 0,
      }));
      out.tracks = (st.tracks || []).map(normalizeTrack); // ambient tracks may coexist
    } else {
      out.tracks = (st.tracks || []).map(normalizeTrack);
    }
    states[id] = out;
  }
  return { mode, start: b.start || Object.keys(states)[0], states };
}

function normalizeTrack(tr, i) {
  return { id: tr.id || `track${i}`, loop: tr.loop !== false, steps: tr.steps || [] };
}
