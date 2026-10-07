// ---------------------------------------------------------------------------
// THE TRAILER CAPTURE DRIVER (tech/trailer.md). Zero dependencies.
//
//   node trailer.mjs <take> [--frames N] [--soft]
//   node trailer.mjs cut
//
// A take is shot1 … shot14 (shot14 is the splash), `cards` (the text cards
// alone, transparent), or T0/T1's `proof` and `risk`. `cut` (T6) joins
// shot1–14 in order, lays the cards over them, and mixes the game's own
// sound effects (T7: each take's cues, saved as <take>.sfx.json and played
// offline by src/trailer/mix.js) under the music, output/trailer/
// trailer-music.mp3: output/trailer/trailer.mp4, 60 s, 1920×1080, 60 fps.
//
// Starts server.mjs on its own port, launches Playwright's headless Chromium
// on the GPU (D3D12 through Mesa under WSL), opens trailer.html?take=<take>,
// and steps it over CDP with Node's built-in WebSocket: one virtual-clock
// frame, one screenshot, one PNG. The PNGs are saved and piped to ffmpeg.
// Output: output/trailer/<take>/NNNNN.png and output/trailer/<take>.mp4.
//
// --soft uses SwiftShader instead of the GPU: slower, same frames.
// --frames N captures N frames instead of the take's own length.
// It prints the WebGL renderer string the page got, so a silent fall back to
// software is visible.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mixEvents, wav } from "./src/trailer/mix.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "output", "trailer");
const W = 1920;
const H = 1080;
const FPS = 60;
// The mix (T7): the music as delivered, and the game's sound under it.
const MUSIC = join(OUT, "trailer-music.mp3");
const MUSIC_LEVEL = 1;
const SFX_LEVEL = 0.8;
// Cues the mix leaves out: a staged trace holds the trigger on an empty
// magazine (shot 11), and the dry click is staging, not the shot.
const SFX_SKIP = new Set(["weapon.empty"]);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const take = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--frames")) || "proof";

// ---- processes --------------------------------------------------------------

function findChrome() {
  const base = join(homedir(), ".cache", "ms-playwright");
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell-")).sort() : [];
  for (const d of dirs.reverse())
    for (const sub of readdirSync(join(base, d))) {
      const p = join(base, d, sub, "chrome-headless-shell");
      if (existsSync(p)) return p;
    }
  throw new Error("no chrome-headless-shell under ~/.cache/ms-playwright (npx playwright install chromium-headless-shell)");
}

// The headless shell lacks libnspr4; Firefox's copy satisfies it
// (graphics-tester/README.md). /usr/lib/wsl/lib holds the D3D12 driver.
function firefoxLib() {
  const base = join(homedir(), ".cache", "ms-playwright");
  const d = existsSync(base) ? readdirSync(base).find((x) => x.startsWith("firefox-")) : null;
  return d ? join(base, d, "firefox") : "";
}

function startServer(port) {
  const srv = spawn(process.execPath, [join(ROOT, "server.mjs")], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    srv.stdout.on("data", (b) => { if (String(b).includes("serving")) resolve(srv); });
    srv.on("exit", (c) => reject(new Error(`server.mjs exited (${c})`)));
  });
}

function startChrome(soft) {
  const gpu = soft
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : ["--use-angle=gl", "--ignore-gpu-blocklist"];
  const env = {
    ...process.env,
    LD_LIBRARY_PATH: ["/usr/lib/wsl/lib", firefoxLib(), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
  };
  if (!soft) {
    env.GALLIUM_DRIVER = "d3d12";
    env.MESA_D3D12_DEFAULT_ADAPTER_NAME = env.MESA_D3D12_DEFAULT_ADAPTER_NAME || "NVIDIA";
  }
  const proc = spawn(findChrome(), [
    "--no-sandbox", ...gpu,
    "--remote-debugging-port=0", `--window-size=${W},${H}`,
    "--hide-scrollbars", "--mute-audio", "about:blank",
  ], { env, stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((resolve, reject) => {
    let err = "";
    proc.stderr.on("data", (b) => {
      err += b;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) resolve({ proc, ws: m[1] });
    });
    proc.on("exit", (c) => reject(new Error(`chrome exited (${c})\n${err}`)));
  });
}

// ---- CDP --------------------------------------------------------------------

async function connect(browserWs) {
  const port = new URL(browserWs).port;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ""}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
  const once = (method) => new Promise((res) => on(method, res));
  return { send, on, once, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(`page: ${d.exception?.description || d.text}`);
  }
  return r.result.value;
}

// Resolves once no request has been in flight for `quiet` ms.
function networkIdle(cdp, quiet = 1500) {
  const open = new Set();
  let last = Date.now();
  cdp.on("Network.requestWillBeSent", (p) => { open.add(p.requestId); last = Date.now(); });
  const done = (p) => { open.delete(p.requestId); last = Date.now(); };
  cdp.on("Network.loadingFinished", done);
  cdp.on("Network.loadingFailed", done);
  return () => new Promise((resolve) => {
    const iv = setInterval(() => {
      if (!open.size && Date.now() - last > quiet) { clearInterval(iv); resolve(); }
    }, 100);
  });
}

// Shot 14 (T5): graphics-tester/splash.js from its start, 14 beats.
const TITLE = { take: "shot14", t: 0, frames: 14 * 30 };

// ---- the capture --------------------------------------------------------------

// T6: the cut. Every shot must have been captured, at its own length.
function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (b) => { out += b; });
    p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function cut() {
  const shots = Array.from({ length: 14 }, (_, i) => join(OUT, `shot${i + 1}.mp4`));
  const missing = shots.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(`capture these first: ${missing.map((f) => f.split("/").pop()).join(", ")}`);
  if (!existsSync(join(OUT, "cards", "03599.png"))) throw new Error("capture the cards first: node trailer.mjs cards");
  let frames = 0;
  const counts = [];
  for (const f of shots) {
    const n = Number((await run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", f])).trim());
    counts.push(n);
    frames += n;
  }
  if (frames !== 60 * FPS) throw new Error(`the shots add up to ${frames} frames, not ${60 * FPS}`);
  if (!existsSync(MUSIC)) throw new Error(`no music at ${MUSIC}`);
  const list = join(OUT, "cut.txt");
  writeFileSync(list, shots.map((f) => `file '${f}'`).join("\n") + "\n");
  // The sound effects: every shot's cues on the cut's clock.
  const events = [];
  let at = 0;
  for (let i = 0; i < shots.length; i++) {
    const sfx = join(OUT, `shot${i + 1}.sfx.json`);
    const n = counts[i];
    if (existsSync(sfx)) {
      for (const e of JSON.parse(readFileSync(sfx, "utf8"))) if (!SFX_SKIP.has(e.cue)) events.push({ ...e, t: (at + e.f) / FPS });
    } else console.log(`(no ${sfx.split("/").pop()}: shot ${i + 1} is silent — recapture it)`);
    at += n;
  }
  const mix = mixEvents(events, { duration: 60 });
  const sfxWav = join(OUT, "sfx.wav");
  writeFileSync(sfxWav, wav(mix));
  console.log(`${mix.played} of ${events.length} cues played`);
  const out = join(OUT, "trailer.mp4");
  await run("ffmpeg", ["-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", list,
    "-framerate", String(FPS), "-i", join(OUT, "cards", "%05d.png"),
    "-i", MUSIC, "-i", sfxWav,
    "-filter_complex", [
      "[0:v][1:v]overlay=format=auto,format=yuv420p[v]",
      `[2:a]aresample=48000,volume=${MUSIC_LEVEL},apad[m]`,
      `[3:a]volume=${SFX_LEVEL}[s]`,
      "[m][s]amix=inputs=2:duration=shortest:normalize=0,alimiter=limit=0.95[a]",
    ].join(";"),
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-t", "60", out]);
  console.log(`${frames} frames → ${out}`);
}

async function main() {
  if (take === "cut") return cut();
  const port = 8790 + Math.floor(Math.random() * 100);
  const server = await startServer(port);
  const chrome = await startChrome(flag("--soft"));
  let ff = null;
  try {
    const cdp = await connect(chrome.ws);
    cdp.on("Runtime.exceptionThrown", (p) => console.error("page error:", p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning") console.error(`page ${p.type}:`, p.args.map((a) => a.value ?? a.description).join(" "));
    });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let info;
    if (take === TITLE.take) {
      // T5: the splash itself, unedited, under the same clock injected before
      // its first script. It fetches three, its font and the armour after
      // load, so the capture waits for the network to go quiet first — no
      // time passes on the page meanwhile, so nothing is missed.
      await cdp.send("Network.enable");
      const idle = networkIdle(cdp);
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: readFileSync(join(ROOT, "src", "trailer", "clock.js"), "utf8") });
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/graphics-tester/splash.html?t=${TITLE.t}&seed=1` });
      await loaded;
      await idle();
      info = await evaluate(cdp, `(() => {
        document.getElementById("hud").style.display = "none";
        const gl = document.createElement("canvas").getContext("webgl");
        const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
        window.trailer = { frame: () => window.__clock.tick(1000 / 60) };
        return { frames: ${TITLE.frames}, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "(unknown)" };
      })()`);
    } else {
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/trailer.html?take=${encodeURIComponent(take)}&w=${W}&h=${H}` });
      await loaded;
      info = await evaluate(cdp, "trailer.ready.then(() => ({ frames: trailer.frames, renderer: trailer.renderer }))");
    }
    console.log(`renderer: ${info.renderer}`);
    const frames = Number(opt("--frames")) || info.frames;

    const dir = join(OUT, take);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const mp4 = join(OUT, `${take}.mp4`);
    // The card layer (T6) is captured on a transparent page, PNGs only.
    const cards = take === "cards";
    ff = cards ? null : spawn("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-vf", `scale=${W}:${H}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", mp4,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const ffDone = ff ? new Promise((res) => ff.on("exit", res)) : Promise.resolve();

    const t0 = Date.now();
    if (cards) await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    let blank = null;
    for (let f = 0; f < frames; f++) {
      // A hub take answers with the page rectangle to scale to the frame (its
      // slow zoom); a mission take answers nothing and is the whole viewport;
      // the card layer answers "blank" on a frame with no card.
      const c = await evaluate(cdp, `trailer.frame(${f})`);
      if (c === "blank" && blank) {
        writeFileSync(join(dir, `${String(f).padStart(5, "0")}.png`), blank);
        continue;
      }
      const clip = c && typeof c === "object" ? { x: c.x, y: c.y, width: c.width, height: (c.width * H) / W, scale: W / c.width } : { x: 0, y: 0, width: W, height: H, scale: 1 };
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip });
      const png = Buffer.from(shot.data, "base64");
      writeFileSync(join(dir, `${String(f).padStart(5, "0")}.png`), png);
      if (c === "blank") blank = png;
      if (cards) continue;
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 60 === 59) process.stdout.write(`\r${f + 1}/${frames} frames, ${((f + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} fps`);
    }
    if (ff) ff.stdin.end();
    await ffDone;
    // The cues the take asked for (T7), for the cut's mix. The splash has none.
    if (!cards) {
      const sounds = (await evaluate(cdp, "(window.trailer && window.trailer.sounds) || []")).filter((e) => e.f < frames);
      writeFileSync(join(OUT, `${take}.sfx.json`), JSON.stringify(sounds));
      console.log(`${sounds.length} sound cues → ${take}.sfx.json`);
    }
    console.log(`\n${frames} frames → ${dir}${ff ? `\n${mp4}` : ""}`);
    cdp.close();
  } finally {
    if (ff && ff.exitCode === null && !ff.stdin.writableEnded) ff.stdin.end();
    chrome.proc.kill();
    server.kill();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
