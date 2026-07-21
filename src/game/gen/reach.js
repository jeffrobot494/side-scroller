// ---------------------------------------------------------------------------
// REACHABILITY ENVELOPE — what a soldier can jump, derived from the same config
// the mission physics use (gravity, jumpSpeed, runSpeed). Generation asks this
// module "is a platform at this height reachable?" so it never places a perch
// the player can't get to. Because tuning gravity/jump in the editor changes
// these numbers, generated geometry re-shapes itself automatically.
//
// Slice 1 uses a CONTINUOUS GROUND SLAB, so traversal is always guaranteed and
// floating platforms are additive (loot/vantage). With continuous ground a
// perch is reachable iff its top is within maxRise of the ground — you can
// jump straight up from directly beneath it. maxRunTo(dh) supports future
// perch-to-perch chains (pits / required jumps in a later slice).
// ---------------------------------------------------------------------------

// cfg: { gravity, jumpSpeed, runSpeed } (matches the config keys).
export function jumpEnvelope(cfg) {
  const g = cfg.gravity;
  const v = cfg.jumpSpeed;
  const run = cfg.runSpeed;

  const apexTime = v / g; // seconds to the top of the jump
  const maxRise = (v * v) / (2 * g); // peak height above takeoff (px)
  const airtime = 2 * apexTime; // up and back to takeoff height (flat)
  const flatReach = run * airtime; // horizontal distance on a flat hop (px)

  // Max horizontal distance to still land ON TOP of a platform whose top is `dh`
  // px ABOVE the takeoff foot level. You descend onto the top, so the usable
  // time is the LATEST moment at height dh (airtime − tUp, tUp = time first
  // reaching dh while rising). Higher perch → less horizontal reach. dh <= 0
  // (level/below) → full flatReach; dh > maxRise → unreachable (-1).
  function maxRunTo(dh) {
    if (dh > maxRise) return -1;
    if (dh <= 0) return flatReach;
    const disc = v * v - 2 * g * dh;
    if (disc < 0) return -1;
    const tUp = (v - Math.sqrt(disc)) / g;
    return run * (airtime - tUp);
  }

  // Is a perch reachable straight up from continuous ground beneath it?
  function perchReachable(dh) {
    return dh > 0 && dh <= maxRise;
  }

  return { apexTime, maxRise, airtime, flatReach, maxRunTo, perchReachable };
}
