// ---------------------------------------------------------------------------
// HUB (base + meta UI)  — the DOM half of the app.
//
// Renders every non-action screen: the five bunker rooms (Barracks, Engineering,
// Operations, Robotics, War Room), the deploy screen that carries a squad into a
// mission, the post-mission results, and the campaign win/lose report. It owns
// no game rules and performs no campaign writes — every mutation is a COMMAND
// sent through the `api` handed in by main.js. Since S5 it does not launch
// missions either: Launch COMMITS a squad, and the page runs the round once
// every commander has readied.
//
// `this.game` is a session VIEW, not the campaign: read-through getters over
// whichever player this hub belongs to. It keeps its old name because every
// screen builder opens with `const g = this.game` and none of them care which
// commander it belongs to — which is exactly what makes `setView` a one-field
// swap rather than a rewrite. What stays here is UI state only — mode,
// location, flash, deploy, result, turn, sold, and _lastSquad.
// ---------------------------------------------------------------------------

import { livingRoster } from "../game/state.js";
import { BLUEPRINTS } from "../game/content.js";
import { config } from "../game/config.js";
import { soldierMaxHp } from "../game/soldiers.js";

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
    this.api = api; // { command(cmd), roundNext() }
    this.location = "barracks";
    this.mode = "hub"; // hub | deploy | results | end
    this.flash = null;
    this.deploy = null; // { missionId, selected:Set, weapons:{soldierId:weaponId} }
    this.result = null;
    this.turn = null; // the day summary a round's last mission report carried
    this.shareOpen = null; // lead id whose "Share with" list is open (S6)
    this.pending = null; // { action, id } while a command is in flight (W1)

    this.root.addEventListener("click", (e) => this._onClick(e));
    this.root.addEventListener("change", (e) => this._onChange(e));
  }

  setFlash(kind, text) {
    this.flash = { kind, text };
  }

  // Point this hub at another player (tech/multiplayer-state.md, S2). Every
  // screen builder re-reads `this.game`, so the swap is one assignment plus a
  // render.
  //
  // The transient UI is DROPPED, not parked per seat: it belongs to the
  // commander who made it, and half of it is dangerous to inherit. A deploy
  // picked by one player must not be launchable by the next, and `_lastSquad`
  // is on that list too — `_nameFor` falls back to it, so a surviving one would
  // print the other commander's dead. Since S3 dealt the recruit pool no
  // soldier id exists in two rosters, which makes that a stale name rather than
  // a plausible wrong one; dropping it is still the answer, because the squad
  // it holds is not this commander's to see. `location` survives, so you arrive
  // in the same room.
  setView(view) {
    this.game = view;
    this.mode = "hub";
    this.flash = null;
    this.deploy = null;
    this.result = null;
    this.turn = null;
    this.sold = false;
    this.shareOpen = null;
    this._lastSquad = null;
    this.pending = null; // an in-flight command belongs to the seat that sent it
    this.render();
  }

  // Called by the page when a mission is DISPATCHED, which since S5 is not the
  // same moment as the commit. `_nameFor` needs it because applyMissionResult
  // drops the dead from the roster before this screen renders, and the seat
  // follows the mission between each of a round's missions — so writing it at
  // commit would name the dead of the round's first mission and nobody after.
  noteDispatch(squad) {
    this._lastSquad = squad.map((x) => x.data);
  }

  // `turn` is the missionResult command's answer. Since S5 the round's day is
  // spent inside the LAST of its missions reporting, so this screen is the
  // only place the day summary can land — the route it used, the ready click's
  // flash, no longer carries one in any round where somebody deployed.
  // ---- sending (tech/multiplayer-session.md, W1) --------------------------

  // Send a command and reconcile when the answer lands. The answer is no longer
  // a return value, so every write site here is written against a callback and
  // will not change again when the loopback becomes a socket.
  //
  // The control that issued the command is marked COMMITTED immediately. That
  // is the optimistic half, and it is deliberately the BUTTON and never the
  // numbers: nothing derived from campaign state — money, the roster, the board,
  // the day — is predicted here, because predicting it means implementing the
  // campaign's rules a second time on this side of the wire. A refusal releases
  // the control and says why, which is the whole of "it snaps back".
  //
  // One command in flight at a time. In one process the answer beats the next
  // frame so this is never felt; over a wire it is what stops a second click
  // queueing a command against state the first one is about to change.
  _send(btn, cmd, onAnswer) {
    if (this.pending) return;
    this.pending = { action: btn.dataset.action, id: btn.dataset.id || null };
    this.render();
    this.api.command(cmd, (res) => {
      this.pending = null;
      onAnswer(res);
    });
  }

  // Applied after the screen is built, so no template has to know this exists.
  // Disabling is not decoration: _onClick ignores a disabled button, so the
  // in-flight control cannot be pressed twice.
  _markPending() {
    const p = this.pending;
    if (!p) return;
    const sel = p.id ? `[data-action="${p.action}"][data-id="${p.id}"]` : `[data-action="${p.action}"]`;
    const el = this.root.querySelector(sel);
    if (!el) return;
    el.disabled = true;
    // NOT "committed" — hub.css already gives that class to a lead row you have
    // deployed to, and reusing it would dim every committed mission on the board.
    el.classList.add("in-flight");
  }

  showResults(result, turn) {
    this.result = result;
    this.turn = turn && turn.dayTurned ? turn : null;
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
      this._markPending();
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
    this._markPending();
    this.flash = null;
  }

  _topbar() {
    const g = this.game;
    const h = g.campaignHealth;
    const color = h > 50 ? "var(--good)" : h > 25 ? "var(--credits)" : "var(--bad)";
    // Passing a day is global, but only from a room screen: the deploy screen
    // holds a lead by id and would dereference an expired one, and results is
    // mid-resolution. Both render this bar, so the control is disabled there.
    const canAdvance = this.mode === "hub";
    // At one commander the gate turns on the press — the presser is always the
    // last to ready — so the control keeps the name it has always had and
    // single-player reads exactly as it did. At two or more it becomes the
    // toggle mockup §1 draws, lit while you are ready.
    const force = g.taskForce || [];
    const solo = force.length < 2;
    const me = force.find((p) => p.id === g.playerId);
    const lit = !solo && me && me.ready;
    const label = solo ? "Advance the day ▸" : lit ? "Ready" : "Ready ▸";
    // Since S5 the day control is also what RUNS a committed squad — nothing
    // reaches a canvas until the round closes — so the tip says so when there
    // is something held. The label is deliberately unchanged: passing time is
    // still the thing being asked for, and a button that renames itself under
    // the cursor is worse than one that explains itself.
    const held = (g.pending || []).length;
    const tip = solo
      ? !canAdvance ? "Finish here first."
        : held ? "Advance the day — your committed squad deploys." : "Advance the day — the invasion advances too."
      : lit ? "Click again to stand down — it releases any deployment you have pending."
        : held ? "The round runs when every commander is ready." : "The day turns when every commander is ready.";
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
          <button class="btn btn-day${lit ? " btn-ready-on" : ""}" data-action="advance" ${canAdvance ? "" : "disabled"}
            title="${tip}">
            ${label}
          </button>
          <a class="dev-link" href="./editor.html" title="Open the settings & tuning editor">⚙</a>
        </div>
      </header>${this._taskforce(force, g.playerId)}`;
  }

  // Mockup §1. Hidden entirely at one commander, the same rule
  // src/hub/hotseat.js follows and for the same reason: index.html with no
  // query string must not grow a bar naming its only player.
  //
  // Readiness is ALL it shows. No credits, no roster, no lead counts, and
  // nothing about what a ready commander readied for — design/multiplayer.md
  // allows exactly this much and no more.
  _taskforce(force, mine) {
    if (force.length < 2) return "";
    const waiting = force.filter((p) => !p.ready).length;
    const chips = force
      .map(
        (p) => `<span class="pchip${p.ready ? " ready" : ""}${p.id === mine ? " me" : ""}">
            <span class="dot"></span>${p.name}
            <span class="st">${p.ready ? "ready" : "still deciding"}</span>
          </span>`
      )
      .join("");
    return `
      <div class="tfstrip">
        <span class="tflabel">Task force</span>
        ${chips}
        <span class="tfspacer"></span>
        <span class="tfnote">${
          waiting ? `Waiting on ${waiting} · the day turns when everyone is ready` : "Everyone is ready."
        }</span>
      </div>`;
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
    // Roster soldiers carry persistent wounds; recruits are always at full HP.
    const max = soldierMaxHp(s);
    const hp =
      !hireable
        ? `<div class="record">HP ${max - (s.wounds || 0)} / ${max}</div>`
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
        ${hp}
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
        <p class="muted">Fabrication takes time — a build finishes when a day passes. Finished weapons appear in the armory and can be assigned on deploy.</p>
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
    const pending = g.pending || [];
    const rows = g.leads.length
      ? g.leads
          .map((m) => {
            const status = `<span class="tag tag-diff-${m.difficulty.toLowerCase()}">${m.difficulty} threat</span>`;
            // Leads rot. The boss carries no lifespan and shows no clock.
            const life =
              typeof m.daysLeft === "number"
                ? `<span class="tag tag-life${m.daysLeft <= 1 ? " urgent" : ""}">${
                    m.daysLeft === 1 ? "expires tomorrow" : `${m.daysLeft} days left`
                  }</span>`
                : "";
            // Committed, not launched (S5). The squad is held until every
            // commander has readied, so Operations has to say so — otherwise
            // the only evidence a deploy happened is a flash that is gone by
            // the next render.
            // Mockup §2. A MENU rather than a toggle at every commander count:
            // the two-player version is one button, and that button stops
            // working the moment a third joins. Hidden entirely at one
            // commander, the same rule that hides the switcher and the strip.
            // Commanders who already hold the lead are not offered — the
            // session refuses them anyway, but offering a no-op is a worse UI
            // than not offering it.
            const others = (g.taskForce || []).filter((p) => p.id !== g.playerId);
            const open = this.shareOpen === m.id;
            const share = others.length
              ? `<button class="btn btn-sm${open ? " btn-alt" : ""}" data-action="share-open" data-id="${m.id}">Share with ▾</button>` +
                (open
                  ? `<div class="sharemenu">${
                      others
                        .map((p) => `<button class="btn btn-sm" data-action="share" data-id="${m.id}" data-to="${p.id}">${p.name}</button>`)
                        .join("")
                    }</div>`
                  : "")
              : "";
            // Given to you by another commander, and by whom. Never who else
            // holds it — with the one exception below, the view does not carry
            // that and must not.
            const shared = m.sharedBy
              ? `<span class="tag tag-shared">shared by ${m.sharedBy.toUpperCase()}</span>`
              : "";
            // Where YOUR lead went, on your own board. Not a leak: you are the
            // one who sent it, and a disclosure with no visible consequence is
            // a decision made blind. Several names when a lead has been given
            // to several commanders.
            const gave = (m.sharedWith || []).length
              ? `<span class="tag tag-given">shared with ${m.sharedWith.map((n) => n.toUpperCase()).join(", ")}</span>`
              : "";
            const held = pending.find((c) => c.leadId === m.id);
            const action = `<button class="btn${held ? " btn-alt" : ""}" data-action="predeploy" data-id="${m.id}" ${
              canDeploy || held ? "" : "disabled"
            }>${held ? "Review squad" : canDeploy ? "Deploy squad" : "No soldiers"}</button>`;
            return `
        <article class="mission-row ${m.winsCampaign ? "is-boss" : ""}${held ? " committed" : ""}">
          <div class="mission-main">
            <div class="mission-title">${m.name} ${status} ${life} ${shared} ${gave} ${
              held ? `<span class="tag tag-committed">squad committed</span>` : ""
            }</div>
            <p class="mission-brief">${m.brief}</p>
            ${m.winsCampaign ? `<div class="win-flag">★ Destroying this ends the invasion in the sector.</div>` : ""}
          </div>
          <div class="mission-action">${action}${share}</div>
        </article>`;
          })
          .join("")
      : `<p class="empty">Ops is still scanning the sector. Pass a day for fresh leads.</p>`;

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
        <p class="muted">Sector integrity at <strong>${h}</strong>. The invasion advances <strong>${config.doomPerDay}</strong> each day. Reach 0 and the sector falls. Clear enough operations and the trail to the hive's command node surfaces in Ops — end it there.</p>
        <div class="card-foot">
          <span class="cost">Day ${g.day}</span>
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
                <div class="sub">Aim ${s.stats.aim} · Health ${s.stats.health} · Speed ${s.stats.speed} · HP ${soldierMaxHp(s) - (s.wounds || 0)}/${soldierMaxHp(s)}</div>
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

    // Mockup §3. The screen has to say out loud what the design already
    // decided: the choice locks when the last commander readies, and there is
    // no withdrawing after that. Hidden at one commander, where there is
    // nobody to wait for and the sentence would be a lie.
    const solo = (g.taskForce || []).length < 2;
    const committed = (g.pending || []).some((c) => c.leadId === this.deploy.missionId);
    const notice = solo
      ? ""
      : `<div class="commit-note">
          <b>Locked on ready.</b> When every commander has readied, this deployment is final —
          there is no withdrawing, and you will not know where anyone else went until it is over.
        </div>`;
    return `
      <div class="location-header">
        <h1>🛰️ Deploy — ${mission.name}</h1>
        <p class="staff-line">${mission.brief}</p>
      </div>
      <section class="squad-block">
        <h2>Choose up to 3 <span class="count">${sel.size}/3</span></h2>
        <p class="muted">You control one soldier; the rest fight as AI companions and control swaps on death. <strong>Anyone who dies is gone for good.</strong></p>
        <div class="soldier-grid">${cards}</div>
        ${notice}
      </section>
      <div class="deploy-bar">
        <button class="btn btn-ghost" data-action="cancel-deploy">Cancel</button>
        ${committed ? `<button class="btn btn-ghost" data-action="release-deploy">Release this deployment</button>` : ""}
        <button class="btn btn-go" data-action="launch" ${sel.size ? "" : "disabled"}>
          ${committed ? `Update commitment (${sel.size}) ▸` : `Commit squad (${sel.size}) ▸`}
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

    // Two of the three outcomes are an END for this commander and send them to
    // the final report; only a shared defeat does not. That is not a rule about
    // defeat, it is shipped single-player behaviour left alone — "Return to
    // base ▸" lands on the end screen one render later anyway.
    const next =
      g.outcome === "won" || g.outcome === "ended"
        ? `<button class="btn btn-go" data-action="view-end">View final report ▸</button>`
        : `<button class="btn btn-go" data-action="return">Return to base ▸</button>`;

    // Mockup §4. One line per other commander: which lead they took, or that
    // they held at base. Deliberately absent — whether they won, who died, and
    // what they carried out.
    const others = g.elsewhere || [];
    const elsewhere = others.length
      ? `<div class="elsewhere">
          <h4>Elsewhere today</h4>
          ${others
            .map(
              (e) => `<div class="ewrow"><span class="who">${e.name}</span><span>${
                e.leads.length ? `deployed to <b>${e.leads.join("</b>, <b>")}</b>` : "held at base"
              }</span></div>`
            )
            .join("")}
        </div>`
      : "";

    // The round's day turned inside the report that opened this screen, so its
    // summary has nowhere else to go. Same parts the ready click prints when
    // nobody deployed.
    const t = this.turn;
    const parts = [];
    if (t) {
      if (t.finished.length) parts.push(`Finished: ${t.finished.join(", ")}.`);
      if (t.expired.length) parts.push(`Lead lost: ${t.expired.join(", ")}.`);
      if (t.arrived.length) parts.push(`Ops has ${t.arrived.length} new lead(s).`);
    }
    const dayline = t
      ? `<div class="dayturn">A new day — day ${g.day}. ${parts.join(" ")}</div>`
      : "";

    return `
      ${ribbon}
      ${dayline}
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
      ${elsewhere}
      <div class="deploy-bar">${next}</div>`;
  }

  _nameFor(id) {
    const s =
      this.game.roster.find((r) => r.id === id) ||
      (this._lastSquad && this._lastSquad.find((r) => r.id === id));
    return s ? s.name : null;
  }

  // ---- End of campaign screen ---------------------------------------------

  // THREE outcomes, not two (S7, mockup §6). "Victory is individual and defeat
  // is collective" produces a third ending that is neither: another commander
  // won, so the campaign is over for you without a win or a failure. It names
  // nobody — who ended it never reaches a view, and the shared log's own line
  // ("The hive command node is destroyed") names nobody either.
  _endScreen() {
    const g = this.game;
    const END = {
      won: {
        badge: "★",
        title: "SECTOR SECURED",
        text: "The hive command node is destroyed. The aliens are driven out of the sector — for now. Your surviving soldiers will be remembered for it.",
      },
      ended: {
        badge: "—",
        title: "THE WAR ENDED WITHOUT YOU",
        text: "Another commander reached the hive command node first and destroyed it. The sector is saved. You did not fail, and you did not win.",
      },
      lost: {
        badge: "☠",
        title: "SECTOR LOST",
        text: "The invasion overwhelmed the sector before the hive could be reached. The task force is disbanded. This is what the doom clock buys.",
      },
    };
    // Anything unrecognised reads as the defeat, which is what the binary
    // ternary this replaced did with every value that was not "won".
    const kind = END[g.outcome] ? g.outcome : "lost";
    const end = END[kind];
    return `
      <div class="end-screen ${kind}">
        <div class="end-badge">${end.badge}</div>
        <h1>${end.title}</h1>
        <p class="end-text">${end.text}</p>
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

    switch (a) {
      case "nav":
        this.mode = "hub";
        this.location = btn.dataset.loc;
        this.render();
        break;

      case "hire": {
        this._send(btn, { type: "hire", recruitId: btn.dataset.id }, (res) => {
          this.setFlash(
            res.ok ? "good" : "bad",
            res.ok ? "Recruit enlisted — already suited up and asking when we deploy." : res.reason
          );
          this.render();
        });
        break;
      }

      case "commission": {
        this._send(btn, { type: "commission", blueprintId: btn.dataset.id }, (res) => {
          this.setFlash(res.ok ? "good" : "bad", res.ok ? "Fabrication started. It finishes when a day passes." : res.reason);
          this.render();
        });
        break;
      }

      case "sell": {
        this._send(btn, { type: "sellLoot" }, (res) => {
          if (res.ok) {
            this.setFlash("good", `Sold ${res.count} item(s) for §${res.total}.`);
            if (this.mode === "results") this.sold = true;
          } else {
            this.setFlash("bad", res.reason);
          }
          this.render();
        });
        break;
      }

      case "advance": {
        this._send(btn, { type: "ready" }, (res) => {
          // THREE outcomes, not two. A ready that is not the last one and a
          // stand-down are both `ok` and turn no day, so they carry no `finished`
          // / `expired` / `arrived` — reading those here is a TypeError on most
          // Ready clicks in a two-commander campaign, which is exactly the shape
          // this branch had before S4.
          if (!res.ok) this.setFlash("bad", res.reason);
          else if (res.roundClosed) {
            // The FOURTH answer (S5): everyone readied, the choices locked, and
            // the round's missions are about to run. No day yet — it turns when
            // the last of them reports. Without this arm it falls below and
            // prints "Waiting on 0 more."
            this.setFlash("good", `The task force is committed. ${res.missions} mission(s) to run.`);
          } else if (!res.dayTurned) {
            this.setFlash(
              "good",
              res.ready
                ? `Ready. Waiting on ${res.waitingOn} more.`
                : "Stood down. Any pending deployment is released."
            );
          } else {
            const parts = [];
            if (res.finished.length) parts.push(`Finished: ${res.finished.join(", ")}.`);
            if (res.expired.length) parts.push(`Lead lost: ${res.expired.join(", ")}.`);
            if (res.arrived.length) parts.push(`Ops has ${res.arrived.length} new lead(s).`);
            this.setFlash(
              res.expired.length ? "bad" : "good",
              parts.length ? `A new day. ${parts.join(" ")}` : "A day passes. The clock ticks on."
            );
          }
          this.render();
        });
        break;
      }

      // Opening one menu closes any other: two open lists on one screen read
      // as two pending shares.
      case "share-open":
        this.shareOpen = this.shareOpen === btn.dataset.id ? null : btn.dataset.id;
        this.render();
        break;

      case "share": {
        this._send(btn, { type: "share", leadId: btn.dataset.id, to: btn.dataset.to }, (res) => {
          this.shareOpen = null;
          this.setFlash(
            res.ok ? "good" : "bad",
            res.ok ? `${res.leadName} shared with ${res.toName}. They can deploy to it now.` : res.reason
          );
          this.render();
        });
        break;
      }

      case "predeploy": {
        // Reopening a lead you already committed to restores the squad and the
        // weapons you picked — the session kept the weapon map for exactly
        // this, because the selects re-render off it.
        const id = btn.dataset.id;
        const held = (this.game.pending || []).find((c) => c.leadId === id);
        this.deploy = {
          missionId: id,
          selected: new Set(held ? held.soldierIds : []),
          weapons: held ? { ...held.weapons } : {},
        };
        this.mode = "deploy";
        this.render();
        break;
      }

      case "release-deploy": {
        this._send(btn, { type: "release", leadId: this.deploy.missionId }, (res) => {
          this.setFlash(res.ok ? "good" : "bad", res.ok ? "Deployment released. The squad stands down." : res.reason);
          this.mode = "hub";
          this.location = "operations";
          this.render();
        });
        break;
      }

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
        this._launch(btn);
        break;

      case "return":
        this.result = null;
        this.turn = null;
        this.mode = "hub";
        this.location = "operations";
        this.render();
        // The queue's only pacing signal. The page decides whether there is
        // anything left in the round; this click is just "I have finished
        // reading". Starting the next mission from the completion callback
        // would destroy this screen before it was read.
        if (this.api.roundNext) this.api.roundNext();
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

  // Launch stopped starting a mission at S5 and started HOLDING one. The
  // session assembles and keeps the squad; nothing reaches a canvas until every
  // commander has readied, and the page — not this hub — is what takes the
  // round out. Re-committing to the same lead replaces the held choice, so this
  // is one command whether or not something was pending.
  _launch(btn) {
    this._send(
      btn,
      {
        type: "deploy",
        leadId: this.deploy.missionId,
        soldierIds: [...this.deploy.selected],
        weapons: this.deploy.weapons,
      },
      (res) => {
        if (!res.ok) {
          // Refused: the deploy screen stays exactly as it was, with the squad
          // still picked, so the commander can fix what was wrong.
          this.setFlash("bad", res.reason);
          this.render();
          return;
        }
        const solo = (this.game.taskForce || []).length < 2;
        this.setFlash(
          "good",
          solo
            ? `${res.leadName} — squad committed. Advance the day to run it.`
            : `${res.leadName} — squad committed. It runs when every commander is ready.`
        );
        this.mode = "hub";
        this.location = "operations";
        this.render();
      }
    );
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
