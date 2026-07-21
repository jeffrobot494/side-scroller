// Global game state for the base/meta layer. Kept deliberately simple: one
// mutable object plus the actions that change it. Later this is what gets
// saved/loaded and what the LLM-generated content plugs into.

import { RECRUIT_POOL } from "./soldiers.js";

export const state = {
  money: 750,
  // Clone the pool so hiring mutates game state, not the source data.
  recruits: RECRUIT_POOL.map((s) => structuredClone(s)),
  roster: [],
};

// Attempt to hire a recruit by id. Returns { ok, reason } so the UI can react.
export function hire(id) {
  const i = state.recruits.findIndex((r) => r.id === id);
  if (i === -1) return { ok: false, reason: "That recruit is no longer available." };

  const rec = state.recruits[i];
  if (state.money < rec.cost) {
    return { ok: false, reason: "Not enough credits." };
  }

  state.money -= rec.cost;
  rec.status = "roster";
  state.recruits.splice(i, 1);
  state.roster.push(rec);
  return { ok: true };
}
