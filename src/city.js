import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLAND_POS } from './island.js';
import { mulberry32 } from './util.js';

// ---------------------------------------------------------------- helpers
function xform(geo, x, y, z, ry = 0, rz = 0, rx = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
  m.setPosition(x, y, z);
  geo.applyMatrix4(m);
  return geo;
}
const B = (w, h, d, x, y, z, ry, rz) => xform(new THREE.BoxGeometry(w, h, d), x, y, z, ry, rz);
const CYL = (rt, rb, h, x, y, z, seg = 12) => xform(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z);
const CONE = (r, h, x, y, z, seg = 4, ry = 0) => xform(new THREE.ConeGeometry(r, h, seg), x, y, z, ry);
// trim ring of thin edge strips around a box storey
const trimBand = (arr, w, d, y, t = 0.14) => {
  arr.push(B(w + t * 2, t, d + t * 2, 0, y, 0));
};

// ------------------------------------------------- 7 hand-tuned hero buildings
function hbObelisk(h, w) { // stepped base + shaft + pyramid cap + antenna pair + side fin
  const body = [], dark = [];
  body.push(B(w * 1.8, 1.4, w * 1.8, 0, 0.7, 0));
  body.push(B(w * 1.45, 1.2, w * 1.45, 0, 1.9, 0));
  body.push(B(w * 1.2, 0.9, w * 1.2, 0, 2.9, 0));
  body.push(B(w, h - 6.4, w, 0, 3.4 + (h - 6.4) / 2, 0));
  body.push(CONE(w * 0.72, h * 0.14, 0, h - 1.9, 0, 4, Math.PI / 4));
  body.push(B(w * 0.16, h * 0.34, w * 0.72, w * 0.62, h * 0.44, 0));
  body.push(CYL(0.06, 0.1, 3.4, w * 0.2, h + 0.2, 0, 6));
  body.push(CYL(0.05, 0.08, 2.2, -w * 0.24, h - 0.5, w * 0.2, 6));
  trimBand(dark, w, w, h * 0.52);
  trimBand(dark, w, w, h * 0.74);
  for (let i = 0; i < 4; i++) { // corner pilasters
    const a = i * Math.PI / 2 + Math.PI / 4;
    dark.push(B(0.18, h - 7, 0.18, Math.cos(a) * w * 0.72, 3.4 + (h - 7) / 2, Math.sin(a) * w * 0.72));
  }
  return { body, dark };
}

function hbTwin(h, w) { // twin slabs + two bridges + rooftop caps + antenna
  const body = [], dark = [];
  const tw = w * 0.34, gap = w * 0.6;
  body.push(B(w * 1.5, 1.2, w * 1.1, 0, 0.6, 0));                            // shared plinth
  body.push(B(tw, h - 1.2, w * 0.62, -gap / 2, 1.2 + (h - 1.2) / 2, 0));
  body.push(B(tw, h * 0.8 - 1.2, w * 0.62, gap / 2, 1.2 + (h * 0.8 - 1.2) / 2, 0));
  body.push(B(gap + tw, h * 0.07, w * 0.5, 0, h * 0.46, 0));
  body.push(B(gap + tw, h * 0.06, w * 0.45, 0, h * 0.72, 0));
  body.push(B(tw * 1.3, 0.7, w * 0.72, -gap / 2, h - 0.6, 0));
  body.push(B(tw * 1.25, 0.55, w * 0.68, gap / 2, h * 0.8 - 0.5, 0));
  body.push(CYL(0.07, 0.1, 3.0, -gap / 2, h + 0.9, 0, 6));
  body.push(CYL(0.05, 0.08, 1.8, gap / 2, h * 0.8 + 0.6, 0, 6));
  for (const y of [h * 0.28, h * 0.6]) dark.push(B(tw + 0.16, 0.14, w * 0.66, -gap / 2, y, 0));
  for (const y of [h * 0.35, h * 0.66]) dark.push(B(tw + 0.16, 0.14, w * 0.66, gap / 2, y, 0));
  return { body, dark };
}

function hbZiggurat(h, w) { // 4-tier setback + corner nubs + central spire + trim lips
  const body = [], dark = [];
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const ws = w * (1 - i * 0.21), hh = h * 0.19;
    body.push(B(ws, hh, ws, 0, y + hh / 2, 0));
    trimBand(dark, ws, ws, y + hh - 0.05, 0.16);
    y += hh;
  }
  const topW = w * (1 - 3 * 0.21);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    body.push(B(0.42, 1.1, 0.42, sx * topW * 0.42, y + 0.55, sz * topW * 0.42));
  }
  body.push(CYL(0.16, 0.34, h * 0.3, 0, y + h * 0.15, 0, 8));
  body.push(CONE(0.24, 1.4, 0, y + h * 0.3 + 0.6, 0, 8));
  return { body, dark };
}

function hbCylinderWing(h, w) { // round tower + side wing + collar rings + dome cap
  const body = [], dark = [];
  const r = w * 0.48;
  body.push(CYL(r * 1.25, r * 1.35, 1.4, 0, 0.7, 0, 14));                   // base drum
  body.push(CYL(r * 0.9, r * 1.1, h - 1.4, 0, 1.4 + (h - 1.4) / 2, 0, 14));
  body.push(B(w * 0.95, h * 0.55, w * 0.85, r + w * 0.45, 1.4 + h * 0.27, 0));
  body.push(B(w * 0.75, 1.0, w * 0.72, r + w * 0.45, 1.4 + h * 0.55 + 0.5, 0));
  body.push(CYL(r * 1.14, r * 1.14, 0.5, 0, h * 0.55, 0, 14));              // collar
  body.push(CYL(r * 1.06, r * 1.06, 0.4, 0, h * 0.78, 0, 14));
  const dome = new THREE.SphereGeometry(r * 0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  body.push(xform(dome, 0, h - 0.1, 0));
  body.push(CYL(0.05, 0.08, 2.6, 0, h + 1.2, 0, 6));
  dark.push(CYL(r * 1.02, r * 1.02, 0.18, 0, h * 0.33, 0, 14));
  dark.push(CYL(r * 1.02, r * 1.02, 0.18, 0, h * 0.66, 0, 14));
  return { body, dark };
}

function hbLSlab(h, w) { // L-plan slab + roof fins + base skirt + window bands
  const body = [], dark = [];
  body.push(B(w + 0.9, 1.0, 2.4, 0.4, 0.5, 0));
  body.push(B(w, h - 1, 1.7, 0, 1 + (h - 1) / 2, 0));
  body.push(B(2.8, h * 0.55 - 1, 1.7, w / 2 + 1.3, 1 + (h * 0.55 - 1) / 2, 0));
  for (let i = 0; i < 3; i++) {
    body.push(B(0.16, 1.6 - i * 0.35, 1.5, -w / 2 + 0.5 + i * 0.55, h + 0.7 - i * 0.17, 0));
  }
  body.push(CYL(0.06, 0.09, 2.6, w * 0.3, h + 1.2, 0, 6));
  for (const y of [h * 0.3, h * 0.55, h * 0.8]) dark.push(B(w + 0.16, 0.16, 1.85, 0, y, 0));
  return { body, dark };
}

function hbDomeHall(h, w) { // octagonal hall + hemispherical dome + spire ring + buttresses
  const body = [], dark = [];
  body.push(CYL(w * 0.72, w * 0.82, h * 0.42, 0, h * 0.21, 0, 8));
  for (let i = 0; i < 8; i++) {                                             // buttresses
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    body.push(B(0.34, h * 0.34, 0.34, Math.cos(a) * w * 0.78, h * 0.17, Math.sin(a) * w * 0.78, a));
  }
  const dome = new THREE.SphereGeometry(w * 0.68, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  body.push(xform(dome, 0, h * 0.42, 0));
  body.push(CYL(w * 0.2, w * 0.2, 0.5, 0, h * 0.42 + w * 0.68 + 0.2, 0, 10));
  body.push(CONE(0.2, 1.6, 0, h * 0.42 + w * 0.68 + 1.2, 0, 8));
  dark.push(CYL(w * 0.84, w * 0.84, 0.2, 0, h * 0.42, 0, 8));               // dome base ring
  return { body, dark };
}

function hbMastTower(h, w) { // slim shaft + antenna farm crown + cross arms
  const body = [], dark = [];
  body.push(B(w * 1.5, 1.2, w * 1.5, 0, 0.6, 0));
  body.push(B(w, h - 1.2, w * 0.85, 0, 1.2 + (h - 1.2) / 2, 0));
  body.push(B(w * 1.35, 0.8, w * 1.2, 0, h - 0.8, 0));                       // crown deck
  for (const [dx, dz, ah] of [[-0.4, 0.2, 3.2], [0.3, -0.3, 2.4], [0.15, 0.35, 1.7]]) {
    body.push(CYL(0.05, 0.08, ah, dx, h + ah / 2 - 0.6, dz, 6));
  }
  body.push(B(1.8, 0.1, 0.1, 0, h + 0.6, 0.2));                              // cross arm
  body.push(B(1.2, 0.09, 0.09, 0.1, h + 1.2, -0.2));
  for (const y of [h * 0.35, h * 0.62, h * 0.85]) trimBand(dark, w, w * 0.85, y);
  return { body, dark };
}

// ------------------------------------------------------- procedural skyline
function midArchetype(h, w, rand) {
  const kind = (rand() * 5) | 0;
  switch (kind) {
    case 0: return [B(w, h, w, 0, h / 2, 0), CONE(w * 0.7, h * 0.16, 0, h + h * 0.08, 0, 4, Math.PI / 4)];
    case 1: return [B(w, h * 0.55, w, 0, h * 0.275, 0), B(w * 0.7, h * 0.3, w * 0.7, 0, h * 0.7, 0), B(w * 0.45, h * 0.15, w * 0.45, 0, h * 0.925, 0)];
    case 2: return [CYL(w * 0.45, w * 0.55, h, 0, h / 2, 0, 10), CYL(w * 0.28, w * 0.45, h * 0.08, 0, h + h * 0.04, 0, 10)];
    case 3: return [B(w * 0.34, h, w * 0.6, -w * 0.26, h / 2, 0), B(w * 0.34, h * 0.8, w * 0.6, w * 0.26, h * 0.4, 0), B(w * 0.86, h * 0.08, w * 0.5, 0, h * 0.6, 0)];
    default: return [B(w * 0.32, h, w * 0.32, 0, h / 2, 0), B(w * 0.6, h * 0.06, w * 0.6, 0, h * 0.6, 0), CYL(0.05, 0.09, h * 0.3, 0, h + h * 0.15, 0, 6)];
  }
}

// ------------------------------------------------------- window registration
// pushes {x,y,z,ry} pane anchors for the M1 window-light layer
function facadeWindows(ctx, px, pz, ry, w, h, d, density, rand) {
  if (ctx.graybox) return;
  const y0 = ISLAND_POS.y + 0.9;
  const faces = [[0, d / 2 + 0.06, 0], [Math.PI / 2, w / 2 + 0.06, 0]]; // front + right
  for (const [rotY, off,] of faces) {
    const fw = rotY === 0 ? w : d;
    const cols = Math.max(2, Math.floor(fw / 0.85));
    const rows = Math.max(3, Math.floor(h / 1.05));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rand() > density) continue;
        const lx = -fw / 2 + ((c + 0.5) / cols) * fw;
        const ly = y0 + (r / rows) * h * 0.82 + rand() * 0.1;
        const lz = off;
        // rotate local offset by building ry + face rot
        const a = ry + rotY;
        const wx = px + lx * Math.cos(a) + lz * Math.sin(a);
        const wz = pz - lx * Math.sin(a) + lz * Math.cos(a);
        ctx.windows.push({ x: wx, y: ly, z: wz, ry: a });
      }
    }
  }
}

export function buildCity(ctx) {
  const { graybox } = ctx;
  const rand = mulberry32(1337);
  const group = new THREE.Group();

  const bodyMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0xaaa7ba, roughness: 0.82, metalness: 0.15 });
  const darkMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x3a3344, roughness: 0.85, metalness: 0.2 });

  // ---- hero buildings, hand placed ----
  const heroes = [
    { build: hbObelisk, h: 16, w: 3.4, pos: [2, -38], ry: 0.4 },
    { build: hbTwin, h: 14, w: 5.0, pos: [14, -38], ry: -0.3 },
    { build: hbZiggurat, h: 12, w: 4.8, pos: [5.5, -49.5], ry: 0.9 },
    { build: hbCylinderWing, h: 13, w: 3.2, pos: [13, -49], ry: 0.2 },
    { build: hbLSlab, h: 10, w: 4.2, pos: [0, -44], ry: -0.7 },
    { build: hbDomeHall, h: 8, w: 4.6, pos: [11, -34.5], ry: 0.5 },
    { build: hbMastTower, h: 11.5, w: 2.4, pos: [1.5, -47.5], ry: 1.1 },
  ];
  for (const { build, h, w, pos, ry } of heroes) {
    const { body, dark } = build(h, w);
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(pos[0], ISLAND_POS.y, pos[1]);
    const mesh = new THREE.Mesh(mergeGeometries(body.map(g => g.clone().applyMatrix4(m))), bodyMat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    if (dark.length) {
      const dm = new THREE.Mesh(mergeGeometries(dark.map(g => g.clone().applyMatrix4(m))), darkMat);
      group.add(dm);
    }
    facadeWindows(ctx, pos[0], pos[1], ry, w, h, w * 0.8, 0.6, rand);
  }

  // ---- mid/far ring of procedural buildings with a controlled skyline rhythm ----
  const buckets = [[], [], []];
  const COUNT = 16;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const r = 7.5 + (i % 3) * 2.6 + rand() * 2.2;
    const x = ISLAND_POS.x + Math.cos(angle) * r;
    const z = ISLAND_POS.z + Math.sin(angle) * r * 0.92;
    const h = THREE.MathUtils.clamp(5.5 + 3.4 * Math.sin(i * 1.93) + rand() * 2.5, 3.5, 11);
    const w = 1.5 + rand() * 1.2;
    const parts = midArchetype(h, w, rand);
    const bry = rand() * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationY(bry).setPosition(x, ISLAND_POS.y, z);
    for (const g of parts) {
      g.applyMatrix4(m);
      buckets[i % 3].push(g);
    }
    facadeWindows(ctx, x, z, bry, w, h, w, 0.32, rand);
  }
  const mats = graybox
    ? [ctx.gray, ctx.gray, ctx.gray]
    : [
        new THREE.MeshStandardMaterial({ color: 0x9a97ab, roughness: 0.85, metalness: 0.12 }),
        new THREE.MeshStandardMaterial({ color: 0x7d6d7d, roughness: 0.8, metalness: 0.15 }),
        new THREE.MeshStandardMaterial({ color: 0x8b90a8, roughness: 0.7, metalness: 0.28 }),
      ];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(mergeGeometries(buckets[i]), mats[i]);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
