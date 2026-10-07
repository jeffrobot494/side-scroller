// ---------------------------------------------------------------------------
// THE TRAILER CAPTURE DRIVER (tech/trailer.md). Zero dependencies.
//
//   node trailer.mjs <take> [--frames N] [--soft]
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

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "output", "trailer");
const W = 1920;
const H = 1080;
const FPS = 60;

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

async function main() {
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
    ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-vf", `scale=${W}:${H}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", mp4,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const ffDone = new Promise((res) => ff.on("exit", res));

    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      // A hub take answers with the page rectangle to scale to the frame (its
      // slow zoom); a mission take answers nothing and is the whole viewport.
      const c = await evaluate(cdp, "trailer.frame()");
      const clip = c ? { x: c.x, y: c.y, width: c.width, height: (c.width * H) / W, scale: W / c.width } : { x: 0, y: 0, width: W, height: H, scale: 1 };
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip });
      const png = Buffer.from(shot.data, "base64");
      writeFileSync(join(dir, `${String(f).padStart(5, "0")}.png`), png);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 60 === 59) process.stdout.write(`\r${f + 1}/${frames} frames, ${((f + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} fps`);
    }
    ff.stdin.end();
    await ffDone;
    console.log(`\n${frames} frames → ${dir}\n${mp4}`);
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
