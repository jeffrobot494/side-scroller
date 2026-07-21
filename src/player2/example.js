// Reference usage of Player2Client — not wired into the game yet, just shows the
// intended flows for each call family. Delete or adapt as real systems land.

import { Player2Client } from "./client.js";
import { GAME_CLIENT_ID } from "./config.js";

// One client for the whole game.
export const p2 = new Player2Client({
  gameClientId: GAME_CLIENT_ID,
  concurrency: 3, // simultaneous synchronous calls; tune if you see 429s
});

// ---- Boot ------------------------------------------------------------------
export async function boot() {
  await p2.authenticate(); // requires the Player2 app to be running
  p2.startHealthPings();
}

// ---- Content generation (synchronous chat, auto-queued) --------------------
// These can be fired in parallel; the queue caps how many actually run at once.
export async function generateLevel(theme) {
  return p2.chatJSON([
    { role: "system", content: "You are a level designer. Reply with JSON only." },
    { role: "user", content: `Design a side-scroller level. Theme: ${theme}.` },
  ]);
}

export async function generateWeapon(tier) {
  return p2.chatJSON([
    { role: "system", content: "Design a weapon. Reply with JSON only." },
    { role: "user", content: `Tier ${tier} weapon for a run-and-gun game.` },
  ]);
}

// ---- Sprites (async job, fire many at once) --------------------------------
export async function generateSprite(prompt) {
  const { job_id } = await p2.enqueueImageJob({ prompt });
  return job_id; // track it; result asset lands when the job completes
}

// ---- Barracks 3D models (async job) ----------------------------------------
export async function generateSoldierModel(description) {
  const { job_id } = await p2.generateModel3DFromText(description);
  return job_id; // poll your jobs feed for the finished GLB
}

// ---- AI companions on-map (NPC API) ----------------------------------------
// Spawn once when a soldier joins a mission; keep the response stream open for
// the whole mission and route replies by npc_id.
export async function startCompanion(soldier) {
  const npcId = await p2.spawnNpc({
    name: soldier.name,
    short_name: soldier.name.split(" ")[0],
    character_description: soldier.bio,
    system_prompt: soldier.personalityPrompt,
    keep_game_state: true,
    tts: { voice_ids: [soldier.voiceId], speed: 1.0, audio_format: "mp3" },
    commands: [
      {
        name: "take_cover",
        description: "Order the companion to move to the nearest cover",
        parameters: { type: "object", properties: {}, required: [] },
        never_respond_with_message: false,
      },
    ],
  });
  return npcId;
}

// Call this ONCE. Dispatches every NPC's replies and command executions.
export function listenToCompanions(handlers) {
  return p2.connectNpcStream((msg) => {
    if (msg.error) return handlers.onError?.(msg.npc_id, msg.error);
    if (msg.message) handlers.onSpeech?.(msg.npc_id, msg.message, msg.audio);
    if (msg.command) {
      for (const call of msg.command) handlers.onCommand?.(msg.npc_id, call);
    }
  });
}

// Push live battle context with each message so replies fit the situation.
export function tellCompanion(npcId, playerName, text, gameState) {
  return p2.npcChat(npcId, {
    sender_name: playerName,
    sender_message: text,
    game_state_info: gameState, // e.g. "2 aliens left, you're at 20% HP, on the ridge"
    tts: "server",
  });
}
