// ---------------------------------------------------------------------------
// THE STABLE HANDLE  (tech/multiplayer-session.md W3; extracted at V2)
//
// One seat's view of its own latest snapshot. Lived inside
// `src/net/loopback.js` until there was a second transport; it is here so that
// both import the ONE implementation, because a copy that drifts is two
// transports that behave differently — the exact failure the whole seam exists
// to prevent.
//
// An OBJECT, not an accessor function: `livingRoster(g)` and `soldierMaxHp(s)`
// are handed this directly by the hub and by the ambient layer, so it has to
// look like a campaign. Its identity never changes, because the hub captures it
// once in its constructor and the ambient layer holds it in a module-level
// binding — handing out a fresh object per refresh would leave both of them
// pointed at a snapshot that stops being updated.
//
// Every field READS THROUGH on access. That is not a style choice: advanceDay
// and applyMissionResult REPLACE `state.leads` and `state.roster` rather than
// mutating them, so a handle that copied field values at refresh time would be
// stale one command later while still pointing at the right snapshot.
//
// The key set is fixed at construction, from the first snapshot. Every snapshot
// of a seat is the same projection (`VIEW_FIELDS` in `src/game/session.js` plus
// `leads`, `taskForce` and `playerId`), so this costs nothing today — and it is
// stated because a field that appears only in LATER snapshots would be missing
// from the handle rather than undefined on it. V4's connected flag is added to
// the taskForce entries inside the snapshot, not as a new top-level field, for
// exactly this reason.
// ---------------------------------------------------------------------------

export function makeHandle(read) {
  const handle = {};
  for (const key of Object.keys(read())) {
    Object.defineProperty(handle, key, { get: () => read()[key], enumerable: true });
  }
  return handle;
}
