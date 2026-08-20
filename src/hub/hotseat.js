// ---------------------------------------------------------------------------
// HOT-SEAT SWITCHER — whose base am I looking at.
//
// Mockup §7 of design/multiplayer.mockup.html, and the one module in this spec
// that is meant to be DELETED rather than extended: it exists so a shared
// campaign can be played and tuned before any server does, and it comes out
// when the session moves off the page (tech/multiplayer.md, T3).
//
// Mounted as a SIBLING of #hub-root, the way src/hub/fpsmeter.js is and for the
// same reason: Hub.render() replaces that element's innerHTML wholesale on every
// navigation, so anything parked inside it is wiped the first time you click a
// room. Being outside #hub-root also keeps it clear of the delegated click
// listener in src/main.js that voices a UI sound — this bar is development
// scaffolding, not a thing in the game to be clicked at.
//
// Hidden entirely at one player, so index.html with no query string is the
// single-player game with nothing added.
// ---------------------------------------------------------------------------

// players: [{ id, name }] in seat order. onSwap(id) is called only when the
// selection actually changes.
export function createHotSeat(players, onSwap) {
  const el = document.createElement("div");
  el.className = "hotseat";
  el.style.display = "none";

  const label = document.createElement("span");
  label.className = "hotseat-label";
  label.textContent = "Hot-seat";

  const select = document.createElement("select");
  for (const p of players) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `Viewing: ${p.name}`;
    select.appendChild(opt);
  }

  const note = document.createElement("span");
  note.className = "hotseat-note";
  note.textContent =
    `— one browser, one session, ${players.length} commanders. Deleted once there is a network.`;

  el.append(label, select, note);

  let current = players.length ? players[0].id : null;
  let sceneVisible = true;

  const onChange = () => {
    if (select.value === current) return;
    current = select.value;
    onSwap(current);
  };
  select.addEventListener("change", onChange);

  function paint() {
    // One commander is not a hot seat.
    el.style.display = sceneVisible && players.length > 1 ? "flex" : "none";
  }
  paint();

  return {
    el,
    playerId: () => current,
    // Follow a swap driven from somewhere other than this control.
    setPlayer(id) {
      current = id;
      select.value = id;
    },
    // Hidden during a mission: the hub is not on screen, and a seat swap
    // mid-mission would re-point the hub under a result that has not landed.
    setSceneVisible(v) {
      sceneVisible = v;
      paint();
    },
    dispose() {
      select.removeEventListener("change", onChange);
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
