// ---------------------------------------------------------------------------
// SPACE FPS — vectors and quaternions (tech/space-fps.md). Plain arrays:
// a vector is [x, y, z], a quaternion [x, y, z, w]. Pure, DOM-free.
//
// A body's orientation q maps its local axes to the world, three.js camera
// style: local -Z is forward (the look), +Y is up, +X is right.
// ---------------------------------------------------------------------------

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function norm(a) {
  const l = len(a);
  return l ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
// Positions of things that carry x, y, z fields.
export const pos = (o) => [o.x, o.y, o.z];
export const vel = (o) => [o.vx, o.vy, o.vz];
export const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Any unit vector perpendicular to unit a.
export function perp(a) {
  const o = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm(cross(a, o));
}

// A random unit vector, from two draws.
export function randomDir(rng) {
  const z = rng() * 2 - 1;
  const p = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [Math.cos(p) * s, Math.sin(p) * s, z];
}

// ---- quaternions ------------------------------------------------------------
export const QI = () => [0, 0, 0, 1];

export function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];

export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qaxis(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

export function qrot(q, v) {
  const [x, y, z, w] = q;
  // t = 2 q.xyz × v; v' = v + w t + q.xyz × t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

// The shortest rotation taking unit a onto unit b.
export function qfromTo(a, b) {
  const d = dot(a, b);
  if (d < -0.999999) return qaxis(perp(a), Math.PI);
  const c = cross(a, b);
  return qnorm([c[0], c[1], c[2], 1 + d]);
}

// The rotation whose local axes are right (+X), up (+Y) and back (+Z), all
// unit and orthogonal.
export function qfromBasis(r, u, b) {
  const m00 = r[0], m01 = u[0], m02 = b[0];
  const m10 = r[1], m11 = u[1], m12 = b[1];
  const m20 = r[2], m21 = u[2], m22 = b[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qnorm(q);
}

// A body facing f (unit) with up as near u as f allows.
export function qlook(f, u) {
  const r = norm(cross(f, u));
  if (!len(r)) return qfromTo([0, 0, -1], f);
  const up = cross(r, f);
  return qfromBasis(r, up, [-f[0], -f[1], -f[2]]);
}

// The angle a rotation turns through, 0..π.
export const qangle = (q) => 2 * Math.acos(Math.min(1, Math.abs(q[3])));

export function qslerp(a, b, t) {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (d > 0.9995) return qnorm([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  const th = Math.acos(d);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [a[0] * ka + bx * kb, a[1] * ka + by * kb, a[2] * ka + bz * kb, a[3] * ka + bw * kb];
}

// Rotation r, limited to at most `max` radians of it.
export function qlimit(r, max) {
  const ang = qangle(r);
  if (ang <= max) return r;
  return qslerp(QI(), r, max / ang);
}

export const fwdOf = (q) => qrot(q, [0, 0, -1]);
export const upOfQ = (q) => qrot(q, [0, 1, 0]);
export const rightOf = (q) => qrot(q, [1, 0, 0]);
