// ---------------------------------------------------------------------------
// THE LOBBY — one link per seat  (tech/multiplayer-service.md, V3)
//
// V1 built rooms, V2 taught a browser to sit in one, and both left the seat
// token as something you dug out of a curl. This is the screen that hands it to
// a person: `index.html?room=3` opens a room and prints its three links, one of
// which you keep and the rest of which you send.
//
// It is NOT a hub screen, and that is why it is not in `src/hub/hub.js` despite
// living beside it. There is no session behind it, no view, no client and no
// commander — the page has not joined anything yet and may never join this
// room at all. It borrows `#hub-root` and the bunker's CSS and nothing else.
//
// Rendered as an HTML STRING into a container, with one delegated click
// listener, exactly as `src/hub/hub.js` renders: it means a suite can mount
// this against the harness's mock DOM and read what a person would see, which
// is the whole reason V3 is not another slice that lands only in `src/main.js`.
// ---------------------------------------------------------------------------

// A room of one commander is single-player with a process in the way, so the
// lobby starts at two. Six is `MAX_SEATS` in `src/net/rooms.js`; asking for more
// is clamped there too, and clamping here is what stops the screen promising
// seats the answer will not contain.
const MIN = 2;
const MAX = 6;

export function seatCount(asked) {
  const n = Math.floor(Number(asked));
  return Number.isFinite(n) ? Math.max(MIN, Math.min(MAX, n)) : MIN;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The screen, at whichever of its three moments it is in. PURE — the caller's
// `open` and `link` are already resolved by the time this is asked for a seat
// list, so this can be read by a test without a fetch anywhere near it.
export function lobbyHtml(state) {
  if (state.status === "opening") {
    return `<div class="lobby"><h1>Opening a room…</h1>
      <p class="lobby-lede">For ${state.players} commanders.</p></div>`;
  }
  if (state.status === "failed") {
    return `<div class="lobby"><h1>No room opened</h1>
      <p class="lobby-bad">${esc(state.error)}</p></div>`;
  }

  const seats = state.seats
    .map(
      (s) => `
      <li class="lobby-seat">
        <span class="lobby-name">${esc(s.name)}</span>
        <code class="lobby-url">${esc(s.url)}</code>
        <button class="lobby-copy" data-url="${esc(s.url)}">Copy</button>
        <a class="lobby-go" href="${esc(s.url)}" target="_blank" rel="noopener">Open ▸</a>
      </li>`
    )
    .join("");

  return `<div class="lobby">
      <h1>A room for ${state.seats.length}</h1>
      <p class="lobby-lede">One link per commander. Each is its own base, its own
        credits and its own roster, in one campaign on one clock — the day turns
        when everyone has readied.</p>
      <ol class="lobby-seats">${seats}</ol>
      <p class="lobby-warn">Send the links you are not keeping <em>before</em> you
        open yours: this screen is the only place they exist, and reloading it
        opens a different room. Whoever holds a link is that commander.</p>
    </div>`;
}

// Mount it. `open(spec)` opens the room (`openRoom` from src/net/remote.js) and
// `link(token)` turns a seat's token into its URL (`seatLink`), both injected so
// this module needs neither `fetch` nor `location` to be driven.
export function createLobby(root, opts = {}) {
  const players = seatCount(opts.players);
  const link = opts.link || ((token) => token);

  root.innerHTML = lobbyHtml({ status: "opening", players });

  // Copy, delegated — the rows do not exist yet when this is bound. The link is
  // ALSO rendered as selectable text beside the button, because a clipboard
  // write is refused outside a secure context and a lobby whose only affordance
  // failed silently would be a screen with no way to send anybody a seat.
  root.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest(".lobby-copy");
    if (!btn) return;
    const write = globalThis.navigator && navigator.clipboard && navigator.clipboard.writeText;
    if (!write) return;
    navigator.clipboard.writeText(btn.dataset.url).then(
      () => {
        btn.textContent = "Copied";
      },
      () => {}
    );
  });

  return opts.open({ players }).then(
    (room) => {
      root.innerHTML = lobbyHtml({
        status: "open",
        seats: room.seats.map((s) => ({ name: s.name, url: link(s.token) })),
      });
      return room;
    },
    (e) => {
      root.innerHTML = lobbyHtml({
        status: "failed",
        error: (e && e.message) || "The room could not be opened.",
      });
      return null;
    }
  );
}
