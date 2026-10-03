// ---------------------------------------------------------------------------
// 3D VIEW — Blender-made armour (tech/mission-3d-looks.md, L3).
//
// The helmet and chest in ./models/ replace the soldier's helmet, visor,
// torso, stripe and pad cubes. Built in Blender by graphics-tester/models/
// *.py (kit.py has the conventions and exports the .glb here): two materials
// each, so two draw calls a piece.
//   Shell  - the armour. Cloned per soldier and tinted with the part it
//            replaces, so squad colour and the hit flash read through
//            applyFlash like any other part.
//   Detail - everything else, colour and glow from an 8x1 palette texture.
//            Shared by every soldier.
// Loaded once per page. Until it arrives — or if it never does — the cubes
// stay, so the view is never worse than without it.
// ---------------------------------------------------------------------------

import { shade } from "./util.js";

const FILES = { helmet: "helmet.glb", chest: "chest.glb" };

let kit = null; // { helmet, chest } scenes once loaded
let loading = null;

// Start the load (idempotent). Resolves either way; a failure leaves cubes.
export function loadArmour() {
  loading ??= import("three/addons/loaders/GLTFLoader.js")
    .then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      return Promise.all(Object.entries(FILES).map(([k, f]) =>
        loader.loadAsync(new URL(`./models/${f}`, import.meta.url).href).then((g) => [k, g.scene])));
    })
    .then((pairs) => {
      kit = Object.fromEntries(pairs);
      // Shared across every clone and every deploy: disposeTree leaves them.
      for (const root of Object.values(kit)) {
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.userData.shared = true;
          if (o.material.name !== "Shell") o.material.userData.shared = true;
        });
      }
    })
    .catch((err) => console.warn("3D armour did not load; keeping the plain parts", err));
  return loading;
}

// The armour for one soldier model, or null while the kit is not loaded.
// `tones` are the parts' TONE values, so the Shell matches the cube it hides.
export function makeArmour(color, tones) {
  if (!kit) return null;
  const mats = [];
  const piece = (name, tone) => {
    const obj = kit[name].clone();
    obj.traverse((o) => {
      if (!o.isMesh || o.material.name !== "Shell") return;
      o.material = o.material.clone();
      o.material.userData.base = shade(color, tone);
      mats.push(o.material);
    });
    return obj;
  };
  return { helmet: piece("helmet", tones.helmet), chest: piece("chest", tones.torso), mats };
}

const HELMET_FIT = 1.12; // model units across the shell → × the part's width
const HELMET_LIFT = 0.11; // the shell's vertical centre, in model units
const CHEST_TUCK = 0.15; // how far the collar may rise into the helmet, × its height

// Fit both pieces to this frame's parts (already laid out, and with arms on,
// already pulled in) and hide what they replace. Both live in the upper-body
// group beside the parts. Disposal is the model's: disposeTree frees each
// soldier's Shell and skips the shared geometry and Detail.
export function fitArmour(a, parts) {
  const { helmet, torso } = parts;
  for (const k of ["helmet", "visor", "torso", "stripe", "pad"]) parts[k].visible = false;

  // Uniform: a head keeps its shape whatever box it is given.
  const s = helmet.scale.x * HELMET_FIT;
  a.helmet.scale.setScalar(s);
  a.helmet.position.set(helmet.position.x, helmet.position.y - HELMET_LIFT * s, helmet.position.z);

  // Stretched to the torso box, except the top stops just inside the
  // helmet's bottom: crouched, the layout sinks the head deep into the torso
  // box, which a same-coloured cube hid and a chest plate does not.
  const bottom = torso.position.y - torso.scale.y / 2;
  const top = Math.min(torso.position.y + torso.scale.y / 2,
    helmet.position.y - helmet.scale.y / 2 + CHEST_TUCK * helmet.scale.y);
  a.chest.scale.set(torso.scale.x, top - bottom, torso.scale.z);
  a.chest.position.set(torso.position.x, (top + bottom) / 2, torso.position.z);
}
