// ---------------------------------------------------------------------------
// 3D VIEW — terrain (tech/mission-3d.md).
//
// Every platform is its collision box extruded to TERRAIN_DEPTH, centred on
// z=0, so a body's feet meet the top surface exactly on the plane the camera
// is solved for. Built once per deploy and merged into one mesh per material:
// a generated level is a few hundred boxes and none of them ever move.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { viewY } from "./util.js";

// Shallow on purpose: a face at +z projects slightly larger than the box it
// belongs to, so depth is paid for in edge error (Approximations).
export const TERRAIN_DEPTH = 36;

const EDGE = 2; // the lit "you can stand here" strip, world px

export function buildTerrain(platforms) {
  const group = new THREE.Group();
  const bodies = [];
  const edges = [];
  for (const p of platforms) {
    const g = new THREE.BoxGeometry(p.w, p.h, TERRAIN_DEPTH);
    g.translate(p.x + p.w / 2, viewY(p.y + p.h / 2), 0);
    bodies.push(g);
    // The lit top edge, inside the top of the box so it is exactly the
    // surface the 2D view lights.
    const e = new THREE.BoxGeometry(p.w, EDGE, TERRAIN_DEPTH + 0.5);
    e.translate(p.x + p.w / 2, viewY(p.y + EDGE / 2), 0);
    edges.push(e);
  }
  if (bodies.length) {
    group.add(new THREE.Mesh(mergeGeometries(bodies),
      new THREE.MeshStandardMaterial({ color: "#27425f", roughness: 0.8, metalness: 0.25 })));
    group.add(new THREE.Mesh(mergeGeometries(edges), new THREE.MeshBasicMaterial({ color: "#6fd3ff" })));
  }
  for (const g of bodies.concat(edges)) g.dispose();
  return group;
}
