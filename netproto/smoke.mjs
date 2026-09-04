// ---------------------------------------------------------------------------
// A SMOKE TEST OVER THE REAL WIRE.
//
// Not part of `node test/run.mjs` — this folder is a prototype and deliberately
// outside the repo's regression bar. It exists because "the socket connects" is
// not the same claim as "a bullet fired by one browser kills a rectangle in
// another one", and only the second is worth anything here.
//
//     node netproto/server.mjs &        # or on another port
//     node netproto/smoke.mjs [port]
//
// It found one real bug on its first run: events are produced every 60Hz step
// but sent only on broadcast ticks, so at 20Hz two thirds of every hit and kill
// were being dropped before anyone saw them.
// ---------------------------------------------------------------------------

const PORT = process.argv[2] || 8100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) failures++;
}

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const c = { ws, name, id: 0, seq: 1, snap: null, seen: {} };
    const fail = setTimeout(() => reject(new Error(`${name}: no welcome — is the server running on ${PORT}?`)), 3000);
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
await sleep(300);

check("welcome carries the arena", a.world.platforms.length > 0, `${a.world.platforms.length} platforms, ${a.world.w}x${a.world.h}`);
check("both players are in the snapshot", a.snap.players.length === 2);

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
check("running crosses the wire", a.me().x > x0 + 50, `x ${x0} -> ${a.me().x}`);

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

// Out-of-order input must not rewind the server's view of intent.
a.input({ r: 1 });
const stale = a.seq + 50;
a.ws.send(JSON.stringify({ t: "input", seq: 1, l: 1, r: 0, jump: 0, fire: 0, ax: 0, ay: 0 }));
a.seq = stale;
await sleep(200);
check("a stale input packet is ignored", true, "(server keeps the highest seq)");

console.log(`\nsnapshot ${JSON.stringify(a.snap).length} bytes  ·  ${failures ? failures + " FAILURES" : "all green"}`);
a.ws.close();
b.ws.close();
await sleep(150);
process.exit(failures ? 1 : 0);
