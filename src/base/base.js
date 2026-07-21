// The base hub: a left-hand list of locations (your key NPCs / rooms) and a
// main panel that renders the selected one. Only the Barracks is functional so
// far — that's where you hire and view soldiers.

import { state, hire } from "./state.js";

const app = document.getElementById("app");
let currentLocation = "barracks";
let flash = null; // transient message shown after an action (e.g. hire result)

const LOCATIONS = [
  { id: "barracks", label: "Barracks", icon: "🪖", staff: "Sgt. Bishop" },
  { id: "engineering", label: "Engineering", icon: "🔧", staff: "Dr. Halden" },
  { id: "robotics", label: "Robotics", icon: "🤖", staff: "Icarus" },
  { id: "operations", label: "Operations", icon: "🛰️", staff: "Cmdr. Voss" },
  { id: "warroom", label: "War Room", icon: "🗺️", staff: "The Council" },
];

const STAT_LABELS = { aim: "Aim", health: "Health", speed: "Speed", nerve: "Nerve" };

// ---- Rendering ------------------------------------------------------------

function render() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">XCOM&nbsp;TASK&nbsp;FORCE</div>
      <div class="resources">
        <span class="credits">§ ${state.money.toLocaleString()}</span>
        <span class="roster-count">${state.roster.length} on roster</span>
      </div>
    </header>
    <div class="layout">
      <nav class="locations">
        ${LOCATIONS.map(locButton).join("")}
      </nav>
      <main class="panel">
        ${flash ? `<div class="flash flash-${flash.kind}">${flash.text}</div>` : ""}
        ${renderLocation(currentLocation)}
      </main>
    </div>
  `;
  flash = null; // one-shot
}

function locButton(loc) {
  const active = loc.id === currentLocation ? " active" : "";
  return `
    <button class="loc${active}" data-action="nav" data-loc="${loc.id}">
      <span class="loc-icon">${loc.icon}</span>
      <span class="loc-text">
        <span class="loc-label">${loc.label}</span>
        <span class="loc-staff">${loc.staff}</span>
      </span>
    </button>
  `;
}

function renderLocation(id) {
  if (id === "barracks") return renderBarracks();

  const loc = LOCATIONS.find((l) => l.id === id);
  return `
    <div class="location-header">
      <h1>${loc.icon} ${loc.label}</h1>
      <p class="staff-line">${loc.staff}</p>
    </div>
    <div class="placeholder">
      <p>${loc.label} isn't operational yet.</p>
      <p class="muted">We're building the base one room at a time.</p>
    </div>
  `;
}

function renderBarracks() {
  const roster = state.roster;
  const recruits = state.recruits;

  return `
    <div class="location-header">
      <h1>🪖 Barracks</h1>
      <p class="staff-line">Sgt. Bishop — "Best recruits I've laid eyes on in twenty years. Give me a squad and we'll hand the planet back to the people who live on it."</p>
    </div>

    <section class="squad-block">
      <h2>Your Squad <span class="count">${roster.length}</span></h2>
      ${
        roster.length === 0
          ? `<p class="empty">No soldiers yet. The best fighters on the planet are lining up for this — bring them aboard below.</p>`
          : `<div class="soldier-grid">${roster.map((s) => soldierCard(s, false)).join("")}</div>`
      }
    </section>

    <section class="recruit-block">
      <h2>Recruits Available <span class="count">${recruits.length}</span></h2>
      ${
        recruits.length === 0
          ? `<p class="empty">No recruits left. Word travels — more will come looking for work.</p>`
          : `<div class="soldier-grid">${recruits.map((s) => soldierCard(s, true)).join("")}</div>`
      }
    </section>
  `;
}

function soldierCard(s, hireable) {
  const affordable = state.money >= s.cost;
  const displayName = s.callsign ? `${s.name} <span class="callsign">"${s.callsign}"</span>` : s.name;
  const ageOrigin = [s.age ?? "age unknown", s.origin].join(" · ");

  return `
    <article class="soldier-card">
      <div class="card-head">
        <div class="portrait" style="background:${portraitColor(s.name)}">${initials(s)}</div>
        <div class="who">
          <div class="name">${displayName}</div>
          <div class="sub">${ageOrigin}</div>
        </div>
      </div>
      <p class="bio">${s.bio}</p>
      <div class="stats">
        ${Object.keys(STAT_LABELS).map((k) => statBar(k, s.stats[k])).join("")}
      </div>
      <div class="traits">
        ${s.traits.map((t) => `<span class="trait">${t}</span>`).join("")}
      </div>
      ${
        hireable
          ? `<div class="card-foot">
               <span class="cost">§ ${s.cost.toLocaleString()}</span>
               <button class="hire-btn" data-action="hire" data-id="${s.id}" ${affordable ? "" : "disabled"}>
                 ${affordable ? "Hire" : "Can't afford"}
               </button>
             </div>`
          : `<div class="card-foot enlisted"><span class="enlisted-tag">✓ Enlisted</span></div>`
      }
    </article>
  `;
}

function statBar(key, value) {
  return `
    <div class="stat">
      <span class="stat-label">${STAT_LABELS[key]}</span>
      <span class="stat-track"><span class="stat-fill" style="width:${value * 10}%"></span></span>
      <span class="stat-num">${value}</span>
    </div>
  `;
}

// ---- Helpers --------------------------------------------------------------

function initials(s) {
  const parts = s.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return s.name.slice(0, 2).toUpperCase();
}

// Deterministic color per name so a soldier always looks the same.
function portraitColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 32%)`;
}

// ---- Interaction ----------------------------------------------------------

app.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "nav") {
    currentLocation = btn.dataset.loc;
    render();
  } else if (action === "hire") {
    const result = hire(btn.dataset.id);
    flash = result.ok
      ? { kind: "good", text: "Recruit enlisted — already suited up and asking when we deploy." }
      : { kind: "bad", text: result.reason };
    render();
  }
});

render();
