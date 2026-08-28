// ---------------------------------------------------------------------------
// THE TRANSPORT — the wire's data rule, the loopback, and the client.
//
// Covers src/net/ (tech/multiplayer-session.md, W1). Two things are worth
// stating about what this can and cannot see.
//
// It CAN see the thing the slice exists for: that every command the game
// actually sends, and every answer it gets back, is data — checked against a
// real session running real commands, not against invented payloads. That is
// the assertion that will fail the day somebody puts a Map or a live object
// into a command, which is exactly how this seam would otherwise rot between
// here and T2.
//
// It CANNOT see the page. Nothing imports src/main.js or src/hub/hub.js, so the
// optimistic control, the render ordering and the seat swap are guarded by
// playing the game. What is here is the seam itself.
// ---------------------------------------------------------------------------

import { createSession } from "../src/game/session.js";
import { createLoopback } from "../src/net/loopback.js";
import { connect } from "../src/net/client.js";
import { assertData, toWire } from "../src/net/wire.js";
import { createState } from "../src/game/state.js";
import { config, resetConfig } from "../src/game/config.js";

// Let every queued microtask drain, which is where the loopback delivers.
const settle = () => new Promise((r) => setTimeout(r, 0));

const threw = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

export default async function run(t) {
  resetConfig();

  // ---- the data rule ------------------------------------------------------
  // The reason this is a walk and not a round-trip comparison. Each of these is
  // silently reshaped by JSON.stringify, and the first two compare EQUAL after a
  // round trip — stringify(new Map()) is "{}", and so is stringify({}).
  {
    t.ok("wire: a Map is refused", threw(() => assertData({ seenBy: new Map([["p1", null]]) })));
    t.ok("wire: a Set is refused", threw(() => assertData({ ids: new Set(["a"]) })));
    t.ok("wire: a function is refused", threw(() => assertData({ go() {} })));
    t.ok("wire: undefined inside an object is refused", threw(() => assertData({ a: undefined })));
    t.ok("wire: a class instance is refused", threw(() => assertData({ d: new Date() })));
    t.ok("wire: NaN is refused", threw(() => assertData({ n: NaN })));
    t.ok("wire: Infinity is refused", threw(() => assertData({ n: Infinity })));
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    t.ok("wire: a cycle is refused rather than hanging", threw(() => assertData(cyclic)));

    t.ok("wire: plain data passes", !threw(() => assertData({ a: [1, "x", null, true], b: { c: {} } })));
    // The error names the field, because which one it was is the useful half.
    let msg = "";
    try {
      assertData({ lead: { seenBy: new Map() } }, "command deploy");
    } catch (e) {
      msg = e.message;
    }
    t.ok(`wire: the refusal names the path (${msg})`, msg.includes("command deploy") && msg.includes("seenBy"));

    // A copy, not the same object: neither side of the seam may hold a
    // reference into the other.
    const src = { squad: [{ id: "s1" }] };
    const copy = toWire(src);
    t.ok("wire: what crosses is a copy", copy.squad[0].id === "s1" && copy.squad !== src.squad);
  }

  // ---- the loopback answers later, never as a return value ----------------
  {
    const session = createSession({ state: createState() });
    const transport = createLoopback(session);
    const client = connect(transport, "p1");

    let answer = null;
    const returned = client.send({ type: "sellLoot" }, (res) => {
      answer = res;
    });
    t.ok("loopback: send returns nothing", returned === undefined);
    t.ok("loopback: and the answer has not arrived yet", answer === null);
    await settle();
    t.ok("loopback: the answer arrives after a microtask", answer !== null && answer.ok !== undefined);

    // Delivery order is the send order. It is the one wire property a loopback
    // can honestly claim, and the page relies on it.
    const seen = [];
    client.send({ type: "hire", recruitId: "nobody" }, () => seen.push("a"));
    client.send({ type: "sellLoot" }, () => seen.push("b"));
    client.send({ type: "commission", blueprintId: "nobody" }, () => seen.push("c"));
    await settle();
    t.eq("loopback: answers arrive in send order", seen, ["a", "b", "c"]);

    // A command that is not data fails AT THE SEND, synchronously, so the stack
    // still points at whoever built it.
    t.ok(
      "loopback: a command carrying a live object is refused at the send",
      threw(() => client.send({ type: "deploy", lead: { seenBy: new Map() } }, () => {}))
    );

    // The return direction is a wire as much as the outbound one. Checked
    // directly rather than through a rigged session: the loopback throws inside
    // the microtask it delivers on, which under node is an uncaught error that
    // takes the process with it — loud by design, but not a thing a suite can
    // catch around a send.
    t.ok(
      "loopback: an answer that is not data would be refused too",
      threw(() => toWire({ ok: true, leads: new Map() }, "answer to ready"))
    );
  }

  // ---- every command the game really sends is data ------------------------
  // The assertion this suite exists for. Real session, real campaign, the seven
  // command types the hub and the page send, each checked in both directions.
  {
    const session = createSession({ players: ["p1", "p2"] });
    const transport = createLoopback(session);
    const p1 = connect(transport, "p1");
    const p2 = connect(transport, "p2");

    const answers = {};
    const sent = [];
    const send = (client, cmd) =>
      new Promise((done) => {
        sent.push(cmd.type);
        client.send(cmd, (res) => {
          answers[cmd.type] = res;
          done();
        });
      });

    const view = p1.view();
    const recruit = view.recruits[0];
    const lead = view.leads[0];

    await send(p1, { type: "hire", recruitId: recruit.id });
    await send(p1, { type: "commission", blueprintId: "blueprint-that-does-not-exist" });
    await send(p1, { type: "sellLoot" });
    await send(p1, { type: "share", leadId: lead.id, to: "p2" });
    await send(p1, {
      type: "deploy",
      leadId: lead.id,
      soldierIds: [p1.view().roster[0].id],
      weapons: { [p1.view().roster[0].id]: "carbine" },
    });
    await send(p1, { type: "release", leadId: lead.id });
    await send(p1, { type: "ready" });
    await send(p2, { type: "ready" });
    await send(p1, {
      type: "missionResult",
      dispatchId: "d1",
      result: {
        success: true, missionId: lead.id, survivors: [], casualties: [],
        killsBySoldier: [], woundsBySoldier: [], loot: [{ name: "Core", value: 10 }], kills: 0,
      },
    });

    t.eq("commands: all nine crossed", sent.length, 9);
    t.ok("commands: every one produced an answer", sent.every((type) => answers[type] !== undefined));
    // Belt and braces: the loopback already refused anything that was not data,
    // so reaching here IS the assertion. Stated anyway, because a future change
    // that makes the check conditional would otherwise pass silently.
    let allData = true;
    for (const type of Object.keys(answers)) {
      if (threw(() => assertData(answers[type], `answer to ${type}`))) allData = false;
    }
    t.ok("commands: every answer is data", allData);
  }

  // ---- a client is one seat, and nothing else -----------------------------
  {
    const session = createSession({ players: ["p1", "p2"] });
    const transport = createLoopback(session);
    const p1 = connect(transport, "p1");

    t.eq("client: exposes exactly a seat, a send and a view", Object.keys(p1).sort(), ["playerId", "send", "view"]);
    t.eq("client: its view is its own seat's", p1.view().playerId, "p1");
    t.ok("client: it cannot reach the round", p1.takeRound === undefined);
    t.ok("client: it cannot reach another seat's view", p1.view.length === 0);

    // W1 hands over the session's live projection unchanged — W3 is where this
    // becomes a snapshot. Pinned so that slice is a deliberate act.
    t.ok("client: W1's view is still the session's own", p1.view() === session.view("p1"));

    // The seat is fixed at connect: a command cannot be sent as somebody else,
    // because there is nowhere to say who you are.
    let saw = null;
    p1.send({ type: "ready" }, (res) => { saw = res; });
    await settle();
    t.ok("client: its command is attributed to its own seat", saw.ok === true && session.view("p1").taskForce.find((c) => c.id === "p1").ready === true);
    t.ok("...and not to the other one", session.view("p2").taskForce.find((c) => c.id === "p2").ready === false);
  }

  // ---- the round stays the host's ----------------------------------------
  {
    const session = createSession({ players: ["p1"] });
    const transport = createLoopback(session);
    t.ok("host: the transport can take a round", typeof transport.takeRound === "function");
    t.eq("host: with nothing dispatched it is empty", transport.takeRound(), []);
  }

  resetConfig();
  void config;
}
