// ---------------------------------------------------------------------------
// A SMOKE TEST OVER THE REAL WIRE.
//
// Not part of `node test/run.mjs` — this folder is a prototype and deliberately
// outside the repo's regression bar. It exists because "the socket connects" is
// not the same claim as "a bullet fired by one browser kills a rectangle in
// another one", and only the second is worth anything here.
//
//     node netproto/smoke.mjs
//
// It starts its OWN server on its own port and kills it afterwards. An earlier
// version reused whatever was on 8100 and collided with a live session: a human
// in the arena shooting things is indistinguishable from a broken assertion, so
// a test that can be joined is a test that lies.
//
// It found two real bugs on its first run: events produced every step but sent
// only on broadcast ticks (two thirds of all hits and kills dropped), and
// disconnects that never fired onclose (a ghost player per closed tab).
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 8300 + Math.floor(Math.random() * 90);
const SERVER = fileURLToPath(new URL("./server.mjs", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) failures++;
}

const server = spawn(process.execPath, [SERVER], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("server did not start")), 5000);
  server.stdout.on("data", (d) => {
    if (String(d).includes("netproto on")) {
      clearTimeout(t);
      resolve();
    }
  });
});

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const c = { ws, name, id: 0, seq: 1, snap: null, seen: {} };
    const fail = setTimeout(() => reject(new Error(`${name}: no welcome`)), 3000);
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", name }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === "welcome") {
        c.id = m.id;
        c.world = m.world;
        clearTimeout(fail);
        resolve(c);
      }
      if (m.t === "snap") {
        c.snap = m;
        for (const ev of m.events || []) c.seen[ev.e] = (c.seen[ev.e] || 0) + 1;
      }
    };
    ws.onerror = (e) => reject(new Error(`${name}: ${e.message}`));
    c.input = (o) =>
      ws.send(JSON.stringify({ t: "input", seq: c.seq++, l: 0, r: 0, jump: 0, fire: 0, ax: 0, ay: 0, ...o }));
    c.me = () => c.snap?.players.find((p) => p.i === c.id);
    c.cfg = (o) => ws.send(JSON.stringify({ t: "cfg", ...o }));
    return c;
  });
}

// Holds an input at 60Hz for `ms`, because the server reads intent continuously
// and a single packet is a single frame of held key.
async function hold(clients, ms, per) {
  const t = setInterval(() => {
    for (const c of clients) c.input(per(c));
  }, 16);
  await sleep(ms);
  clearInterval(t);
}

const a = await connect("runner");
const b = await connect("target");

// The duel half runs with the arena empty. Fliers shooting the participants is
// real behaviour but it is noise here, and a PvP assertion that a flier can
// break is not measuring what it claims to.
a.cfg({ enemies: 0 });
await sleep(400);

check("welcome carries the arena", a.world.platforms.length > 0, `${a.world.platforms.length} platforms, ${a.world.w}x${a.world.h}`);
check("welcome carries flier dimensions", a.world.ew > 0 && a.world.eh > 0, `${a.world.ew}x${a.world.eh}`);
check("both players are in the snapshot", [a, b].every((c) => a.snap.players.some((p) => p.i === c.id)));
check("the arena emptied on request", a.snap.enemies.length === 0);

// Gravity: jump, and confirm the body rises and then comes back down. Measuring
// a fall from spawn would race the connection handshake, which already landed it.
const yRest = a.me().y;
await hold([a, b], 200, (c) => (c === a ? { jump: 1 } : {}));
const yUp = a.me().y;
await hold([a, b], 900, () => ({}));
check("jump rises", yUp < yRest - 20, `y ${yRest} -> ${yUp}`);
check("gravity returns it", Math.abs(a.me().y - yRest) < 1, `y ${yUp} -> ${a.me().y}`);

const x0 = a.me().x;
await hold([a, b], 500, (c) => (c === a ? { r: 1 } : {}));
check("running crosses the wire", Math.abs(a.me().x - x0) > 50, `x ${x0} -> ${a.me().x}`);

// Ten bullets kill. `a` aims at wherever the server last put `b`.
const target = () => b.snap.players.find((p) => p.i === b.id);
const t0 = Date.now();
const shooting = setInterval(() => {
  const t = target();
  a.input({ fire: 1, ax: Math.round(t.x + a.world.pw / 2), ay: Math.round(t.y + a.world.ph / 2) });
  b.input({});
}, 16);
while (Date.now() - t0 < 8000 && !target().k) await sleep(50);
clearInterval(shooting);

check("target dies", target().k === 1);
check("killer is credited", a.snap.players.find((p) => p.i === a.id).s === 1);
check("death is counted", target().d === 1);
check("shot events arrive", a.seen.shot > 0, `${a.seen.shot}`);
check("hit events arrive", b.seen.hit > 0, `${b.seen.hit}`);
check("die events arrive", b.seen.die > 0, `${b.seen.die}`);

await hold([a, b], 2400, () => ({}));
check("respawn restores full hp", target().k === 0 && target().h === 100, `hp ${target().h}`);

// --- fliers -----------------------------------------------------------------

a.cfg({ enemies: 3 });
await hold([a, b], 400, () => ({}));
check("the flier count knob applies", a.snap.enemies.length === 3, `${a.snap.enemies.length}`);
check("the server echoes the count to everyone", b.snap.enemies.length === 3);

// Two axes of motion, sampled over three seconds.
const track = { x: [], y: [] };
const sampling = setInterval(() => {
  const e = a.snap.enemies?.[0];
  if (e && !e.k) {
    track.x.push(e.x);
    track.y.push(e.y);
  }
  a.input({});
  b.input({});
}, 30);
await sleep(3000);
clearInterval(sampling);
const span = (v) => Math.max(...v) - Math.min(...v);
check("a flier patrols horizontally", span(track.x) > 60, `${span(track.x).toFixed(0)}px`);
check("a flier bobs vertically", span(track.y) > 25, `${span(track.y).toFixed(0)}px`);

check("fliers shoot", (a.seen.eshot || 0) > 0, `${a.seen.eshot || 0} shots`);
check("hostile rounds are flagged on the wire", (a.snap.bullets || []).every((x) => (x.o < 0 ? x.e === 1 : x.e === undefined)));

// And they can be shot down: 30 HP against 10 a round.
const flier = () => a.snap.enemies?.find((e) => !e.k);
const before = a.me().fl || 0;
const scoreBefore = a.me().s;
const t1 = Date.now();
const hunting = setInterval(() => {
  const e = flier();
  if (e) a.input({ fire: 1, ax: Math.round(e.x + a.world.ew / 2), ay: Math.round(e.y + a.world.eh / 2) });
  b.input({});
}, 16);
while (Date.now() - t1 < 12000 && (a.me().fl || 0) === before) await sleep(50);
clearInterval(hunting);
check("a flier can be shot down", (a.me().fl || 0) > before, `${a.me().fl} downed`);
check("downing a flier leaves the versus score alone", a.me().s === scoreBefore, `score ${a.me().s}`);

// Bandwidth against entity count — the other thing the knob is for.
a.cfg({ enemies: 12 });
await hold([a, b], 500, () => ({}));
const big = JSON.stringify(a.snap).length;
check("the count scales", a.snap.enemies.length === 12, `${big}B at 12 fliers`);

console.log(`\n${failures ? failures + " FAILURES" : "all green"}`);
a.ws.close();
b.ws.close();
await sleep(150);
server.kill();
process.exit(failures ? 1 : 0);
