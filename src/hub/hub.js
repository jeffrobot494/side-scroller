// ---------------------------------------------------------------------------
// HUB (base + meta UI)  — the DOM half of the app.
//
// Renders every non-action screen: the five bunker rooms (Barracks, Engineering,
// Operations, Robotics, War Room), the deploy screen that carries a squad into a
// mission, the post-mission results, and the campaign win/lose report. It owns
// no game rules — every mutation goes through the state actions — and it launches
// missions through the `api` handed in by main.js.
// ---------------------------------------------------------------------------

import {
  hire,
  commission,
  sellAllLoot,
  advanceDay,
  livingRoster,
} from "../game/state.js";
import { BLUEPRINTS, WEAPONS, TUNING } from "../game/content.js";

const LOCATIONS = [
  { id: "barracks", label: "Barracks", icon: "🪖", staff: "Sgt. Bishop" },
  { id: "engineering", label: "Engineering", icon: "🔧", staff: "Dr. Halden" },
  { id: "operations", label: "Operations", icon: "🛰️", staff: "Cmdr. Voss" },
  { id: "robotics", label: "Robotics", icon: "🤖", staff: "Icarus" },
  { id: "warroom", label: "War Room", icon: "🗺️", staff: "The Council" },
];

const STAT_LABELS = { aim: "Aim", health: "Health", speed: "Speed", nerve: "Nerve" };

export class Hub {
  constructor(root, game, api) {
    this.root = root;
    this.game = game;
    this.api = api; // { startMission(mission, level, squad) }
    this.location = "barracks";
    this.mode = "hub"; // hub | deploy | results | end
    this.flash = null;
    this.deploy = null; // { missionId, selected:Set, weapons:{soldierId:weaponId} }
    this.result = null;

    this.root.addEventListener("click", (e) => this._onClick(e));
    this.root.addEventListener("change", (e) => this._onChange(e));
  }

  setFlash(kind, text) {
    this.flash = { kind, text };
  }

  showResults(result) {
    this.result = result;
    this.sold = false;
    this.mode = "results";
    this.render();
  }

  // ---- top-level render ---------------------------------------------------

  render() {
    const g = this.game;
    if (g.outcome && this.mode !== "results") this.mode = "end";

    if (this.mode === "end") {
      this.root.innerHTML = this._endScreen();
      return;
    }

    let body;
    if (this.mode === "deploy") body = this._deployScreen();
    else if (this.mode === "results") body = this._resultsScreen();
    else body = this._locationPanel(this.location);

    this.root.innerHTML = `
      ${this._topbar()}
      <div class="layout">
        <nav class="locations">${LOCATIONS.map((l) => this._locButton(l)).join("")}</nav>
        <main class="panel">
          ${this.flash ? `<div class="flash flash-${this.flash.kind}">${this.flash.text}</div>` : ""}
          ${body}
        </main>
      </div>
    `;
    this.flash = null;
  }

  _topbar() {
    const g = this.game;
    const h = g.campaignHealth;
    const color = h > 50 ? "var(--good)" : h > 25 ? "var(--credits)" : "var(--bad)";
    return `
      <header class="topbar">
        <div class="brand">XCOM&nbsp;TASK&nbsp;FORCE</div>
        <div class="resources">
          <span class="day">Day ${g.day}</span>
          <span class="health-chip" title="Campaign health — reach 0 and the invasion wins.">
            Sector
            <span class="health-track"><span class="health-fill" style="width:${h}%;background:${color}"></span></span>
            ${h}
          </span>
          <span class="credits">§ ${g.money.toLocaleString()}</span>
          <span class="roster-count">${livingRoster(g).length} on roster</span>
          <a class="dev-link" href="./editor.html" title="Open the settings & tuning editor">⚙</a>
        </div>
      </header>`;
  }

  _locButton(loc) {
    const active = loc.id === this.location && this.mode === "hub" ? " active" : "";
    return `
      <button class="loc${active}" data-action="nav" data-loc="${loc.id}">
        <span class="loc-icon">${loc.icon}</span>
        <span class="loc-text">
          <span class="loc-label">${loc.label}</span>
          <span class="loc-staff">${loc.staff}</span>
        </span>
      </button>`;
  }

  _header(loc) {
    return `
      <div class="location-header">
        <h1>${loc.icon} ${loc.label}</h1>
        <p class="staff-line">${loc.staff}</p>
      </div>`;
  }

  _locationPanel(id) {
    switch (id) {
      case "barracks":
        return this._barracks();
      case "engineering":
        return this._engineering();
      case "operations":
        return this._operations();
      case "warroom":
        return this._warroom();
      default: {
        const loc = LOCATIONS.find((l) => l.id === id);
        return `
          ${this._header(loc)}
          <div class="placeholder">
            <p>${loc.label} isn't operational yet.</p>
            <p class="muted">Deferred past the vertical slice — Icarus is still assembling his workshop.</p>
          </div>`;
      }
    }
  }

  // ---- Barracks -----------------------------------------------------------

  _barracks() {
    const g = this.game;
    const roster = livingRoster(g);
    const recruits = g.recruits;
    return `
      <div class="location-header">
        <h1>🪖 Barracks</h1>
        <p class="staff-line">Sgt. Bishop — "Best recruits I've laid eyes on in twenty years. Give me a squad and we'll hand the planet back to the people who live on it."</p>
      </div>
      <section class="squad-block">
        <h2>Your Squad <span class="count">${roster.length}</span></h2>
        ${
          roster.length === 0
            ? `<p class="empty">No soldiers yet. Bring the best fighters on the planet aboard below.</p>`
            : `<div class="soldier-grid">${roster.map((s) => this._soldierCard(s, false)).join("")}</div>`
        }
      </section>
      <section class="recruit-block">
        <h2>Recruits Available <span class="count">${recruits.length}</span></h2>
        ${
          recruits.length === 0
            ? `<p class="empty">No recruits left. Word travels — more will come looking for work.</p>`
            : `<div class="soldier-grid">${recruits.map((s) => this._soldierCard(s, true)).join("")}</div>`
        }
      </section>`;
  }

  _soldierCard(s, hireable) {
    const g = this.game;
    const affordable = g.money >= s.cost;
    const displayName = s.callsign
      ? `${s.name} <span class="callsign">"${s.callsign}"</span>`
      : s.name;
    const ageOrigin = [s.age ?? "age unknown", s.origin].join(" · ");
    const rec =
      s.record && s.record.missions
        ? `<div class="record">${s.record.missions} missions · ${s.record.kills} kills</div>`
        : "";
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
        <div class="stats">${Object.keys(STAT_LABELS).map((k) => statBar(k, s.stats[k])).join("")}</div>
        <div class="traits">${s.traits.map((t) => `<span class="trait">${t}</span>`).join("")}</div>
        ${rec}
        ${
          hireable
            ? `<div class="card-foot">
                 <span class="cost">§ ${s.cost.toLocaleString()}</span>
                 <button class="btn" data-action="hire" data-id="${s.id}" ${affordable ? "" : "disabled"}>
                   ${affordable ? "Hire" : "Can't afford"}
                 </button>
               </div>`
            : `<div class="card-foot enlisted"><span class="enlisted-tag">✓ Enlisted</span></div>`
        }
      </article>`;
  }

  // ---- Engineering --------------------------------------------------------

  _engineering() {
    const g = this.game;
    const building = g.building
      .map(
        (b) =>
          `<li><span>${b.name}</span><span class="muted">${b.daysLeft} day(s) left</span></li>`
      )
      .join("");
    const armory = g.armory
      .map((w) => `<li><span>${w.name}</span><span class="muted">budget ${w.budgetSpent}</span></li>`)
      .join("");

    const cards = BLUEPRINTS.map((bp) => {
      const owned = g.armory.some((w) => w.id === bp.weapon.id);
      const inProgress = g.building.some((b) => b.blueprintId === bp.id);
      const affordable = g.money >= bp.cost;
      const fx = bp.weapon.effects
        .map((e) => (e.kind === "damage" ? `dmg ${e.amount}` : `burn ${e.dps}/s`))
        .join(" · ");
      let btn;
      if (owned) btn = `<button class="btn" disabled>In armory</button>`;
      else if (inProgress) btn = `<button class="btn" disabled>Fabricating…</button>`;
      else
        btn = `<button class="btn" data-action="commission" data-id="${bp.id}" ${
          affordable ? "" : "disabled"
        }>${affordable ? `Commission · §${bp.cost}` : "Can't afford"}</button>`;
      return `
        <article class="blueprint">
          <div class="bp-head"><h3>${bp.name}</h3><span class="bp-time">${bp.buildDays}d build</span></div>
          <p class="bp-prompt">${bp.prompt}</p>
          <div class="bp-stats">${fx} · fire rate ${bp.weapon.fireRate}/s</div>
          <div class="card-foot">${btn}</div>
        </article>`;
    }).join("");

    return `
      <div class="location-header">
        <h1>🔧 Engineering</h1>
        <p class="staff-line">Dr. Halden — "Describe what you want it to do. I'll turn it into something that fits the budget and won't blow your soldier's hands off. Probably."</p>
      </div>
      <section class="squad-block">
        <h2>Commission a Weapon</h2>
        <p class="muted">Fabrication takes time — advance the day in the War Room to finish a build. Finished weapons appear in the armory and can be assigned on deploy.</p>
        <div class="blueprint-grid">${cards}</div>
      </section>
      <section class="recruit-block two-col">
        <div>
          <h2>In Fabrication <span class="count">${g.building.length}</span></h2>
          ${building ? `<ul class="plain-list">${building}</ul>` : `<p class="empty">Nothing on the line.</p>`}
        </div>
        <div>
          <h2>Armory <span class="count">${g.armory.length}</span></h2>
          <ul class="plain-list">${armory}</ul>
        </div>
      </section>`;
  }

  // ---- Operations (missions + stores) -------------------------------------

  _operations() {
    const g = this.game;
    const canDeploy = livingRoster(g).length > 0;
    const rows = g.leads.length
      ? g.leads
          .map((m) => {
            const status = `<span class="tag tag-diff-${m.difficulty.toLowerCase()}">${m.difficulty} threat</span>`;
            const action = `<button class="btn" data-action="predeploy" data-id="${m.id}" ${
              canDeploy ? "" : "disabled"
            }>${canDeploy ? "Deploy squad" : "No soldiers"}</button>`;
            return `
        <article class="mission-row ${m.winsCampaign ? "is-boss" : ""}">
          <div class="mission-main">
            <div class="mission-title">${m.name} ${status}</div>
            <p class="mission-brief">${m.brief}</p>
            ${m.winsCampaign ? `<div class="win-flag">★ Destroying this ends the invasion in the sector.</div>` : ""}
          </div>
          <div class="mission-action">${action}</div>
        </article>`;
          })
          .join("")
      : `<p class="empty">Ops is still scanning the sector. Advance a day for fresh leads.</p>`;

    const stores = g.stores;
    const total = stores.reduce((s, i) => s + i.value, 0);
    const storeList = stores.length
      ? `<ul class="plain-list">${stores
          .map((i) => `<li><span>${i.name}</span><span class="credits">§${i.value}</span></li>`)
          .join("")}</ul>`
      : `<p class="empty">No recovered loot in stores.</p>`;

    return `
      <div class="location-header">
        <h1>🛰️ Operations</h1>
        <p class="staff-line">Cmdr. Voss — "The map's lighting up. Pick your fights, Commander. And bring your people home."</p>
      </div>
      <section class="squad-block">
        <h2>Available Operations</h2>
        <div class="mission-list">${rows}</div>
      </section>
      <section class="recruit-block">
        <h2>Stores <span class="count">${stores.length}</span></h2>
        ${storeList}
        <div class="card-foot">
          <span class="cost">Total value: § ${total.toLocaleString()}</span>
          <button class="btn" data-action="sell" ${stores.length ? "" : "disabled"}>Sell all loot</button>
        </div>
      </section>`;
  }

  // ---- War Room -----------------------------------------------------------

  _warroom() {
    const g = this.game;
    const h = g.campaignHealth;
    const color = h > 50 ? "var(--good)" : h > 25 ? "var(--credits)" : "var(--bad)";
    const log = g.log
      .slice(0, 12)
      .map((e) => `<li><span class="muted">Day ${e.day}</span> ${e.text}</li>`)
      .join("");
    return `
      <div class="location-header">
        <h1>🗺️ War Room</h1>
        <p class="staff-line">The Council — "The clock does not stop for grief, Commander. Every day you wait, they dig deeper."</p>
      </div>
      <section class="squad-block">
        <h2>Campaign Health</h2>
        <div class="big-meter"><span class="big-fill" style="width:${h}%;background:${color}"></span></div>
        <p class="muted">Sector integrity at <strong>${h}</strong>. The invasion advances <strong>${TUNING.doomPerDay}</strong> each day. Reach 0 and the sector falls. Clear enough operations and the trail to the hive's command node surfaces in Ops — end it there.</p>
        <div class="card-foot">
          <span class="cost">Day ${g.day}</span>
          <button class="btn" data-action="advance">Advance the day ▸</button>
        </div>
      </section>
      <section class="recruit-block">
        <h2>Campaign Log</h2>
        ${log ? `<ul class="log-list">${log}</ul>` : `<p class="empty">Nothing logged yet.</p>`}
      </section>`;
  }

  // ---- Deploy screen ------------------------------------------------------

  _deployScreen() {
    const g = this.game;
    const mission = g.leads.find((l) => l.id === this.deploy.missionId);
    const roster = livingRoster(g);
    const sel = this.deploy.selected;

    const cards = roster
      .map((s) => {
        const chosen = sel.has(s.id);
        const wId = this.deploy.weapons[s.id] || s.weaponId || "carbine";
        const options = g.armory
          .map(
            (w) => `<option value="${w.id}" ${w.id === wId ? "selected" : ""}>${w.name}</option>`
          )
          .join("");
        return `
          <article class="soldier-card deploy-card ${chosen ? "chosen" : ""}">
            <div class="card-head">
              <div class="portrait" style="background:${portraitColor(s.name)}">${initials(s)}</div>
              <div class="who">
                <div class="name">${s.name}</div>
                <div class="sub">Aim ${s.stats.aim} · Health ${s.stats.health} · Speed ${s.stats.speed}</div>
              </div>
            </div>
            <div class="deploy-controls">
              <label class="weapon-pick">Weapon
                <select data-action="weapon" data-id="${s.id}" ${chosen ? "" : "disabled"}>${options}</select>
              </label>
              <button class="btn ${chosen ? "btn-alt" : ""}" data-action="toggle" data-id="${s.id}">
                ${chosen ? "Remove" : "Add to squad"}
              </button>
            </div>
          </article>`;
      })
      .join("");

    return `
      <div class="location-header">
        <h1>🛰️ Deploy — ${mission.name}</h1>
        <p class="staff-line">${mission.brief}</p>
      </div>
      <section class="squad-block">
        <h2>Choose up to 3 <span class="count">${sel.size}/3</span></h2>
        <p class="muted">You control one soldier; the rest fight as AI companions and control swaps on death. <strong>Anyone who dies is gone for good.</strong></p>
        <div class="soldier-grid">${cards}</div>
      </section>
      <div class="deploy-bar">
        <button class="btn btn-ghost" data-action="cancel-deploy">Cancel</button>
        <button class="btn btn-go" data-action="launch" ${sel.size ? "" : "disabled"}>
          Launch mission (${sel.size}) ▸
        </button>
      </div>`;
  }

  // ---- Results screen -----------------------------------------------------

  _resultsScreen() {
    const g = this.game;
    const r = this.result;
    const casualtyNames = r.casualties
      .map((id) => this._nameFor(id))
      .filter(Boolean);
    const lootTotal = r.loot.reduce((s, i) => s + i.value, 0);

    const lootList = r.loot.length
      ? `<ul class="plain-list">${r.loot
          .map((i) => `<li><span>${i.name}</span><span class="credits">§${i.value}</span></li>`)
          .join("")}</ul>`
      : `<p class="empty">No loot recovered.</p>`;

    const casualtyBlock = casualtyNames.length
      ? `<ul class="kia-list">${casualtyNames.map((n) => `<li>✝ ${n} — killed in action</li>`).join("")}</ul>`
      : `<p class="all-survived">Everyone came home.</p>`;

    const ribbon = r.success
      ? `<div class="result-ribbon win">MISSION SUCCESS</div>`
      : `<div class="result-ribbon loss">MISSION FAILED</div>`;

    const next =
      g.outcome === "won"
        ? `<button class="btn btn-go" data-action="view-end">View final report ▸</button>`
        : `<button class="btn btn-go" data-action="return">Return to base ▸</button>`;

    return `
      ${ribbon}
      <div class="results-body">
        <div class="result-col">
          <h2>Casualties</h2>
          ${casualtyBlock}
        </div>
        <div class="result-col">
          <h2>Recovered <span class="count">${r.loot.length}</span></h2>
          ${lootList}
          <div class="card-foot">
            <span class="cost">Enemy kills: ${r.kills}</span>
            ${
              r.success && r.loot.length
                ? `<button class="btn" data-action="sell" ${this.sold ? "disabled" : ""}>${
                    this.sold ? "Sold ✓" : `Sell recovered loot · §${lootTotal}`
                  }</button>`
                : ""
            }
          </div>
        </div>
      </div>
      <div class="deploy-bar">${next}</div>`;
  }

  _nameFor(id) {
    const s =
      this.game.roster.find((r) => r.id === id) ||
      (this._lastSquad && this._lastSquad.find((r) => r.id === id));
    return s ? s.name : null;
  }

  // ---- End (win/lose) screen ----------------------------------------------

  _endScreen() {
    const g = this.game;
    const won = g.outcome === "won";
    return `
      <div class="end-screen ${won ? "won" : "lost"}">
        <div class="end-badge">${won ? "★" : "☠"}</div>
        <h1>${won ? "SECTOR SECURED" : "SECTOR LOST"}</h1>
        <p class="end-text">${
          won
            ? "The hive command node is destroyed. The aliens are driven out of the sector — for now. Your surviving soldiers will be remembered for it."
            : "The invasion overwhelmed the sector before the hive could be reached. The task force is disbanded. This is what the doom clock buys."
        }</p>
        <div class="end-stats">
          <div><span>${g.day}</span>days survived</div>
          <div><span>${g.completedMissions.length}</span>missions won</div>
          <div><span>${g.roster.length}</span>soldiers still standing</div>
        </div>
        <button class="btn btn-go" data-action="restart">Start a new campaign</button>
      </div>`;
  }

  // ---- interaction --------------------------------------------------------

  _onChange(e) {
    const el = e.target.closest("[data-action='weapon']");
    if (!el) return;
    this.deploy.weapons[el.dataset.id] = el.value;
  }

  _onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const a = btn.dataset.action;
    const g = this.game;

    switch (a) {
      case "nav":
        this.mode = "hub";
        this.location = btn.dataset.loc;
        this.render();
        break;

      case "hire": {
        const res = hire(g, btn.dataset.id);
        this.setFlash(
          res.ok ? "good" : "bad",
          res.ok ? "Recruit enlisted — already suited up and asking when we deploy." : res.reason
        );
        this.render();
        break;
      }

      case "commission": {
        const res = commission(g, btn.dataset.id);
        this.setFlash(res.ok ? "good" : "bad", res.ok ? "Fabrication started. Advance the day to finish it." : res.reason);
        this.render();
        break;
      }

      case "sell": {
        const res = sellAllLoot(g);
        if (res.ok) {
          this.setFlash("good", `Sold ${res.count} item(s) for §${res.total}.`);
          if (this.mode === "results") this.sold = true;
        } else {
          this.setFlash("bad", res.reason);
        }
        this.render();
        break;
      }

      case "advance": {
        const res = advanceDay(g);
        if (res.ok && res.finished.length)
          this.setFlash("good", `A new day. Finished: ${res.finished.join(", ")}.`);
        else if (res.ok) this.setFlash("good", "A day passes. The clock ticks on.");
        else this.setFlash("bad", res.reason);
        this.render();
        break;
      }

      case "predeploy":
        this.deploy = { missionId: btn.dataset.id, selected: new Set(), weapons: {} };
        this.mode = "deploy";
        this.render();
        break;

      case "toggle": {
        const id = btn.dataset.id;
        const sel = this.deploy.selected;
        if (sel.has(id)) sel.delete(id);
        else if (sel.size < 3) sel.add(id);
        else this.setFlash("bad", "A squad is three soldiers at most.");
        this.render();
        break;
      }

      case "cancel-deploy":
        this.mode = "hub";
        this.location = "operations";
        this.render();
        break;

      case "launch":
        this._launch();
        break;

      case "return":
        this.result = null;
        this.mode = "hub";
        this.location = "operations";
        this.render();
        break;

      case "view-end":
        this.mode = "end";
        this.render();
        break;

      case "restart":
        window.location.reload();
        break;
    }
  }

  _launch() {
    const g = this.game;
    const mission = g.leads.find((l) => l.id === this.deploy.missionId);
    const level = mission.level;
    const squad = [];
    for (const s of livingRoster(g)) {
      if (!this.deploy.selected.has(s.id)) continue;
      const wId = this.deploy.weapons[s.id] || s.weaponId || "carbine";
      const weapon = g.armory.find((w) => w.id === wId) || WEAPONS.carbine;
      s.record.missions += 1;
      squad.push({ data: s, weapon });
    }
    // Remember who deployed so the results screen can still name the fallen
    // after they've been removed from the roster.
    this._lastSquad = squad.map((x) => x.data);
    this.api.startMission(mission, level, squad);
  }
}

// ---- shared helpers -------------------------------------------------------

function statBar(key, value) {
  return `
    <div class="stat">
      <span class="stat-label">${STAT_LABELS[key]}</span>
      <span class="stat-track"><span class="stat-fill" style="width:${value * 10}%"></span></span>
      <span class="stat-num">${value}</span>
    </div>`;
}

function initials(s) {
  const parts = s.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return s.name.slice(0, 2).toUpperCase();
}

function portraitColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 32%)`;
}
