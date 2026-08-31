// ---------------------------------------------------------------------------
// THE ROOM REGISTRY — a session in a process, reached by token.
//
// Covers src/net/rooms.js (tech/multiplayer-service.md, V1). V1's only client
// and V1's whole guard, and it is worth being exact about what "whole" means:
//
// It CAN see everything the slice decides — that a command is routed by the
// token and not by anything the caller claims, that a seat's snapshot is that
// seat's projection and no other's, that a round reaches the commander who
// committed it and nobody else, and that every one of those payloads is data.
//
// It CANNOT see server.mjs. No suite imports it (it binds a port on load), so
// the three routes are guarded by curling them and, from V2, by playing it.
// That gap is stated in the spec rather than papered over here: what is in this
// file is the registry, which is exactly why the registry has no HTTP in it.
//
// It grew past the registry twice, both times for the same reason — a slice's
// substance turned out to be in a module rather than in `src/main.js`, and a
// module can be driven. V2 added the remote transport (`src/net/remote.js`,
// browser globals injected); V3 adds room creation, the seat link, and the
// lobby screen (`src/hub/lobby.js`, mounted against the harness's mock DOM).
// What is left genuinely unwatched is `src/main.js` and the milestone itself.
// ---------------------------------------------------------------------------

import { createRooms } from "../src/net/rooms.js";
import { createRemote, openRoom, seatLink } from "../src/net/remote.js";
import { createLobby, seatCount } from "../src/hub/lobby.js";
import { connect } from "../src/net/client.js";
import { assertData } from "../src/net/wire.js";
import { config, resetConfig } from "../src/game/config.js";
import { makeEl } from "./harness.mjs";

const threw = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// A stream, as the suite listens to one: `server.mjs` writes SSE frames here,
// this pushes onto an array.
function listener() {
  const events = [];
  const send = (event, data) => events.push({ event, data });
  return {
    send,
    events,
    of: (kind) => events.filter((e) => e.event === kind),
    last: (kind) => events.filter((e) => e.event === kind).pop(),
  };
}

export default async function run(t) {
  resetConfig();

  // ---- a room is seats, and a seat is a token -----------------------------
  {
    const rooms = createRooms();
    const room = rooms.createRoom({ players: 2 });

    t.eq("a room opens with the seats it was asked for", room.seats.length, 2);
    t.eq("...identified the way the session identifies them", room.seats.map((s) => s.playerId), ["p1", "p2"]);
    t.ok("...named, because the task-force strip prints who", room.seats.every((s) => typeof s.name === "string" && s.name));
    t.ok("a room is addressable", rooms.hasRoom(room.roomId));
    t.ok("...and a seat's token is not its id", room.seats.every((s) => s.token && s.token !== s.playerId));
    t.ok("two seats are two tokens", room.seats[0].token !== room.seats[1].token);

    // Two rooms are two campaigns. Nothing is shared between them, which is the
    // property that lets one process hold more than one game.
    const other = rooms.createRoom({ players: 2 });
    t.ok("two rooms are two rooms", other.roomId !== room.roomId && rooms.roomCount() === 2);
    t.ok("...with no token in common", !other.seats.some((s) => room.seats.some((r) => r.token === s.token)));
    t.ok("a token resolves to its own room", rooms.seatFor(other.seats[0].token).roomId === other.roomId);
    t.ok("an unknown token resolves to nobody", rooms.seatFor("not-a-token") === null);
    t.ok("...and so does none at all", rooms.seatFor(undefined) === null);

    // Single-player never comes through here, but a room of one is legal and a
    // room of many is capped — nothing may make a third commander impossible.
    t.eq("a room of one is legal", createRooms().createRoom({ players: 1 }).seats.length, 1);
    t.eq("a room of three is legal", createRooms().createRoom({ players: 3 }).seats.length, 3);
    t.eq("and the seat count is capped", createRooms().createRoom({ players: 99 }).seats.length, 6);
  }

  // ---- a command is routed by the token, not by what the caller says ------
  // The one authority that moved. A page is no longer the host and cannot be
  // trusted to say which commander it is; the registry decides.
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 2 });
    const [a] = seats;

    const answer = rooms.command(a.token, { type: "ready" });
    t.ok("a command is answered", answer && answer.ok === true);
    t.ok("...and the answer is data", !threw(() => assertData(answer, "answer to ready")));
    t.ok("the command was attributed to the token's seat",
      rooms.snapshot(a.token).taskForce.find((c) => c.id === "p1").ready === true);
    t.ok("...and not to the other one",
      rooms.snapshot(a.token).taskForce.find((c) => c.id === "p2").ready === false);

    // There is nowhere in a command to say who you are. A body that tries is
    // simply an unknown command field, and the seat is still the token's. Its
    // own room, because the ready above is the LAST ready in a two-seat room
    // with nobody deployed — which closes the round and turns the day, and a
    // turned day clears everyone's readiness.
    const fresh = createRooms();
    const impostor = fresh.createRoom({ players: 2 }).seats[1];
    fresh.command(impostor.token, { type: "ready", playerId: "p1" });
    const strip = fresh.snapshot(impostor.token).taskForce;
    t.ok("a command cannot claim a seat it does not hold", strip.find((c) => c.id === "p2").ready === true);
    t.ok("...and the seat it named is untouched", strip.find((c) => c.id === "p1").ready === false);

    // An unknown token is not a refused command — it is nobody. The routes turn
    // this into a 404 by asking `seatFor` first.
    t.ok("an unknown token cannot send a command", threw(() => rooms.command("not-a-token", { type: "ready" })));
    t.ok("...and holds no snapshot", rooms.snapshot("not-a-token") === null);
  }

  // ---- a payload that would not survive the wire is refused ---------------
  // The data rule, now load-bearing rather than didactic: this is the last
  // place a Map can be caught before it is silently reshaped into `{}` by a
  // real JSON.stringify on a real socket.
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 2 });
    t.ok("a command carrying a live object is refused",
      threw(() => rooms.command(seats[0].token, { type: "deploy", lead: { seenBy: new Map() } })));
    t.ok("...and a function too",
      threw(() => rooms.command(seats[0].token, { type: "deploy", onDone() {} })));
    // Refused BEFORE the session sees it: a rejected payload must not have moved
    // the campaign on its way to being rejected.
    t.eq("...without the day moving", rooms.snapshot(seats[0].token).day, 1);
  }

  // ---- a snapshot is one seat's projection, pushed ------------------------
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 2 });
    const [a, b] = seats;

    const snap = rooms.snapshot(a.token);
    t.ok("a seat has a snapshot before anyone has acted", !!snap);
    t.eq("...carrying its own seat", snap.playerId, "p1");
    t.ok("...and it is data all the way down", !threw(() => assertData(snap, "snapshot")));
    // What a commander may see did not widen because a real boundary appeared
    // underneath it. `seenBy` is the Map the projection exists to keep off the
    // wire; `level` and `report` are the fields S6 kept off a lead.
    t.ok("a lead crosses as its projection, never as a lead",
      snap.leads.every((l) => l.seenBy === undefined && l.level === undefined && l.report === undefined));

    const la = listener();
    const lb = listener();
    const detachA = rooms.attach(a.token, la.send);
    rooms.attach(b.token, lb.send);
    t.eq("attaching sends this seat's snapshot at once", la.of("snapshot").length, 1);
    t.eq("...and it is this seat's", la.last("snapshot").data.playerId, "p1");
    t.eq("...and the other seat gets its own", lb.last("snapshot").data.playerId, "p2");
    t.ok("an unknown token cannot attach", rooms.attach("not-a-token", () => {}) === null);
    t.eq("the registry knows how many streams a seat has", rooms.listeners(a.token), 1);

    // THE BROADCAST. p2 clicked nothing and its screen has to move anyway: the
    // other commander readying, the shared clock, a lead arriving on its board.
    rooms.command(a.token, { type: "ready" });
    t.eq("a command pushes a fresh snapshot to the seat that sent it", la.of("snapshot").length, 2);
    t.eq("...and to the seat that did not", lb.of("snapshot").length, 2);
    t.ok("...and the other seat sees the readiness it never asked for",
      lb.last("snapshot").data.taskForce.find((c) => c.id === "p1").ready === true);

    // Unconditional, for the reason W3 found: closeRound empties every pending
    // list and writes round.last before endRound can refuse the day, so a
    // refusal has already moved what three screens would draw.
    const n = lb.of("snapshot").length;
    rooms.command(a.token, { type: "hire", recruitId: "nobody-was-ever-hired" });
    t.ok("a refused command broadcasts too", lb.of("snapshot").length > n);

    // Detaching stops it. Nothing else about the seat changes — its campaign is
    // the room's, not its browser's.
    detachA();
    t.eq("a detached stream is not a listener", rooms.listeners(a.token), 0);
    const held = la.of("snapshot").length;
    rooms.command(b.token, { type: "sellLoot" });
    t.eq("...and is pushed nothing", la.of("snapshot").length, held);
    t.ok("...while its seat's snapshot is kept current anyway", rooms.snapshot(a.token).day >= 1);
  }

  // ---- a round reaches the seat that owns it, and nobody else -------------
  // The routing that replaces the host. In one page src/main.js drained the
  // whole round and sequenced it; here a dispatch is pushed at one seat, and
  // there is no call through which another seat could be handed one.
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 2 });
    const [a, b] = seats;
    const la = listener();
    const lb = listener();
    rooms.attach(a.token, la.send);
    rooms.attach(b.token, lb.send);

    // Deploy as whichever seat can see a lead. WHICH seat sees one is a coin
    // flip — rollVisibility stamps each lead against a random subset of
    // commanders — so picking p1 unconditionally is a flake, not a test.
    const mine = rooms.snapshot(a.token).leads.length ? a : b;
    const other = mine === a ? b : a;
    const heard = mine === a ? la : lb;
    const deaf = mine === a ? lb : la;

    // A campaign starts with no soldiers, so a deploy needs a hire first.
    rooms.command(mine.token, { type: "hire", recruitId: rooms.snapshot(mine.token).recruits[0].id });
    const view = rooms.snapshot(mine.token);
    const deployed = rooms.command(mine.token, {
      type: "deploy",
      leadId: view.leads[0].id,
      soldierIds: [view.roster[0].id],
    });
    t.ok("a deploy is accepted", deployed.ok === true);
    t.eq("a held choice is not a round", heard.of("dispatch").length, 0);

    rooms.command(mine.token, { type: "ready" });
    t.eq("...and readying alone does not close it", heard.of("dispatch").length, 0);
    const closed = rooms.command(other.token, { type: "ready" });
    t.ok("the last commander closes the round", closed.roundClosed === true);

    t.eq("the dispatch reaches the commander who committed it", heard.of("dispatch").length, 1);
    t.eq("...and no other seat is handed one", deaf.of("dispatch").length, 0);

    const d = heard.last("dispatch").data;
    t.ok("a dispatch is data", !threw(() => assertData(d, "dispatch")));
    t.eq("...projected, not the live lead", Object.keys(d.mission).sort(), ["id", "name", "seed"]);
    t.ok("...carrying the level the mission loads", !!d.level && !!d.level.platforms);
    t.ok("...and the routing the page reports on", typeof d.dispatchId === "string" && d.playerId === mine.playerId);

    // ORDERING. The session announces the round INSIDE run(), before `changed`
    // fires — so a dispatch pushed on arrival would reach the browser ahead of
    // the snapshot the same command produced, and a mission would start off a
    // campaign one command stale. The registry buffers it until the answer is
    // in hand, which is what makes this hold.
    const kinds = heard.events.map((e) => e.event);
    t.eq("the snapshot lands before the dispatch it belongs to", kinds[kinds.length - 2], "snapshot");
    t.eq("...and the dispatch is last", kinds[kinds.length - 1], "dispatch");

    // The report closes the flight, and it is routed by the token too.
    const done = rooms.command(mine.token, {
      type: "missionResult",
      dispatchId: d.dispatchId,
      result: {
        success: true, missionId: d.mission.id, survivors: [], casualties: [],
        killsBySoldier: [], woundsBySoldier: [], loot: [], kills: 0,
      },
    });
    t.ok("the mission reports back through the same seat", done.ok === true);
    t.ok("...and the round is over", rooms.command(mine.token, { type: "ready" }).ok === true);
  }

  // ---- a dispatch with nowhere to go is held, not dropped ----------------
  // The one thing a room has that a page never did: a seat can be listening to
  // nothing. What happens to a dispatch that was ALREADY delivered to a browser
  // that then vanished is Approximation 12, and is not this.
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 1 });
    const [only] = seats;

    rooms.command(only.token, { type: "hire", recruitId: rooms.snapshot(only.token).recruits[0].id });
    const view = rooms.snapshot(only.token);
    rooms.command(only.token, {
      type: "deploy",
      leadId: view.leads[0].id,
      soldierIds: [view.roster[0].id],
    });
    // Nothing is attached: the round closes into an empty room.
    const closed = rooms.command(only.token, { type: "ready" });
    t.ok("a round closes with no stream open", closed.roundClosed === true);

    const late = listener();
    rooms.attach(only.token, late.send);
    t.eq("a stream that opens afterwards is given the snapshot first", late.events[0].event, "snapshot");
    t.eq("...and then the dispatch that was waiting", late.of("dispatch").length, 1);
    t.ok("...whole", !!late.last("dispatch").data.level.platforms);

    // Delivered once. A second attach is a fresh snapshot and no replay — the
    // snapshot IS the whole campaign this seat may see, so there is no missed
    // delta for a reconnection to catch up on.
    const again = listener();
    rooms.attach(only.token, again.send);
    t.eq("a second stream is given the snapshot", again.of("snapshot").length, 1);
    t.eq("...and not the round again", again.of("dispatch").length, 0);
  }

  // -----------------------------------------------------------------------
  // THE REMOTE TRANSPORT (V2), driven against the real registry.
  //
  // The spec put src/net/remote.js outside the bar and said the guard was
  // playing it. It is a module with injectable `fetch` and `EventSource`, so
  // both halves of the wire can be driven here with no HTTP and no browser —
  // which leaves only src/main.js genuinely unwatched. It goes in THIS suite
  // rather than test/transport.test.mjs because that one is the loopback's and
  // the spec forbids editing it: a remote transport that made the loopback's
  // assertions move has been built by loosening the shape rather than matching
  // it.
  //
  // What this still CANNOT see: real latency, a real dropped connection, and
  // EventSource's own reconnect. Those are V3's playtest.
  // -----------------------------------------------------------------------

  // A stand-in for the browser's EventSource over the registry. It attaches on
  // a microtask rather than in the constructor, because a real one does and
  // because remote.js registers its listeners AFTER the constructor returns.
  function streamOver(rooms) {
    return class FakeStream {
      constructor(url) {
        this.listeners = new Map();
        this.onerror = null;
        const token = new URL(url, "http://x").searchParams.get("token");
        queueMicrotask(() => {
          // Frames carry TEXT, exactly as SSE does — parsing is remote.js's job
          // and a stub that handed over live objects would test nothing.
          this.detach = rooms.attach(token, (event, data) => {
            const fn = this.listeners.get(event);
            if (fn) fn({ data: JSON.stringify(data) });
          });
          if (!this.detach && this.onerror) this.onerror();
        });
      }
      addEventListener(type, fn) { this.listeners.set(type, fn); }
      close() { if (this.detach) this.detach(); }
    };
  }

  // The command route, as a fetch. `log` records when each call starts and ends,
  // which is how the serialisation below is observed.
  function fetchOver(rooms, log = []) {
    return (url, opts) => {
      const body = JSON.parse(opts.body);
      log.push(`start ${body.cmd.type}`);
      return Promise.resolve({
        json: () => {
          const answer = rooms.command(body.token, body.cmd);
          log.push(`end ${body.cmd.type}`);
          return Promise.resolve(answer);
        },
      });
    };
  }

  const settle = () => new Promise((r) => setTimeout(r, 0));

  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 2 });
    const [a, b] = seats;
    const log = [];

    // IT IS NOT READY WHEN IT RETURNS. This is the whole reason src/main.js
    // stopped constructing the hub at module top level.
    const pending = createRemote(a.token, { EventSource: streamOver(rooms), fetch: fetchOver(rooms, log) });
    t.ok("a remote transport is a promise, not a transport", typeof pending.then === "function");
    const remote = await pending;
    t.ok("...that resolves once the first snapshot has arrived", !!remote);

    t.eq("it knows its one seat", remote.playerIds(), ["p1"]);
    t.eq("...by name, off the task-force strip", remote.seat().name, "USA");

    // THE ROUND IS NOT ITS TO DRAIN. Absence, not a stub that returns [] — the
    // page forks on which name exists.
    t.ok("a room page is not the host", remote.takeRound === undefined);

    // The handle: the same object the loopback hands out, from the same module.
    const client = connect(remote, "p1");
    const h = client.view();
    t.ok("a seat's handle is an object, not an accessor", h && typeof h === "object");
    t.eq("...carrying the seat", h.playerId, "p1");
    t.ok("...and it is data all the way down", !threw(() => assertData({ ...h }, "snapshot")));
    t.ok("a handle for another seat is a throw, not a shrug", threw(() => remote.view("p2")));

    // A command crosses, is attributed to the token's seat, and answers.
    let answer = null;
    const returned = client.send({ type: "ready" }, (res) => { answer = res; });
    t.ok("send returns nothing", returned === undefined);
    t.ok("...and the answer has not arrived yet", answer === null);
    await settle();
    t.ok("the answer arrives later", answer && answer.ok === true);

    // ...and the handle READS THROUGH to the snapshot the broadcast pushed. A
    // handle that copied field values would still say `false` here.
    t.ok("the same handle sees the pushed snapshot",
      h.taskForce.find((c) => c.id === "p1").ready === true);

    // The repaint the page hangs its hub off. p2 acts; p1 clicked nothing.
    let repaints = 0;
    remote.watch(() => { repaints += 1; });
    rooms.command(b.token, { type: "sellLoot" });
    t.ok("a snapshot pushed from elsewhere repaints this page", repaints > 0);

    // A command that is not data fails AT THE SEND, synchronously, so the stack
    // still points at whoever built it. On the server an inbound body has
    // already been through JSON.parse, so this is now the ONLY place an
    // outbound command is checked at all.
    t.ok("a command carrying a live object is refused at the send",
      threw(() => client.send({ type: "deploy", lead: { seenBy: new Map() } }, () => {})));

    // COMMANDS ARE SERIALISED, one in flight per seat. The loopback's suite
    // pins "answers arrive in send order" and the page relies on it; `fetch`
    // does not claim it, so remote.js has to produce it.
    log.length = 0;
    const seen = [];
    client.send({ type: "hire", recruitId: "nobody" }, () => seen.push("a"));
    client.send({ type: "sellLoot" }, () => seen.push("b"));
    client.send({ type: "commission", blueprintId: "nobody" }, () => seen.push("c"));
    await settle();
    t.eq("answers arrive in send order", seen, ["a", "b", "c"]);
    t.eq("...because the next command is not sent until the last has answered",
      log, ["start hire", "end hire", "start sellLoot", "end sellLoot", "start commission", "end commission"]);
  }

  // ---- a lost command reads as a refused one ------------------------------
  // Every hub write site renders inside its answer callback, so a send that
  // never answers leaves a screen mid-click forever — a worse failure than a
  // wrong one, because nothing on screen says so.
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 1 });
    const remote = await createRemote(seats[0].token, {
      EventSource: streamOver(rooms),
      fetch: () => Promise.reject(new Error("network down")),
    });
    let answer = null;
    connect(remote, "p1").send({ type: "ready" }, (res) => { answer = res; });
    await settle();
    t.ok("a send that cannot reach the room still answers", answer !== null);
    t.ok("...in the session's own refusal shape", answer.ok === false && typeof answer.reason === "string");
  }

  // ---- a dispatch reaches the page, including one that beat the install ----
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 1 });
    const tok = seats[0].token;
    const remote = await createRemote(tok, { EventSource: streamOver(rooms), fetch: fetchOver(rooms) });
    const client = connect(remote, "p1");

    const v = client.view();
    await new Promise((d) => client.send({ type: "hire", recruitId: v.recruits[0].id }, d));
    await new Promise((d) =>
      client.send({ type: "deploy", leadId: v.leads[0].id, soldierIds: [v.roster[0].id] }, d)
    );
    // The round closes BEFORE the page has installed its dispatcher, which is
    // the ordering src/main.js cannot guarantee: `mount()` installs after the
    // transport resolves, and a dispatch can already be on the wire.
    await new Promise((d) => client.send({ type: "ready" }, d));

    const played = [];
    remote.onDispatch((d) => played.push(d));
    t.eq("a dispatch that arrived before the page was ready is not lost", played.length, 1);
    t.ok("...and it is this seat's, whole", played[0].playerId === "p1" && !!played[0].level.platforms);
    t.ok("...and it is data", !threw(() => assertData(played[0], "dispatch")));
  }

  // ---- a stale link does not hang the page --------------------------------
  // EventSource does not retry a non-200, so a page waiting on a room that will
  // never answer would wait forever. A bad token is the V3 failure a person
  // will actually hit: a link from a server that has since restarted.
  {
    const rooms = createRooms();
    rooms.createRoom({ players: 1 });
    let failed = null;
    try {
      await createRemote("not-a-token", { EventSource: streamOver(rooms), fetch: fetchOver(rooms) });
    } catch (e) {
      failed = e;
    }
    t.ok("a stale seat link rejects rather than hanging", failed !== null);
    t.ok("...saying so in words a player could act on", /room|link|stale/i.test(failed.message));
  }

  // -----------------------------------------------------------------------
  // THE SECOND BROWSER (V3): a room is opened, and a seat is a link.
  //
  // V1 built rooms and V2 taught a browser to sit in one; between them the seat
  // token was something you dug out of a curl. This is the slice that hands it
  // to a person, and the two halves of it that are not `src/main.js` are both
  // modules: `openRoom` + `seatLink` in src/net/remote.js, and the lobby screen
  // in src/hub/lobby.js.
  //
  // What this still CANNOT see is the milestone itself — two machines, a real
  // connection, a campaign played to the finale. That is the playtest.
  // -----------------------------------------------------------------------

  // The room route, as a fetch. Same shape as `fetchOver` above and separate
  // from it because this one answers a different route with a different body.
  function roomFetch(rooms) {
    return (url, opts) =>
      Promise.resolve({ json: () => Promise.resolve(rooms.createRoom(JSON.parse(opts.body))) });
  }

  // ---- a room is opened from the browser, and its seats are live ----------
  {
    const rooms = createRooms();
    const room = await openRoom({ players: 3 }, { fetch: roomFetch(rooms) });

    t.eq("a room opens with the seats that were asked for", room.seats.length, 3);
    t.ok("...named", room.seats.map((s) => s.name).join(",") === "USA,China,Brazil");
    t.ok("...and every token is a seat this registry knows",
      room.seats.every((s) => rooms.seatFor(s.token)));
    // The tokens are what a person is about to be handed, one each. Two seats
    // sharing one would be two commanders playing the same base.
    t.eq("every seat gets its own token", new Set(room.seats.map((s) => s.token)).size, 3);
  }

  // ---- a static server is the failure a person will actually hit ----------
  // Single-player is documented as `python3 -m http.server`, so the obvious way
  // to have this repo open in a browser has no room service in it at all: the
  // POST comes back 501 with some HTML and `r.json()` rejects. "Failed to fetch"
  // would send somebody hunting a network fault that is not there.
  {
    let failed = null;
    try {
      await openRoom({ players: 2 }, { fetch: () => Promise.reject(new Error("Failed to fetch")) });
    } catch (e) {
      failed = e;
    }
    t.ok("no service means a message naming the process to start",
      failed !== null && /server\.mjs/.test(failed.message));

    // And the shape check is not swallowed by that handler — a service that
    // answers with something that is not a room is a different fault.
    let shape = null;
    try {
      await openRoom({}, { fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true }) }) });
    } catch (e) {
      shape = e;
    }
    t.ok("...and an answer that is not a room is not reported as no answer",
      shape !== null && !/server\.mjs/.test(shape.message));
  }

  // ---- a seat link replaces the lobby's query, it does not extend it -------
  // The lobby's own URL is `?room=N`. A seat link that carried that forward
  // would open a FRESH ROOM every time somebody followed it — handing each
  // commander a private campaign while both believed they were sharing one,
  // which is a bug that looks like the game working.
  {
    const url = seatLink("http://box.local:8000/index.html?room=3#deploy", "abc123");
    t.eq("a seat link is the page, plus the seat, and nothing else",
      url, "http://box.local:8000/index.html?seat=abc123");
    t.ok("...built off the host that is handing it out, not localhost",
      url.startsWith("http://box.local:8000/"));
  }

  // ---- the link round-trips: opened here, joined as a real commander -------
  // The whole slice in one chain, and the assertion V3 exists for. A room is
  // opened, a link is made for its SECOND seat, the token is dug back out of
  // that link the way a browser would, and what connects is China — not the
  // seat that opened the room.
  {
    const rooms = createRooms();
    const room = await openRoom({ players: 2 }, { fetch: roomFetch(rooms) });
    const link = seatLink("http://box.local:8000/index.html?room=2", room.seats[1].token);
    const token = new URL(link).searchParams.get("seat");

    const guest = await createRemote(token, {
      EventSource: streamOver(rooms),
      fetch: fetchOver(rooms),
    });
    t.eq("following a seat link makes you that commander", guest.seat().id, "p2");
    t.eq("...by name", guest.seat().name, "China");
  }

  // ---- two browsers, one campaign -----------------------------------------
  // Both seats connected off their own links, and what one commander does shows
  // up on the other's screen with no click on that side. V2 pinned the pushed
  // snapshot with one remote; this is the same property with the two ends a
  // person actually has, which is what "two people, two machines, one campaign"
  // means when nobody is looking at a suite.
  {
    const rooms = createRooms();
    const room = await openRoom({ players: 2 }, { fetch: roomFetch(rooms) });
    const wire = { EventSource: streamOver(rooms), fetch: fetchOver(rooms) };
    const link = (i) => new URL(seatLink("http://x/index.html?room=2", room.seats[i].token))
      .searchParams.get("seat");

    const one = await createRemote(link(0), wire);
    const two = await createRemote(link(1), wire);

    let repaints = 0;
    two.watch(() => { repaints += 1; });

    const readyOf = (t2, id) => (t2.view().taskForce.find((p) => p.id === id) || {}).ready;
    t.ok("before anything, nobody is ready", !readyOf(two, "p1"));

    connect(one, "p1").send({ type: "ready" }, () => {});
    await settle();

    t.ok("one commander readying shows on the other's screen", readyOf(two, "p1"));
    t.ok("...without that browser having clicked anything", repaints > 0);
    // And the boundary still holds with two live ends: the strip is readiness
    // and nothing else, so a seat still cannot read the other's credits.
    t.eq("...and still shows only its own campaign", two.view().playerId, "p2");
  }

  // ---- the lobby prints one link per seat ---------------------------------
  // The screen itself, mounted against the harness's mock DOM. `src/main.js` is
  // what wires it to a real fetch and a real location; this is what a person
  // sees, which is the half that was previously invisible to the bar.
  {
    const rooms = createRooms();
    const root = makeEl();
    await createLobby(root, {
      players: "3",
      open: (spec) => openRoom(spec, { fetch: roomFetch(rooms) }),
      link: (token) => seatLink("http://box.local:8000/index.html?room=3", token),
    });

    const html = root.innerHTML;
    t.eq("the lobby prints one row per seat", (html.match(/class="lobby-seat"/g) || []).length, 3);
    t.ok("...naming each commander", /USA/.test(html) && /China/.test(html) && /Brazil/.test(html));
    t.ok("...with a full URL a person can send",
      (html.match(/http:\/\/box\.local:8000\/index\.html\?seat=/g) || []).length >= 3);
    // Selectable text AND a copy target: a clipboard write is refused outside a
    // secure context, and a lobby whose only affordance failed silently would be
    // a screen with no way to send anybody a seat.
    t.ok("...as text as well as a button", /<code class="lobby-url">http/.test(html));
    t.ok("...and says the links are shown once", /reloading/i.test(html));
  }

  // ---- the lobby is clamped to what a room can actually be ----------------
  // A room of one commander is single-player with a process in the way, and the
  // registry caps at six. Clamping here is what stops the screen promising
  // seats the answer will not contain.
  {
    t.eq("a lobby for nobody is a lobby for two", seatCount("1"), 2);
    t.eq("...as is a lobby for a word", seatCount("lots"), 2);
    t.eq("...and eight is six", seatCount("8"), 6);
    t.eq("what is asked for is what is opened", seatCount("4"), 4);
  }

  // ---- a lobby with no service says so, on the screen ---------------------
  {
    const root = makeEl();
    await createLobby(root, {
      players: 2,
      open: () => Promise.reject(new Error("No room service answered. A room needs `node server.mjs`.")),
    });
    t.ok("a lobby that cannot open a room prints the reason",
      /No room opened/.test(root.innerHTML) && /server\.mjs/.test(root.innerHTML));
    t.ok("...and prints no links it does not have", !/class="lobby-seat"/.test(root.innerHTML));
  }

  resetConfig();
  void config;
}
