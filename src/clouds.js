import * as THREE from 'three';
import { jitterGeometry, mulberry32, makeCloudTexture } from './util.js';
import { ISLAND_POS } from './island.js';

// Layered volumetric-feel cloud system:
//  A: 3 big fluffy foreground billboards under the island (bright, soft)
//  B: sparse semi-transparent mid-layer sheets
//  C: one wide far fog band + fog-shrouded floating mountains
export function buildClouds(ctx) {
  const { graybox } = ctx;
  const group = new THREE.Group();
  const rand = mulberry32(2024);

  const cloudTexA = makeCloudTexture(3);
  const cloudTexB = makeCloudTexture(17);

  const mkMat = (tex, color, opacity) => graybox
    ? ctx.gray
    : new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false });

  if (!graybox) {
    // ---- layer A: 3 big soft foreground clouds under/around the island ----
    const matA = mkMat(cloudTexA, 0xf2eaf6, 0.92);
    const defsA = [
      [ISLAND_POS.x - 33, 0, -50, 52, 0.4],
      [ISLAND_POS.x + 16, -1, -48, 62, 2.2],
      [ISLAND_POS.x + 38, 2, -26, 44, 4.0],
    ];
    for (const [x, y, z, s, rot] of defsA) {
      const sp = new THREE.Sprite(matA.clone());
      sp.material.rotation = rot;
      sp.position.set(x, y, z);
      sp.scale.set(s, s * 0.42, 1);
      group.add(sp);
    }

    // ---- layer B: sparse mid sheets, semi-transparent ----
    const matB = mkMat(cloudTexB, 0xcfc6de, 0.5);
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(matB.clone());
      sp.material.rotation = rand() * Math.PI * 2;
      sp.position.set((rand() - 0.5) * 240, -8 + rand() * 10, -40 - rand() * 130);
      const s = 26 + rand() * 22;
      sp.scale.set(s, s * 0.36, 1);
      group.add(sp);
    }

    // ---- layer C: one wide far fog band near the horizon ----
    const matC = mkMat(cloudTexA, 0x9a90b8, 0.28);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(matC.clone());
      sp.material.rotation = rand() * Math.PI;
      sp.position.set(-120 + i * 80 + (rand() - 0.5) * 30, -12 + rand() * 6, -180 - rand() * 60);
      const s = 130 + rand() * 60;
      sp.scale.set(s, s * 0.2, 1);
      group.add(sp);
    }
  } else {
    // graybox: keep a hint of cloud masses in the shared gray
    const mat = new THREE.SpriteMaterial({ map: cloudTexA, color: 0x9a9a9a, transparent: true, opacity: 0.8, depthWrite: false });
    const defsA = [
      [ISLAND_POS.x - 24, 1, -30, 52, 0.4],
      [ISLAND_POS.x + 16, -1, -48, 62, 2.2],
      [ISLAND_POS.x + 38, 2, -26, 44, 4.0],
    ];
    for (const [x, y, z, s, rot] of defsA) {
      const sp = new THREE.Sprite(mat.clone());
      sp.material.rotation = rot;
      sp.position.set(x, y, z);
      sp.scale.set(s, s * 0.42, 1);
      group.add(sp);
    }
  }

  // ---- distant floating mountains in the fog ----
  const mtnMat = graybox
    ? ctx.gray
    : new THREE.MeshStandardMaterial({ color: 0x3a3152, roughness: 1, metalness: 0, flatShading: true });
  const defs = [
    [-40, 4, -195, 22, 58, 3],
    [58, -4, -225, 26, 70, 17],
    [-72, 8, -250, 20, 50, 29],
  ];
  for (const [x, y, z, r, h, seed] of defs) {
    const g = jitterGeometry(new THREE.ConeGeometry(r, h, 9, 4), r * 0.22, seed);
    const mtn = new THREE.Mesh(g, mtnMat);
    mtn.position.set(x, y + h / 2, z);
    mtn.rotation.y = seed;
    group.add(mtn);
    const root = new THREE.Mesh(jitterGeometry(new THREE.ConeGeometry(r * 0.8, h * 0.5, 8, 3), r * 0.2, seed + 1), mtnMat);
    root.rotation.x = Math.PI;
    root.position.set(x, y - h * 0.2, z);
    group.add(root);
  }
  return group;
}
