// ---------------------------------------------------------------------------
// THE ROOM HOLDS THE MISSION  (tech/multiplayer-missions.md, J8)
//
// A new suite because this is a subsystem nothing tested: the mission wire, the
// room's flight, and the loop in `server.mjs` that steps a scene nobody's
// browser is simulating. Four sections, and they are four different questions:
//
//   1. The input frame        pure, in process
//   2. The snapshot           two REAL Missions, one playing room and one
//                             playing seat, compared field by field
//   3. The flight             `src/net/rooms.js` with a stub driver — the
//                             campaign-side rule, which is that the ROOM files
//                             both missionResults and pushes each commander
//                             their own day summary
//   4. The two-seat drive     `netproto/smoke.mjs`'s shape: spawn the real
//                             `server.mjs` on its own port, open a room, put
//                             two commanders on one lead, connect two mission
//                             sockets and drive them. It is the only thing here
//                             that can see the loop, the socket and `main.js`'s
//                             half of the fork at once — and it is in the bar,
//                             unlike the prototype's, because by J8 this is a
//                             subsystem rather than a probe.
//
// Section 4 spawns a process and talks HTTP to it. That is deliberate and it is
// the same instrument J6 added for a different reason: `server.mjs` binds a
// port on load, which is exactly why no suite imports it and exactly what a
// child process makes harmless.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Mission } from "../src/mission/mission.js";
import { generateLevel } from "../src/game/gen/levelgen.js";
import { createRooms } from "../src/net/rooms.js";
import { config } from "../src/game/config.js";
import {
  packInput, createWireInput, projectScene, applySnapshot, WIRE_ACTIONS,
} from "../src/net/mission-wire.js";
import { ACTIONS } from "../src/game/controlmap.js";

// The exception, restated here on purpose: a test that imported the production
// list would agree with it by construction and assert nothing.
const LOCAL = ["debugGraph", "debugPath"];

const SERVER = fileURLToPath(new URL("../server.mjs", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// An input that answers the three read names off a plain object, so a test can
// say "right is held, swap was tapped" without a device.
function stubInput(state = {}) {
  return {
    state,
    isDown: (a) => !!state.down?.[a],
    justPressed: (a) => !!state.pressed?.[a],
    aimSource: () => state.aim || null,
  };
}

function squadFor(ids, owner) {
  return ids.map((id) => ({
    data: { id, name: id, callsign: id.toUpperCase(), stats: { health: 5, aim: 5, speed: 5 }, wounds: 0 },
    weapon: { name: "Rifle", fireRate: 6, spread: 0.02, auto: true, magazine: 20, reloadTime: 1.4, projectile: { speed: 900, w: 8, h: 3, color: "#ffe08a", life: 1.1 }, effects: [{ kind: "damage", amount: 6 }] },
    owner,
  }));
}

export default async function run(t) {
  // ======================================================================
  // 1. THE INPUT FRAME
  // ======================================================================
  {
    const inp = createWireInput();
    const dev = stubInput({ down: { right: true, fire: true }, pressed: { swap: true } });
    const pkt = packInput(dev, 1, "gamepad", null);

    t.eq("input: the eight gameplay actions cross and the two debug ones do not",
      WIRE_ACTIONS.includes("debugGraph"), false);
    // EVERY action is classified — this is what a new one trips. WIRE_ACTIONS is
    // derived from ACTIONS minus a named local-only list, so adding "grenade" to
    // the control map puts it on the wire by default; the failure this guards is
    // somebody reintroducing a hand-written copy, which drifts silently and
    // leaves the other commander unable to do the new thing.
    const unclassified = ACTIONS.filter((a) => !WIRE_ACTIONS.includes(a) && !LOCAL.includes(a));
    t.ok(`input: every control-map action is on the wire or named local${unclassified.length ? ` — stray: ${unclassified}` : ""}`,
      unclassified.length === 0);
    // And the order IS the format: the bit is the index, so appending is safe
    // and reordering is not. Pinned so a tidy-up of ACTIONS reddens here rather
    // than turning one commander's jump into a crouch.
    t.eq("input: the wire order is the control map's order",
      WIRE_ACTIONS.join(","), "left,right,jump,crouch,aimUp,fire,swap,reload");
    t.ok("input: a packet is four small fields", Object.keys(pkt).sort().join(",") === "a,d,n,p");

    inp.receive(pkt);
    t.ok("input: nothing is readable before the step boundary", !inp.isDown("right"));
    inp.sample();
    t.ok("input: held crosses", inp.isDown("right") && inp.isDown("fire") && !inp.isDown("left"));
    t.ok("input: an edge crosses", inp.justPressed("swap") && !inp.justPressed("fire"));
    inp.sample();
    t.ok("input: ...and does not survive its own step", !inp.justPressed("swap"));
    t.ok("input: a hold does", inp.isDown("right"));

    // The reason edges are sent as well as holds. Two packets between one pair
    // of steps is the ordinary case at any snapshot rate, and `reload` is a tap
    // — deriving the edge from the current state, as netproto does, loses it.
    const two = createWireInput();
    two.receive(packInput(stubInput({ pressed: { reload: true } }), 1, "gamepad", null));
    two.receive(packInput(stubInput({ down: { left: true } }), 2, "gamepad", null));
    two.sample();
    t.ok("input: a tap that arrived in a coalesced packet is not lost",
      two.justPressed("reload") && two.isDown("left"));

    // Reordering is normal on a real path.
    const old = createWireInput();
    old.receive(packInput(stubInput({ down: { right: true } }), 5, "gamepad", null));
    old.receive(packInput(stubInput({ down: { left: true }, pressed: { jump: true } }), 2, "gamepad", null));
    old.sample();
    t.ok("input: an older packet never overwrites a newer hold", old.isDown("right") && !old.isDown("left"));
    t.ok("input: ...but its edge is still taken, because the tap happened", old.justPressed("jump"));
    t.eq("input: ack is the newest seq consumed", old.ack(), 5);

    // AIM. A stick is a direction and crosses as itself; a mouse is canvas
    // pixels and must NOT cross — the room holds one scene for two viewers.
    const stick = packInput(stubInput({ aim: { type: "stick", x: 0.6, y: -0.8 } }), 1, "gamepad", null);
    t.eq("aim: a stick crosses as a direction", stick.a, [0.6, -0.8, 0]);
    const mouse = packInput(
      stubInput({ aim: { type: "mouse", x: 100, y: 50 } }), 1, "mouse",
      (x, y) => ({ x: x + 1000, y: y + 200 })
    );
    t.eq("aim: a mouse point is resolved to WORLD before it crosses", mouse.a, [1100, 250, 1]);
    const wired = createWireInput();
    wired.receive(mouse);
    wired.sample();
    t.eq("aim: ...and arrives as the shape the mission takes without a camera",
      wired.aimSource(), { type: "world", x: 1100, y: 250 });

    // THE ROOM IS AIM-MODE AGNOSTIC, and it has to be: two commanders in one
    // scene may be holding different things. The scene reads no mode — the
    // client resolves its aim before the packet leaves, and the absence of a
    // vector ENTIRELY is what the keyboard scheme means. `config.aimMode` is set
    // here to something neither seat is using, because the point is that the
    // room's own mode does not matter.
    //
    // `_applyAim` is called off the prototype with a bare `this`: the stick and
    // no-source branches touch no scene state, and only the `mouse` branch —
    // which is local-device-only and never crosses a wire — reads a camera.
    config.aimMode = "gamepad";
    const applyAim = (body, wired) => Mission.prototype._applyAim.call({}, body, wired);
    const framed = (dev, mode) => {
      const w = createWireInput();
      w.receive(packInput(dev, 1, mode, null));
      w.sample();
      return w;
    };
    const body = { x: 0, y: 0, w: 30, h: 46, crouched: false, aimVec: null, aimUp: false, facing: 1 };

    // A keyboard commander: no vector, ever. Before this the room early-returned
    // on ITS OWN mode, so in a gamepad-configured room their aimUp was forced
    // false and their aim was silently dead.
    applyAim(body, framed(stubInput({ down: { aimUp: true } }), "keyboard"));
    t.ok("aim: a keyboard commander's aimUp survives a room set to gamepad",
      body.aimUp === true && body.aimVec === null);

    // A stick commander in the same room, same frame.
    applyAim(body, framed(stubInput({ aim: { type: "stick", x: 0.6, y: -0.8 } }), "gamepad"));
    t.ok("aim: ...and a stick commander in the same room still gets a vector",
      body.aimVec !== null && Math.abs(body.aimVec.x - 0.6) < 1e-9 && body.aimUp === false);

    // Releasing the stick must not snap the gun back to facing: aimStick.active
    // goes false the instant it re-centres, and clearing the vector there is
    // what a player feels as the gun jumping.
    const held = { ...body.aimVec };
    applyAim(body, framed(stubInput({}), "gamepad"));
    t.ok("aim: a released stick keeps the aim it had, rather than snapping to facing",
      body.aimVec && body.aimVec.x === held.x && body.aimVec.y === held.y);
    t.ok("aim: ...and a soldier who already aims somewhere ignores the aimUp button",
      body.aimUp === false);
  }

  // ======================================================================
  // 2. THE SNAPSHOT — two real Missions
  // ======================================================================
  {
    const level = generateLevel({ seed: 4242, difficulty: "low" }).level;
    const spec = { id: "m-net", name: "Net", seed: 4242 };
    const squad = [...squadFor(["a1", "a2"], "A"), ...squadFor(["b1"], "B")];

    // The room's mission: the whole squad, no canvas, no host (J6).
    const room = new Mission(null, () => {});
    room.start(spec, level, squad, null);
    const wireA = createWireInput();
    room.setInput("A", wireA);
    room.setInput("B", createWireInput());

    // A SEAT'S mission: the same level and seed, and ONLY its own squad —
    // which is the whole of what a dispatch carries and never widens.
    const seat = new Mission(null, () => {});
    seat.start(spec, level, squadFor(["a1", "a2"], "A"), "A", { step() {} });
    t.ok("seat: a mission with a net driver is a viewer", seat.remote === true);

    // Drive the room forward with A running right, then hand the seat what the
    // room would send it.
    wireA.receive(packInput(stubInput({ down: { right: true } }), 1, "gamepad", null));
    for (let i = 0; i < 40; i++) {
      room.sampleInputs();
      room.update(1 / 60);
      room.netStep++;
    }
    const before = seat.scene.soldiers.find((s) => s.id === "a1").x;
    applySnapshot(seat, projectScene(room, "A", wireA.ack()));

    const ra1 = room.scene.soldiers.find((s) => s.id === "a1");
    const sa1 = seat.scene.soldiers.find((s) => s.id === "a1");
    t.ok("snapshot: the room's leader actually moved", ra1.x - before > 20);
    t.ok("snapshot: and the seat's copy is where the room says", Math.abs(sa1.x - ra1.x) < 0.11);
    t.ok("snapshot: with its facing, stance and health", sa1.facing === ra1.facing && sa1.crouched === ra1.crouched && Math.abs(sa1.health - ra1.health) < 0.11);

    // THE RULE THE WHOLE PHASE RESTS ON, from the other side: a seat is sent
    // the other commander's squad, because they are standing on one level.
    const sb1 = seat.scene.soldiers.find((s) => s.id === "b1");
    t.ok("snapshot: the other commander's soldier arrives on the level", !!sb1);
    t.ok("snapshot: ...as a body to draw and nothing else",
      sb1.weapon === undefined && sb1.data === undefined && sb1.remote === true);
    t.ok("snapshot: ...at the room's position", Math.abs(sb1.x - room.scene.soldiers.find((s) => s.id === "b1").x) < 0.11);

    // Enemies, projectiles and the level's own state.
    t.eq("snapshot: every root crosses", seat.scene.specRoots.length, room.scene.specRoots.length);
    const rr = room.scene.specRoots[0], sr = seat.scene.specRoots[0];
    t.ok("snapshot: a root is where the room has it", Math.abs(sr.x - rr.x) < 0.11 && Math.abs(sr.y - rr.y) < 0.11);
    t.eq("snapshot: ...and holds the brain state the room is in", sr.brainState.current, rr.brainState.current);
    t.eq("snapshot: projectiles cross whole", seat.scene.projectiles.length, room.scene.projectiles.length);

    // Approximation 11a: what the OTHER commander recovered is never on the
    // wire. The count that crosses is this recipient's own.
    room.scene.collected.push({ item: { name: "BETA-HAUL", value: 400 }, owner: "B", by: "b1" });
    room.scene.collected.push({ item: { name: "ALPHA-HAUL", value: 9 }, owner: "A", by: "a1" });
    const forA = projectScene(room, "A", 0);
    t.eq("privacy: a seat is told its own loot count", forA.c, 1);
    const onTheWire = JSON.stringify(forA);
    t.ok("privacy: ...and neither haul crosses as an item, not even this seat's own",
      !onTheWire.includes("BETA-HAUL") && !onTheWire.includes("ALPHA-HAUL"));
    t.eq("privacy: the other seat's count is its own", projectScene(room, "B", 0).c, 1);

    // Approximation 11c: a soldier is keyed by ID, so an extraction — which
    // splices a squad out of the array mid-mission — does not renumber anybody.
    room._resolve(true, "B");
    applySnapshot(seat, projectScene(room, "A", 0));
    t.ok("extraction: the departed squad leaves the viewer's array too",
      !seat.scene.soldiers.some((s) => s.id === "b1"));
    t.ok("extraction: ...and this commander's own soldiers are untouched",
      seat.scene.soldiers.length === 2 && seat.scene.soldiers.every((s) => s.owner === "A"));

    // The outcome is the ROOM's and reaches the seat as a flag; the banner is
    // built locally off it, and the RESULT is not on this wire at all.
    room._resolve(true, "A");
    applySnapshot(seat, projectScene(room, "A", 0));
    t.eq("end: this commander's outcome crosses", seat.netEnd, 1);
    t.ok("end: the extracted squad has already left the array", seat.scene.soldiers.length === 0);
    seat.update(1 / 60);
    const end = seat.endFor("A");
    t.ok("end: the viewer builds its own banner from it", !!end && end.success === true);
    // The cards the banner draws over. They were spliced out by the very
    // snapshot that carried the outcome, so a record built off the live array
    // would show an empty squad for the whole of the banner.
    t.eq("end: ...over the roster frozen as it left", end.squad.map((s) => s.id), ["a1", "a2"]);
    t.eq("end: ...and computes no result", end.result, null);
    // A viewer that filed a result would file a SECOND one for a dispatch the
    // room has already reported.
    let fired = 0;
    seat.onComplete = () => fired++;
    for (let i = 0; i < 200; i++) seat.update(1 / 60);
    t.eq("end: a viewer never calls onComplete", fired, 0);
  }

  // ======================================================================
  // 2b. FEEDBACK — the half of a mission that is not state
  // ======================================================================
  //
  // The bug this section exists for: J8 shipped the state and dropped the
  // feedback, so a joint mission was silent, spark-less and shake-less. Sound
  // was what got noticed; it was one of five.
  {
    const level = generateLevel({ seed: 771, difficulty: "low" }).level;
    const spec = { id: "m-feed", name: "Feed", seed: 771 };
    const squad = [...squadFor(["a1"], "A"), ...squadFor(["b1"], "B")];

    const room = new Mission(null, () => {});
    room.start(spec, level, squad, null);
    room.feed = []; // what server.mjs assigns: log it, do not play it
    const seat = new Mission(null, () => {});
    seat.start(spec, level, squadFor(["a1"], "A"), "A", { step() {} });

    // A ROOM PLAYS NOTHING LOCALLY. The particle array is the visible half of
    // that: before this, the room allocated bursts sixty times a second that
    // nobody would ever look at.
    room._ctx.spark(100, 200, "#fff", 4, 90);
    room.scene.sound("weapon.fire", { x: 100, y: 200 });
    t.eq("feedback: a room logs instead of playing", room.feed.length, 2);
    t.eq("feedback: ...and builds no particles for a canvas it does not have", room.particles.length, 0);

    // ...and a mission with no log plays it, exactly as it always did. This is
    // the single-player path and it must not have moved.
    const solo = new Mission(null, () => {});
    solo.start(spec, level, squadFor(["s1"], null), null);
    solo._ctx.spark(100, 200, "#fff", 4, 90);
    t.ok("feedback: a mission with no log plays it locally", solo.particles.length === 4);
    solo._feedback("shk", [0.3, 0.7], null);
    t.ok("feedback: ...including shake, which used to be a direct field write", solo.shake > 0.29);

    // THE CAUSE, AND THE TWO FILTERS. `own` is what a commander alone
    // perceives; everything else is the level they are both standing on.
    room.feed.length = 0;
    room._feedback("shk", [0.12, 0.5], "A", true); // A's recoil
    room._feedback("flh", [0.4], "B", true); // B took a hit
    room._feedback("snd", ["impact.wall", 10, 20], "A"); // a shot landed
    const toA = projectScene(room, "A", 0, room.feed).v;
    const toB = projectScene(room, "B", 0, room.feed).v;
    t.eq("feedback: a commander gets their own recoil and the world's sound", toA.map((e) => e[0]), ["shk", "snd"]);
    t.eq("feedback: ...and the other gets their own flash and the same sound", toB.map((e) => e[0]), ["flh", "snd"]);
    t.ok("feedback: neither is sent the other's private half",
      !toA.some((e) => e[0] === "flh") && !toB.some((e) => e[0] === "shk"));
    t.eq("feedback: the filter fields do not cross — a viewer plays what it is handed", toA[1], ["snd", "impact.wall", 10, 20]);

    // AND IT ARRIVES. The client's own audio is a no-op headlessly, so the
    // proof is the half that is observable: a burst becomes particles.
    room.feed.length = 0;
    room._ctx.burst(300, 120, "#e05a5a", 18, 260);
    room._feedback("shk", [0.3, 0.7], null);
    applySnapshot(seat, projectScene(room, "A", 0, room.feed));
    t.eq("feedback: a viewer builds the burst the room only described", seat.particles.length, 18);
    t.ok("feedback: ...and takes the kick", seat.shake > 0.29);

    // THE ONE THAT WOULD HAVE BEEN REDISCOVERED. The sim runs at 60Hz and the
    // snapshot at 20, so a log cleared per STEP drops two thirds of every
    // firefight — one of exactly two bugs netproto/smoke.mjs found on its first
    // run, and named in this spec for this moment.
    room.feed.length = 0;
    for (let i = 0; i < 3; i++) {
      room.scene.sound("weapon.fire", { x: i, y: 0 });
      room.sampleInputs();
      room.update(1 / 60);
    }
    const across = projectScene(room, "A", 0, room.feed).v.filter((e) => e[0] === "snd" && e[1] === "weapon.fire");
    t.eq("feedback: three steps of cues survive to one snapshot", across.length, 3);

    // The cap drops the tail, not the packet.
    room.feed.length = 0;
    for (let i = 0; i < 200; i++) room._ctx.spark(i, 0, "#fff", 1, 10);
    t.ok(`feedback: a crowded frame is capped (${room.feed.length}), not unbounded`, room.feed.length === 64);
  }

  // A commander's own gun is heard by everybody and shakes only them, and the
  // cause is ambient rather than threaded through eighteen call sites. Driven
  // through the REAL fire path so a cue nobody remembered still gets an owner.
  {
    const level = generateLevel({ seed: 99001, difficulty: "low" }).level;
    const spec = { id: "m-cause", name: "Cause", seed: 99001 };
    const room = new Mission(null, () => {});
    room.start(spec, level, [...squadFor(["a1"], "A"), ...squadFor(["b1"], "B")], null);
    room.feed = [];
    const fireA = createWireInput();
    room.setInput("A", fireA);
    room.setInput("B", createWireInput());
    fireA.receive(packInput(stubInput({ down: { fire: true } }), 1, "gamepad", null));
    for (let i = 0; i < 30; i++) {
      room.sampleInputs();
      room.update(1 / 60);
    }
    const shots = room.feed.filter((e) => e[0] === "snd" && String(e[3]).startsWith("weapon.fire"));
    const recoil = room.feed.filter((e) => e[0] === "shk" && e[2]);
    t.ok(`cause: firing produced cues (${shots.length})`, shots.length > 0);
    t.ok("cause: ...credited to the commander who fired, not to nobody", shots.every((e) => e[1] === "A"));
    t.ok("cause: recoil is A's alone", recoil.length > 0 && recoil.every((e) => e[1] === "A"));
    t.ok("cause: and B, who pressed nothing, fired nothing",
      !room.feed.some((e) => e[1] === "B" && String(e[3]).startsWith("weapon.")));
    // The cause reaches sites nobody was thinking about, which is the whole
    // argument for an ambient over threading an owner through 18 call sites:
    // both squads drop onto the ground at spawn, and each thud is credited to
    // the commander whose soldier landed without `soldier.land` knowing owners
    // exist.
    const lands = room.feed.filter((e) => e[3] === "soldier.land");
    t.eq("cause: a landing nobody wired up is credited to whoever landed",
      lands.map((e) => e[1]).sort(), ["A", "B"]);
  }

  // The one part of the scene a viewer cannot simply mirror: entities the
  // SIMULATION creates mid-mission. The Iron Moth's wings launch `seeker`s into
  // `root.spawned`, and a viewer that cannot build them is a viewer being shot
  // at by something invisible — so the def id crosses and the client makes its
  // own, through the runtime's own verb rather than a second entity format.
  {
    const base = generateLevel({ seed: 31337, difficulty: "high" }).level;
    const level = { ...base, enemies: [{ type: "iron_moth", x: base.playerSpawn.x + 320, y: base.playerSpawn.y }] };
    const spec = { id: "m-boss", name: "Boss", seed: 31337 };
    const room = new Mission(null, () => {});
    room.start(spec, level, squadFor(["c1"], "C"), null);
    room.setInput("C", createWireInput());
    const seat = new Mission(null, () => {});
    seat.start(spec, level, squadFor(["c1"], "C"), "C", { step() {} });

    for (let i = 0; i < 600 && !room.scene.specRoots[0].spawned.length; i++) {
      room.sampleInputs();
      room.update(1 / 60);
    }
    const born = room.scene.specRoots[0].spawned;
    t.ok("spawned: the room's boss launched something", born.length > 0);
    applySnapshot(seat, projectScene(room, "C", 0));
    const mirrored = seat.scene.specRoots[0].spawned;
    t.eq("spawned: the viewer has one for one", mirrored.length, born.length);
    t.eq("spawned: ...of the right kind", mirrored.map((x) => x.spec.id), born.map((x) => x.spec.id));
    t.ok("spawned: ...in the right place",
      mirrored.every((x, i) => Math.abs(x.x - born[i].x) < 0.11 && Math.abs(x.y - born[i].y) < 0.11));

    // And they go when the room's go: `updateSpecEnemy` filters its dead out
    // once a step, so the two arrays stay the same shape without an id on them.
    const wasN = born.length;
    born.length = 0;
    applySnapshot(seat, projectScene(room, "C", 0));
    t.ok(`spawned: and all ${wasN} leave when the room's do`, seat.scene.specRoots[0].spawned.length === 0);
  }

  // A viewer runs no gameplay. The cheapest way to say so is to step one with
  // no snapshots at all and watch nothing happen.
  {
    const level = generateLevel({ seed: 99, difficulty: "low" }).level;
    const spec = { id: "m-still", name: "Still", seed: 99 };
    const seat = new Mission(null, () => {});
    seat.start(spec, level, squadFor(["s1"], "A"), "A", { step() {} });
    const s = seat.scene.soldiers[0];
    const at = { x: s.x, y: s.y };
    const roots = seat.scene.specRoots.map((r) => r.x);
    for (let i = 0; i < 120; i++) seat.update(1 / 60);
    t.ok("viewer: gravity does not run", s.x === at.x && s.y === at.y);
    t.ok("viewer: enemies do not think", seat.scene.specRoots.every((r, i) => r.x === roots[i]));
    t.ok("viewer: but the clock does, because the camera and the motes are its own", seat.time > 1.9);
  }

  // ======================================================================
  // 3. THE FLIGHT — the room's half, with a stub driver
  // ======================================================================
  {
    const vis = config.leadVisibility;
    config.leadVisibility = 1; // a joint deploy needs one lead both seats can see
    const opened = [];
    const rooms = createRooms({ startMission: (f) => (opened.push(f), { stub: true }) });
    const { seats } = rooms.createRoom({ players: 2 });
    config.leadVisibility = vis;
    const [a, b] = seats;
    const heard = new Map();
    for (const s of seats) {
      const events = [];
      heard.set(s.playerId, events);
      rooms.attach(s.token, (event, data) => events.push({ event, data }));
    }

    const leadId = rooms.snapshot(a.token).leads[0].id;
    for (const s of seats) {
      rooms.command(s.token, { type: "hire", recruitId: rooms.snapshot(s.token).recruits[0].id });
      rooms.command(s.token, { type: "deploy", leadId, soldierIds: [rooms.snapshot(s.token).roster[0].id] });
    }
    rooms.command(a.token, { type: "ready" });
    rooms.command(b.token, { type: "ready" });

    t.eq("flight: two dispatches on one lead open ONE flight", opened.length, 1);
    const flight = opened[0];
    t.eq("flight: ...with both seats on it", flight.seats.map((s) => s.owner).sort(), [a.playerId, b.playerId].sort());
    t.eq("flight: ...and one squad, both commanders' soldiers in round order", flight.squad.length, 2);
    t.ok("flight: every soldier on it names its commander", flight.squad.every((s) => s.owner));
    t.ok("flight: the registry holds it against the token", rooms.flightFor(a.token) === flight && rooms.flightFor(b.token) === flight);

    const dispatches = [...heard.values()].map((e) => e.filter((x) => x.event === "dispatch").pop().data);
    t.ok("flight: both seats are told their mission is held elsewhere", dispatches.every((d) => d.hosted === true));

    // THE CAMPAIGN-SIDE RULE (J8): the ROOM files both results, one per
    // dispatch id, because the room is what has them.
    const before = rooms.snapshot(a.token).day;
    const result = (id, ok) => ({
      success: ok, missionId: leadId, missionName: "x",
      survivors: ok ? [id] : [], casualties: ok ? [] : [id],
      killsBySoldier: [], woundsBySoldier: [], loot: [], kills: 0,
    });
    flight.report(a.playerId, result(rooms.snapshot(a.token).roster[0].id, true));
    t.eq("report: the day does not turn on the first of two", rooms.snapshot(a.token).day, before);
    const endA = heard.get(a.playerId).filter((x) => x.event === "missionEnd").pop();
    t.ok("report: the reporting commander is pushed their results screen", !!endA && endA.data.result.success === true);
    t.ok("report: ...and nobody else is", !heard.get(b.playerId).some((x) => x.event === "missionEnd"));

    flight.report(b.playerId, result(rooms.snapshot(b.token).roster[0].id, false));
    const endB = heard.get(b.playerId).filter((x) => x.event === "missionEnd").pop();
    t.ok("report: the second commander gets theirs", !!endB && endB.data.result.success === false);
    t.ok("report: ...carrying the day summary the command answered with, which no page could have seen",
      endB.data.turn && endB.data.turn.dayTurned === true);
    t.ok("report: the day turned on the last report", rooms.snapshot(a.token).day > before);
    t.ok("report: and the flight is let go", rooms.flightFor(a.token) === null);

    // A second report for a dispatch already filed cannot double-charge.
    t.eq("report: a repeat is refused by the flight, not by the campaign",
      flight.report(a.playerId, result("x", true)), null);
  }

  // A room with no host to hold missions is the V1–V3 service exactly as it was.
  {
    const rooms = createRooms();
    const { seats } = rooms.createRoom({ players: 1 });
    const [only] = seats;
    const events = [];
    rooms.attach(only.token, (event, data) => events.push({ event, data }));
    rooms.command(only.token, { type: "hire", recruitId: rooms.snapshot(only.token).recruits[0].id });
    const view = rooms.snapshot(only.token);
    rooms.command(only.token, { type: "deploy", leadId: view.leads[0].id, soldierIds: [view.roster[0].id] });
    rooms.command(only.token, { type: "ready" });
    const d = events.filter((x) => x.event === "dispatch").pop();
    t.ok("no host: a dispatch is not marked hosted", !!d && d.data.hosted === undefined);
    t.eq("no host: and no flight is opened", rooms.flightFor(only.token), null);
  }

  // ======================================================================
  // 4. THE TWO-SEAT DRIVE — the real server, on its own port
  // ======================================================================
  await twoSeatDrive(t);
}

// --- section 4 -------------------------------------------------------------

// SSE over `fetch`, because node has no EventSource. Ten lines, and it reads
// exactly the frames `server.mjs` writes.
function openStream(base, token) {
  const seat = { events: [], closed: false, ctrl: new AbortController() };
  seat.ready = fetch(`${base}/api/stream?token=${encodeURIComponent(token)}`, { signal: seat.ctrl.signal })
    .then(async (res) => {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let at;
        while ((at = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, at);
          buf = buf.slice(at + 2);
          const ev = /^event: (.+)$/m.exec(frame);
          const data = /^data: (.+)$/m.exec(frame);
          if (ev && data) seat.events.push({ event: ev[1], data: JSON.parse(data[1]) });
        }
      }
    })
    .catch(() => {});
  seat.last = (kind) => seat.events.filter((e) => e.event === kind).pop();
  seat.close = () => seat.ctrl.abort();
  return seat;
}

async function until(pred, ms = 4000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    const v = pred();
    if (v) return v;
    await sleep(20);
  }
  return null;
}

function post(base, path, body) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

async function twoSeatDrive(t) {
  // A CLIENT SOCKET IS THE ONE THING THIS SUITE NEEDS FROM THE RUNTIME. Global
  // `WebSocket` landed unflagged in node 22, and the repo has no dependencies to
  // fall back on — so on an older node this section reports what it could not
  // do rather than failing, which is a different claim from "the room is
  // broken". The other three sections are pure and run everywhere.
  if (typeof WebSocket !== "function") {
    t.ok(`drive: SKIPPED — node ${process.version} has no global WebSocket (needs 22+)`, true);
    return;
  }
  const port = 8400 + Math.floor(Math.random() * 120);
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  server.stderr.on("data", (d) => (stderr += d));
  const up = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000);
    server.stdout.on("data", (d) => {
      if (String(d).includes("serving")) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    server.on("exit", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  t.ok("drive: the real server.mjs starts with a mission loop in it", up, stderr.slice(0, 300));
  if (!up) {
    server.kill();
    return;
  }

  const open = [];
  try {
    // ONE LEAD TWO COMMANDERS CAN BOTH SEE. `config.leadVisibility` is 0.5 in
    // the server's process and no test can reach it — a room reads built-in
    // defaults (approximation 5) — so the overlap is a coin flip and the answer
    // is to open rooms until one lands rather than to stub the config.
    let room = null, seatA = null, seatB = null, lead = null;
    for (let tries = 0; tries < 12 && !lead; tries++) {
      for (const s of open.splice(0)) s.close();
      room = await post(base, "/api/rooms", { players: 2 });
      seatA = openStream(base, room.seats[0].token);
      seatB = openStream(base, room.seats[1].token);
      open.push(seatA, seatB);
      const a = await until(() => seatA.last("snapshot"));
      const b = await until(() => seatB.last("snapshot"));
      if (!a || !b) continue;
      lead = a.data.leads.find((l) => b.data.leads.some((x) => x.id === l.id)) || null;
    }
    t.ok("drive: two commanders share a lead", !!lead);
    if (!lead) throw new Error("no shared lead");

    const seatOf = { [room.seats[0].playerId]: seatA, [room.seats[1].playerId]: seatB };
    for (const s of room.seats) {
      const v = seatOf[s.playerId].last("snapshot").data;
      await post(base, "/api/command", { token: s.token, cmd: { type: "hire", recruitId: v.recruits[0].id } });
      // The hired soldier arrives on the STREAM, which is a second connection
      // and lands after the POST has answered. Waiting for the push rather than
      // reading the answer is what a browser does too.
      const hired = await until(() => {
        const roster = seatOf[s.playerId].last("snapshot").data.roster;
        return roster && roster.length ? roster[0].id : null;
      });
      await post(base, "/api/command", { token: s.token, cmd: { type: "deploy", leadId: lead.id, soldierIds: [hired] } });
    }
    for (const s of room.seats) await post(base, "/api/command", { token: s.token, cmd: { type: "ready" } });

    const dA = await until(() => seatA.last("dispatch"));
    const dB = await until(() => seatB.last("dispatch"));
    t.ok("drive: both seats are dispatched", !!dA && !!dB);
    t.ok("drive: onto one mission", dA.data.mission.id === dB.data.mission.id);
    t.ok("drive: and the room says it is holding it", dA.data.hosted === true && dB.data.hosted === true);
    t.ok("drive: while each seat still receives only its own squad",
      dA.data.squad.every((s) => s.owner === room.seats[0].playerId) &&
      dB.data.squad.every((s) => s.owner === room.seats[1].playerId));

    // THE MISSION SOCKET. A seat's token is the whole of the authorisation.
    const socks = room.seats.map((s) => connectMission(base, s.token));
    await Promise.all(socks.map((s) => s.opened));
    t.ok("drive: both mission sockets are accepted", socks.every((s) => s.ready));
    t.ok("drive: ...and each is told which commander it is",
      socks[0].owner === room.seats[0].playerId && socks[1].owner === room.seats[1].playerId);

    const bad = connectMission(base, "not-a-seat");
    await bad.opened;
    t.ok("drive: a token in no flight is closed rather than answered", !bad.ready);

    const first = await until(() => socks[0].snap && socks[1].snap);
    t.ok("drive: the room is stepping and sending", !!first);
    if (!first) throw new Error("no snapshot");

    t.ok("drive: a snapshot carries BOTH commanders' soldiers, because they are on one level",
      new Set(socks[0].snap.s.map((x) => x.m[1])).size === 2);
    t.ok("drive: and each seat is told which soldier it is driving",
      socks[0].snap.k && socks[1].snap.k && socks[0].snap.k !== socks[1].snap.k);
    t.ok("drive: ...which is one of its own", dA.data.squad.some((s) => s.data.id === socks[0].snap.k));

    // THE POINT OF THE PHASE, over a wire: one keyboard moves one leader.
    const idA = socks[0].snap.k, idB = socks[1].snap.k;
    const xOf = (snap, id) => snap.s.find((s) => s.i === id)?.x;
    const x0A = xOf(socks[0].snap, idA), x0B = xOf(socks[0].snap, idB);
    for (let i = 0; i < 60; i++) {
      socks[0].send({ d: 1 << WIRE_ACTIONS.indexOf("right"), p: 0, a: null });
      await sleep(16);
    }
    await until(() => xOf(socks[0].snap, idA) - x0A > 40);
    const x1A = xOf(socks[0].snap, idA), x1B = xOf(socks[0].snap, idB);
    t.ok("drive: the commander holding right runs", x1A - x0A > 40, `${x0A} → ${x1A}`);
    t.ok("drive: and the commander who pressed nothing does not", Math.abs(x1B - x0B) < 25, `${x0B} → ${x1B}`);
    t.ok("drive: the room acknowledges the input it consumed", socks[0].snap.a > 0 && socks[1].snap.a === 0);
    t.ok("drive: both seats see the same run, because there is one simulation",
      Math.abs(xOf(socks[1].snap, idA) - x1A) < 60, `${xOf(socks[1].snap, idA)} vs ${x1A}`);

    // FEEDBACK OVER THE REAL WIRE. The bug report this section answers was
    // "there's no longer any sound" — so the assertion is that holding the
    // trigger on one seat puts weapon cues on BOTH seats' snapshots, since a
    // gunshot is a fact about the level and not about who fired.
    const cuesOf = (c) => (c.snap.v || []).filter((e) => e[0] === "snd").map((e) => e[1]);
    const heard = { a: [], b: [] };
    for (let i = 0; i < 90; i++) {
      socks[0].send({ d: 1 << WIRE_ACTIONS.indexOf("fire"), p: 0, a: null });
      heard.a.push(...cuesOf(socks[0]));
      heard.b.push(...cuesOf(socks[1]));
      await sleep(16);
    }
    t.ok(`drive: the shooter hears their own gun (${heard.a.filter((c) => c.startsWith("weapon.")).length} cues)`,
      heard.a.some((c) => c.startsWith("weapon.")));
    t.ok("drive: and so does the other commander, standing on the same level",
      heard.b.some((c) => c.startsWith("weapon.")));
    t.ok("drive: recoil reaches the commander who fired",
      (socks[0].seenKinds.has("shk")));
    t.ok("drive: and not the one who did not", !socks[1].seenKinds.has("shk"));

    // Approximation 11: the first format that sends too much works on a LAN and
    // fails on a wire, so the size is asserted rather than assumed.
    const bytes = JSON.stringify(socks[0].snap).length;
    t.ok(`drive: a snapshot is ${bytes}B, under 16KB`, bytes < 16384);

    for (const s of socks) s.close();
    bad.close();
  } catch (e) {
    t.ok(`drive: threw — ${e && e.message}`, false);
  } finally {
    for (const s of open) s.close();
    server.kill();
    await sleep(60);
  }
}

// One mission socket, as the browser's `src/net/mission-socket.js` opens it.
function connectMission(base, token) {
  const ws = new WebSocket(`${base.replace("http:", "ws:")}/mission?token=${encodeURIComponent(token)}`);
  const c = { ws, ready: false, owner: null, snap: null, seq: 0, seenKinds: new Set() };
  c.opened = new Promise((resolve) => {
    const t = setTimeout(resolve, 2500);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === "ready") {
        c.ready = true;
        c.owner = m.owner;
        clearTimeout(t);
        resolve();
      } else if (m.t === "snap") {
        c.snap = m;
        for (const e of m.v || []) c.seenKinds.add(e[0]);
      }
    };
    ws.onclose = () => {
      clearTimeout(t);
      resolve();
    };
    ws.onerror = () => {};
  });
  c.send = (pkt) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: "in", n: ++c.seq, ...pkt }));
  };
  c.close = () => {
    try {
      ws.close();
    } catch {
      /* already gone */
    }
  };
  return c;
}
