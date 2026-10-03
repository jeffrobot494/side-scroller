// ---------------------------------------------------------------------------
// GRAPHICS TESTER — experiments.
//
// Each entry is a layer over the subject, toggled from the sidebar:
//   { id, label, attach(ctx) → { update(ctx), dispose() } }
// ctx = { THREE, scene, root (the subject's model group), soldier (the fake
// entity), time }. An experiment that wins is moved into src/mission/view3d/
// and deleted from here.
// ---------------------------------------------------------------------------

export const EXPERIMENTS = [];
