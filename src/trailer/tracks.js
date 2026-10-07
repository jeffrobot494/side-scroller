// ---------------------------------------------------------------------------
// CAMERA TRACKS (tech/trailer.md, T1). Beat time → camera pose. Pure: no
// three, no DOM, no clock.
//
// A pose is { position, target, fov, roll } in GAME coordinates — x right,
// y DOWN, z toward the viewer, the play plane at z = 0 — which is what the 3D
// view's camera override takes.
//
// A track is { kind, keys, subject? }:
//   keys     [{ b, ... }] sorted by beat. Before the first key the track holds
//            the first; after the last it holds the last.
//   blur     optional { focus?, aperture, maxblur }: the long-lens blur (T2),
//            passed through on every pose. focus defaults to the distance to
//            the target.
//   subject  optional: the keys' points are offsets from it. `poseAt` takes
//            it as an argument ({ x, y }), so a track can follow a soldier
//            without knowing what one is.
//
// Kinds and what a key holds:
//   push, track, locked, crane   { b, pos: [x,y,z], at: [x,y,z], fov, roll? }
//                                eased in and out between keys
//   whip                         the same keys, but the move between two keys
//                                is crammed into its middle fifth: a hold, a
//                                snap, a hold
//   any key may carry ease: "whip" | "smooth", which sets how the move INTO
//   it goes, whatever the kind — one whip in an otherwise smooth track
//   orbit                        { b, center: [x,y,z], radius, angle, rise, fov }
//                                angle in degrees, 0 = straight in front (+z),
//                                positive swings toward +x; rise = camera
//                                height above center (game px, up)
// ---------------------------------------------------------------------------

export const BEAT = 0.5; // seconds: the 120 BPM placeholder grid

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (t) => t * t * (3 - 2 * t);

// The middle fifth of the interval, smoothed: the whip-pan's snap.
function whipEase(t) {
  const u = Math.min(1, Math.max(0, (t - 0.4) / 0.2));
  return smooth(u);
}

function bracket(keys, b) {
  if (b <= keys[0].b) return [keys[0], keys[0], 0];
  const last = keys[keys.length - 1];
  if (b >= last.b) return [last, last, 0];
  let i = 0;
  while (keys[i + 1].b < b) i++;
  const a = keys[i];
  const c = keys[i + 1];
  return [a, c, (b - a.b) / (c.b - a.b)];
}

const vec = (p) => ({ x: p[0], y: p[1], z: p[2] });

export function poseAt(track, b, subject = null) {
  const [a, c, raw] = bracket(track.keys, b);
  const t = (c.ease || (track.kind === "whip" ? "whip" : "smooth")) === "whip" ? whipEase(raw) : smooth(raw);
  const off = subject && track.subject !== false ? [subject.x, subject.y, 0] : [0, 0, 0];
  const add = (p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]];

  if (track.kind === "orbit") {
    const center = add(lerp3(a.center, c.center, t));
    const r = lerp(a.radius, c.radius, t);
    const ang = (lerp(a.angle, c.angle, t) * Math.PI) / 180;
    const rise = lerp(a.rise || 0, c.rise || 0, t);
    return {
      position: vec([center[0] + Math.sin(ang) * r, center[1] - rise, center[2] + Math.cos(ang) * r]),
      target: vec(center),
      fov: lerp(a.fov, c.fov, t),
      roll: 0,
      blur: track.blur || null,
    };
  }
  return {
    position: vec(add(lerp3(a.pos, c.pos, t))),
    target: vec(add(lerp3(a.at, c.at, t))),
    fov: lerp(a.fov, c.fov, t),
    roll: lerp(a.roll || 0, c.roll || 0, t),
    blur: track.blur || null,
  };
}

// The beat a frame falls on, at 60 frames a second.
export const beatOf = (frame, fps = 60) => frame / fps / BEAT;
