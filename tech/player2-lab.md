---
type: tech
category: development-tools
status: designed
resolution: sharp
needs: []
related: [asset-generation, level-generation]
---

# Player2 Lab

How the standalone test bench for every Player2 generation modality is built. Implements `design/player2-lab.md`; the layout is `design/player2-lab.mockup.html`.

## Slices

| # | Slice | Runtime behaviour |
|---|---|---|
| L0 | **Client, additive.** `src/player2/client.js` gains what the Lab needs and the game never asked for, all going through the existing queue, auth header and `_handle` error typing: a request that returns the **whole** parsed response (the game's `chat()` returns only the content and drops `model`); a streamed chat that reports the `model` from its chunks as well as the text (`chatStream` returns text only); a request whose body is raw bytes with query parameters (`/stt/audio` takes `application/octet-stream`); a request that hands back the response **body stream** rather than parsing it (`/tts/stream` answers `application/octet-stream`); and two **optional** options on `JobManager.poll`, a per-tick status callback and an abort signal (today it only resolves at the end). No existing method changes its arguments, defaults or return shape. The new suite also pins `chat`'s and `chatStream`'s current return shapes, which nothing guards today | **Unchanged.** Nothing calls the additions yet |
| L1 | **The page, with Chat and Embeddings.** `player2-lab.html` at the repo root, linked from nowhere. It connects through the local app, shows connection status, joule balance and patron tier, and has a rail listing the modalities built so far. It builds the form from the modality table, stamps the per-modality model label, records every run in a session-only store, and shows run cards with the reported model and Raw. The compare view highlights inputs and model names that differ. Chat takes a conversation (a system message, then any number of user and assistant turns, each removable), streamed or whole replies, JSON mode and tools; **Continue** on a chat card loads that run's conversation plus its reply into the form as the next assistant turn; embeddings takes a model and dimensions and shows vector length plus the leading values | New page. **First usable.** |
| L2 | **Speech.** TTS: the voice list from `/tts/voices`, multi-select, speed, format, delivery instructions, and a **stream** switch that sends to `/tts/stream` (mp3/wav only) and plays as bytes arrive; the output is an audio player plus, from `style_outcome`, the provider and whether the instructions reached it (`fidelity`). STT: file upload or mic recording, plus language; the output is the transcript, confidence, duration and word timings. **→ Speech to text** on a TTS card. Builds the audio player L4 reuses | New modalities on the page |
| L3 | **Images.** Generate (prompt, width, height) and edit (prompt, 1..n source images, aspect ratio or size), with a download button on the output. A source image is an upload or, through **→ Image edit** on any image-generate or image-edit card, that run's output. Builds the image-upload field L4 reuses | New modalities on the page |
| L4 | **Slow jobs: music, video, 3D.** One job runner: enqueue, poll, a progress card (status label plus elapsed time), several jobs at once, and the job count in the top bar. Music is audio. Video has three modes: a prompt, a prompt plus a start image, or transform an image (`/video/transform_image`: edit, then animate; 60J). All three poll `/video/job/{id}`. 3D comes from a prompt or an image and shows in a GLB viewer with orbit controls | New modalities on the page. **After this slice every modality in the design is present** |

- L0 is additive, and the existing client test is its guard.
- L1–L4 each land alone: each adds rows to the modality table and the players those rows need.
- L2 and L3 are independent of each other after L1. **L4 comes after both**: music reuses L2's audio player, and video-from-image and 3D-from-image reuse L3's image-upload field.
- Acceptance for L1–L4 is Bo using it against a live account. The tests cover the logic, not the endpoints.

## Reuses

| Existing | Used for |
|---|---|
| `src/player2/client.js` `Player2Client` | `authenticate()` against the local app, `_request`'s error typing (`RateLimitError`, `InsufficientCreditsError`), `getJoules()`, `TaskQueue` concurrency and 429 back-off for every sync call, `JobManager.poll` (not exported; reached as `client.jobs`) for jobs |
| `src/player2/queue.js` `TaskQueue` | Through the client, unchanged |
| `src/player2/config.js` `GAME_CLIENT_ID` | The client id. The Lab does **not** read `player2GameClientId` from `src/game/config.js`: that is the game's settings store, and the design keeps the Lab out of the game |
| The `index.html` import map | The same Three.js version and CDN, copied into `player2-lab.html`, plus `three/addons/` for `GLTFLoader` and `OrbitControls` |
| `design.html` → `src/docmap/app.js` | The shape of a standalone root page: one HTML file, one module entry |
| `design/player2-lab.mockup.html` | Layout, CSS tokens, the card anatomy, and the model-name rule (reported, then your label, then voice sent, then "(not reported)"). It is a mockup: its sample data and its extra controls are not a spec (see Approximations) |
| `test/harness.mjs` | `installDom()` / `stubLocalStorage()` for the headless suite |

## Where the code goes

| Path | What |
|---|---|
| `player2-lab.html` (new, repo root) | The page shell and the import map. No link to it from `index.html`, `editor.html`, `design.html` or any hub screen |
| `src/player2lab/modalities.js` (new) | The modality table as data. Per modality: its label and group, its fields (kind, default, enum), the endpoint(s), how a form becomes a request, how a response becomes an output, where the reported model lives, and whether it is sync or a job. Adding a modality means adding a row |
| `src/player2lab/runs.js` (new) | The session run store and the rules the compare view uses: the model-name rule, which inputs differ, joules attribution. DOM-free |
| `src/player2lab/audio.js` (new) | Any decoded audio → 16-bit PCM WAV bytes. The pure encoder is testable; the decode step goes through `AudioContext` |
| `src/player2lab/app.js` (new) | The DOM: top bar, rail, form, run cards, compare grid, the players, mic recording, the GLB viewer. The only module that touches `document`, `fetch` or `three` |
| `src/player2/client.js` | L0's additions, and nothing else |
| `test/player2-lab.test.mjs` (new) | A new subsystem, so a new suite. It covers the client's additions with a stubbed `fetch`, every modality's request build and response extraction from fixture responses, the run store's rules, and the WAV encoder |

Repo conventions that apply: no build step, no dependencies, native ESM, guarded storage (none is needed: the design says runs live for the session only).

## The seam

| The Lab owns | The Lab must not touch |
|---|---|
| Everything under the `player2lab` source folder, and `player2-lab.html` | Anything under `src/game/`, `src/mission/`, `src/hub/`, `src/editor/`, `src/net/`, and `server.mjs`. The Lab imports nothing from them |
| Additive methods and options on `Player2Client` and `JobManager.poll` | The existing methods' signatures, defaults and return values. The game's callers are `src/editor/tools/enemy-designer.js` (`authenticate`) and `src/game/enemyspec/generate.js` (`chatJSON`, which calls `chat`) |
| Its own constants (poll interval, job timeout, how much of a base64 string Raw keeps) in the modality table | The config `SCHEMA`. The "everything tweakable goes in the schema" rule is for the game; the design takes the Lab out of the game, and a schema entry would put a Lab knob into the game's Settings tab |

The **wire** is not involved: the Lab has no state that a room would simulate.

## Must not regress

| Guard | Why |
|---|---|
| `test/enemyspec-generate.test.mjs` | The only existing test that constructs the real `Player2Client`. It stubs `chat` and pins only `chatJSON`'s fence stripping, so it does **not** guard `chat`, `chatStream`, `authenticate` or `poll` |
| `test/player2-lab.test.mjs` (new) | From L0: pins `chat`'s and `chatStream`'s return shapes and `poll`'s default behaviour against a stubbed `fetch`, which is the guard the line above lacks |
| `test/docs.test.mjs` | This spec's citations. (It does not check the mockup: mockup discovery needs the browser's directory listing) |
| `node test/run.mjs` (all suites) | Nothing the game imports changes, so everything else is expected to stay byte-identical |
| Serve check | `player2-lab.html` and every `src/player2lab/*` module return 200 under `python3 -m http.server` |

**Where the bar cannot see:** `src/player2lab/app.js` and the live endpoints. No test drives a real Player2 account, the mic, audio playback or WebGL. `authenticate` stays unguarded; Enemy Designer → Connect + Generate is the manual check that L0 did not break the game's live callers.

## Approximations

| What is not exact | Why | What catches it |
|---|---|---|
| **Joules per run is a balance difference.** The API does not return a cost. `/joules` is read when a run is **enqueued** (not when it leaves the queue) and when it ends, and the difference is attributed only if no other run was queued or in flight in that window. Otherwise the card shows "—". While a video, music or 3D job is open, which takes minutes, every other run in that time shows "—" | Several runs at a time is a design requirement, and costs cannot be separated when they overlap | The top-bar balance stays exact. A run showing "—" is honest rather than wrong |
| **Duration is wall time measured by the client**, from send to final output. For jobs this includes Player2's queue time | That is what the tester waits through; the API does not report compute time | — |
| **Every STT input is re-encoded to 16-bit PCM WAV** before sending, whether it came from the mic, a file or a TTS run. It is sent as `encoding=wav` with its real sample rate. Raw therefore shows the WAV that was actually sent, and names the source it was made from, rather than the file as supplied | One path instead of three. `MediaRecorder` produces webm, TTS can return `ogg`/`pcm`, and neither maps cleanly onto the STT `encoding` enum. A file the browser cannot decode is sent raw, with the encoding guessed from its extension | The suite checks the encoder. Bo checks the round trip |
| **Job progress is a status label plus elapsed time**, not a percentage. Video's status is `pending`/`processing`/`completed`/`failed`; music and 3D statuses are shown as whatever the payload says | No endpoint reports a percentage | — |
| **The job-status route for music and 3D is undocumented.** The public spec lists `GET /video/job/{id}` only; 3D says "poll `GET /jobs/{job_id}`" without a shape, and music points at an SSE feed. The Lab polls `/jobs/{id}` for music and 3D and hunts the result for an asset id or a URL, resolving an asset id through `GET /assets/{id}`. That is the method a July 2026 prototype outside this repo (`api_test/model-3d.html`) used successfully for 3D | That is all the spec gives | A job the Lab cannot resolve ends as a failed card with the raw status payload in Raw, not as a silent hang (poll timeout from the modality table) |
| **Streamed chat takes the reported model from the stream chunks**, where OpenAI-style chunks carry `model` | Not stated in Player2's spec | If it is absent, the card falls back to your label, which the model-name rule already handles |
| **Streamed chat shows text only.** Tool calls arrive as fragments in the stream and `chatStreamFull` collects content deltas, so a streamed run with tools shows the reply text and no `tool_calls`; a whole reply shows both | Found building L1. Assembling tool-call fragments is its own parser for one switch combination | Turn Stream off to see tool calls |
| **Raw shortens base64** to a head and a length | Images and audio would make Raw unreadable | — |
| **Streamed TTS plays progressively only where the browser can append the format.** mp3 goes through `MediaSource`; wav, or a browser without mp3 `MediaSource` support, plays when the last byte lands. Either way the card records time to first byte | A WAV header carries a length the stream does not know yet | The card says which playback it used |
| **A streamed TTS run reports no provider.** `/tts/stream` returns bare audio, with no `style_outcome` | The endpoint returns nothing else | The model-name rule falls back to the voice sent, then your label |

## What the API gives the Lab

Sourced from `https://api.player2.game/v1/openapi.json`, fetched 2026-09-28 (the docs site is a JS app; this is its readable form).

| Modality | Request | Reported model | Kind |
|---|---|---|---|
| Chat | `POST /chat/completions` — messages, temperature, max_tokens, response_format, tools, stream | `model` on the response | sync / SSE |
| Embeddings | `POST /embeddings` — input, **model**, dimensions | `model` | sync |
| TTS | `POST /tts/speak` — text, voice_ids, speed, audio_format, voice_gender, voice_language, advanced_voice.instructions → base64 `data`, plus `style_outcome` { provider, fidelity: `full`/`dropped` } | `style_outcome.provider`, **only when instructions were sent** | sync |
| TTS stream | `POST /tts/stream` — same body, audio_format mp3/wav only → `application/octet-stream` | none | stream |
| Voices | `GET /tts/voices` → id, name, language, gender | — | sync |
| STT | `POST /stt/audio?encoding&sample_rate&language`, raw body → transcript, confidence, duration, words | none | sync |
| Image generate | `POST /image/generate` — prompt, width, height → base64 PNG | none | sync |
| Image edit | `POST /image/edit` — prompt, image or images[], aspect_ratio or width/height → base64 + mimetype | none | sync |
| Video | `POST /video/generate`, `POST /video/generate_from_image`, `POST /video/transform_image` (edit + video, 60J, 480p 5s) — prompt, aspect_ratio, image → job; `GET /video/job/{id}` → status, video_url | none | job |
| Music | `POST /music/generate_job` — prompt, duration_seconds (3–300), force_instrumental → job | none | job |
| 3D | `POST /text3d/generate` (prompt), `POST /model3d/generate_from_image` (image) → job; the GLB comes back as an asset | none | job |
| Balance | `GET /joules` → joules, patron_tier | — | sync |

Auth is `POST http://localhost:4315/v1/login/web/{client id}` → `p2Key`, then `Authorization: Bearer` against `https://api.player2.game/v1`. No request selects a model except embeddings: the account's selection in Player2's interface decides, which is why the design compares runs and carries a model label.
