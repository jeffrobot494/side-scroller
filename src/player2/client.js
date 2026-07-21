// Player2 Web API client for the game.
//
// Every LLM/AI call in the game goes through this one client so that auth,
// rate-limiting, and streaming are handled in a single place. Three call
// families, each with its own discipline:
//
//   1. Synchronous  (chat, tts, sync image, embeddings) -> queued via TaskQueue.
//   2. Async jobs   (image_job, model3d, text3d, music, video) -> JobManager.
//   3. Streams      (npc responses, stt) -> one persistent connection each.
//
// No build step. Browser ES module, uses fetch + ReadableStream + AbortSignal.

import { TaskQueue } from "./queue.js";

const CLOUD_BASE = "https://api.player2.game/v1";
// The local Player2 desktop app exposes a login endpoint on this port.
const LOCAL_APP_BASE = "http://localhost:4315/v1";

// Thrown on 429 so the TaskQueue knows to back off and retry.
export class RateLimitError extends Error {
  constructor(retryAfter) {
    super("Rate limited");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter; // seconds, or undefined
  }
}

// Thrown on 402 / insufficient_credits so the UI can prompt a top-up.
export class InsufficientCreditsError extends Error {
  constructor(message) {
    super(message || "Insufficient AI power");
    this.name = "InsufficientCreditsError";
  }
}

export class Player2Client {
  /**
   * @param {object} opts
   * @param {string} opts.gameClientId  From the Player2 Developer Dashboard.
   * @param {string} [opts.baseUrl]     Override the cloud base (rarely needed).
   * @param {number} [opts.concurrency] Max simultaneous synchronous calls.
   */
  constructor({ gameClientId, baseUrl = CLOUD_BASE, concurrency = 3 } = {}) {
    this.gameClientId = gameClientId;
    this.baseUrl = baseUrl;
    this.p2Key = null;
    this.queue = new TaskQueue({ concurrency });
    this.jobs = new JobManager(this);
    this._healthTimer = null;
    this._npcStream = null;
  }

  // ---- Auth ---------------------------------------------------------------
  // Easiest path for a desktop/browser game: if the player has the Player2 app
  // running, ask it for a key. Falls back to whatever you pass to setKey() (e.g.
  // an OAuth flow) if the app isn't present.
  async authenticate() {
    const res = await fetch(`${LOCAL_APP_BASE}/login/web/${this.gameClientId}`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(
        `Player2 app login failed (${res.status}). Is the Player2 app running?`,
      );
    }
    const { p2Key } = await res.json();
    this.p2Key = p2Key;
    return p2Key;
  }

  setKey(p2Key) {
    this.p2Key = p2Key;
  }

  get isAuthenticated() {
    return Boolean(this.p2Key);
  }

  // ---- Low-level request --------------------------------------------------
  // Not rate-limited on its own; sync callers wrap this in this.queue.run().
  async _request(path, { method = "GET", body, headers = {}, signal } = {}) {
    if (!this.p2Key) throw new Error("Not authenticated. Call authenticate() first.");
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${this.p2Key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this._handle(res);
  }

  async _handle(res) {
    if (res.status === 429) {
      const ra = res.headers.get("retry-after");
      throw new RateLimitError(ra ? Number(ra) : undefined);
    }
    if (res.status === 402) {
      throw new InsufficientCreditsError(await res.text().catch(() => ""));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Player2 API ${res.status}: ${detail}`);
    }
    // Some endpoints (kill, chat-accepted) return empty bodies.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ===========================================================================
  // 1. SYNCHRONOUS calls  — all funneled through the queue.
  // ===========================================================================

  /**
   * Chat completion (non-streaming). Use for content generation: levels,
   * enemies, weapons, etc. OpenAI-compatible request/response shape.
   * @param {Array<{role:string, content:any}>} messages
   * @param {object} [opts]  Extra ChatCompletionRequest fields (temperature...).
   * @returns {Promise<string>} The assistant message content.
   */
  chat(messages, opts = {}) {
    return this.queue.run(async () => {
      const data = await this._request("/chat/completions", {
        method: "POST",
        body: { messages, stream: false, ...opts },
      });
      return data.choices?.[0]?.message?.content ?? "";
    });
  }

  /**
   * Convenience: ask for JSON and parse it. Great for "generate a level" style
   * calls. Strips ```json fences if the model adds them.
   */
  async chatJSON(messages, opts = {}) {
    const raw = await this.chat(messages, opts);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    return JSON.parse(cleaned);
  }

  /**
   * Streaming chat completion. Calls onDelta(textChunk) as tokens arrive.
   * Returns the full concatenated text. Not queued the same way — it holds a
   * connection open; we still take a queue slot so it counts against the budget.
   */
  chatStream(messages, onDelta, opts = {}) {
    return this.queue.run(async () => {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.p2Key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages, stream: true, ...opts }),
      });
      if (!res.ok) return this._handle(res); // throws with the right error type
      let full = "";
      for await (const evt of parseSSE(res.body)) {
        if (evt.data === "[DONE]") break;
        try {
          const chunk = JSON.parse(evt.data);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onDelta?.(delta);
          }
        } catch {
          /* ignore keep-alive / non-JSON lines */
        }
      }
      return full;
    });
  }

  /**
   * Synchronous image generation -> base64 PNG (no data-URI prefix).
   * For batch sprite generation prefer enqueueImageJob() (async, unthrottled).
   * @param {string} prompt
   * @param {object} [opts]  e.g. { width, height, project_id }
   */
  generateImage(prompt, opts = {}) {
    return this.queue.run(async () => {
      const data = await this._request("/image/generate", {
        method: "POST",
        body: { prompt, ...opts },
      });
      return data.image; // base64 PNG
    });
  }

  /**
   * Text-to-speech. Returns whatever /tts/speak returns (base64 audio). Shape
   * depends on options; kept generic so you can pass voice_ids/audio_format.
   */
  tts(text, opts = {}) {
    return this.queue.run(() =>
      this._request("/tts/speak", { method: "POST", body: { text, ...opts } }),
    );
  }

  embeddings(input, opts = {}) {
    return this.queue.run(() =>
      this._request("/embeddings", { method: "POST", body: { input, ...opts } }),
    );
  }

  // ===========================================================================
  // 2. ASYNC JOBS  — enqueue freely, poll for results. NOT on the sync queue.
  // ===========================================================================

  /** Enqueue an async image (sprite) job. Returns { job_id }. */
  enqueueImageJob(body) {
    return this._request("/image/generate_job", { method: "POST", body });
  }

  /** Generate a 3D model (GLB) from an image. Returns { job_id }. */
  generateModel3DFromImage(body) {
    return this._request("/model3d/generate_from_image", { method: "POST", body });
  }

  /** Generate a 3D model (GLB) from a text prompt. Returns { job_id }. */
  generateModel3DFromText(prompt) {
    return this._request("/text3d/generate", { method: "POST", body: { prompt } });
  }

  /** Video generation. Returns { job_id } (poll with jobs.waitForVideo()). */
  generateVideo(body) {
    return this._request("/video/generate", { method: "POST", body });
  }

  // ===========================================================================
  // 3. STREAMS  — one persistent connection each. Never queued.
  // ===========================================================================

  /** Spawn an AI NPC. Returns the npc_id (UUID string). */
  spawnNpc(config) {
    // spawn returns a bare JSON string uuid; keep it off the sync queue since
    // it's a control-plane call, not a model inference.
    return this._request("/npcs/spawn", { method: "POST", body: config });
  }

  /** Send a player message to an NPC. Reply arrives on the response stream. */
  npcChat(npcId, { sender_name, sender_message, game_state_info, tts }) {
    return this._request(`/npcs/${npcId}/chat`, {
      method: "POST",
      body: { sender_name, sender_message, game_state_info, tts },
    });
  }

  killNpc(npcId) {
    return this._request(`/npcs/${npcId}/kill`, { method: "POST" });
  }

  /**
   * Open the ONE persistent stream that carries replies from all NPCs.
   * onMessage receives parsed NpcApiChatResponse objects: { npc_id, message,
   * audio, command, error }. Auto-reconnects. Returns a handle with .close().
   */
  connectNpcStream(onMessage) {
    if (this._npcStream) return this._npcStream; // enforce a single stream
    const controller = new AbortController();
    let closed = false;

    const loop = async () => {
      while (!closed) {
        try {
          const res = await fetch(`${this.baseUrl}/npcs/responses`, {
            headers: {
              Authorization: `Bearer ${this.p2Key}`,
              Accept: "application/json", // newline-delimited JSON
            },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`npc stream ${res.status}`);
          for await (const line of parseNDJSON(res.body)) {
            try {
              onMessage(JSON.parse(line));
            } catch {
              /* skip ping / malformed lines */
            }
          }
        } catch (err) {
          if (closed) break;
          await new Promise((r) => setTimeout(r, 2000)); // reconnect backoff
        }
      }
    };
    loop();

    this._npcStream = {
      close: () => {
        closed = true;
        controller.abort();
        this._npcStream = null;
      },
    };
    return this._npcStream;
  }

  // ---- Health -------------------------------------------------------------
  // Ping every 60s so play time is attributed to the game. Not needed while the
  // NPC response stream is open (that tracks play time automatically), but
  // harmless and useful during the base/meta layer.
  startHealthPings() {
    if (this._healthTimer) return;
    const ping = () => this._request("/health").catch(() => {});
    ping();
    this._healthTimer = setInterval(ping, 60_000);
  }

  stopHealthPings() {
    clearInterval(this._healthTimer);
    this._healthTimer = null;
  }

  /** Player's remaining AI power. Watch this to prompt top-ups. */
  getJoules() {
    return this._request("/joules");
  }
}

// ---- Job manager ----------------------------------------------------------
// Async jobs return a job_id; the server does the queuing. We just poll for
// completion. The spec concretely defines the video job status shape at
// /video/job/{id}; image/3D/music jobs use the same enqueue->poll pattern but
// the exact status path isn't nailed down in the spec (docs mention
// /jobs/{id} and an SSE /jobs/events feed). Wire pollPath once confirmed.
class JobManager {
  constructor(client) {
    this.client = client;
  }

  /**
   * Poll a job status URL until status is terminal.
   * @param {string} path e.g. `/video/job/${jobId}`
   * @param {object} [opts] { intervalMs, timeoutMs, isDone, isFailed }
   */
  async poll(path, opts = {}) {
    const {
      intervalMs = 3000,
      timeoutMs = 5 * 60_000,
      isDone = (s) => s.status === "completed",
      isFailed = (s) => s.status === "failed",
    } = opts;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.client._request(path);
      if (isFailed(status)) {
        throw new Error(status.error_message || "Job failed");
      }
      if (isDone(status)) return status;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Job timed out: ${path}`);
  }

  /** Convenience for video: enqueue result -> completed status object. */
  waitForVideo(jobId, opts) {
    return this.poll(`/video/job/${jobId}`, opts);
  }
}

// ---- Stream parsing helpers -----------------------------------------------

// Yields { event, data } objects from a Server-Sent Events body stream.
async function* parseSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      yield { event, data };
    }
  }
}

// Yields individual non-empty lines from a newline-delimited JSON body stream.
async function* parseNDJSON(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield line;
    }
  }
}
