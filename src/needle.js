import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLAND_POS } from './island.js';
import { mulberry32 } from './util.js';

// Hero anti-gravity tower, built for close-up scrutiny:
// layered shells (inner core + armor panels with gaps), exposed frame
// (columns / ring ribs / braces), dark panel seams, spiral pipe runs,
// levitating rings + floating armor shards, teal core glowing through the gaps.
export const NEEDLE_BASE = new THREE.Vector3(ISLAND_POS.x + 1.6, ISLAND_POS.y, ISLAND_POS.z - 1.5);
export const NEEDLE_CORE_POS = new THREE.Vector3(ISLAND_POS.x + 0.6, ISLAND_POS.y + 16, ISLAND_POS.z - 1.0);

export function buildNeedle(ctx) {
  const { graybox } = ctx;
  const rand = mulberry32(99);
  const group = new THREE.Group();

  const bodyGeos = [];  // main structure + armor
  const darkGeos = [];  // seams, braces, pipes, inner core
  const glowGeos = [];  // teal emissive chunks

  const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    m.setPosition(x, y, z);
    g.applyMatrix4(m);
    return g;
  };

  // ---- tiered stack: [yBase, height, width, xOffset, leanZ] ----
  const tiers = [
    [0.0, 9.0, 4.4, 0.0, 0.02],
    [8.2, 8.4, 3.5, 0.7, 0.05],
    [15.9, 7.6, 2.7, 1.6, 0.085],
    [22.8, 6.8, 2.0, 2.6, 0.12],
  ];
  const TOTAL_H = 30;

  for (let ti = 0; ti < tiers.length; ti++) {
    const [y0, h, w, xo, lean] = tiers[ti];
    const cy = y0 + h / 2;

    // inner core cylinder (dark, glimpsed through armor gaps)
    const core = new THREE.CylinderGeometry(w * 0.3, w * 0.34, h + 0.4, 10);
    const cm = new THREE.Matrix4().makeRotationZ(lean);
    cm.setPosition(xo, cy, 0);
    core.applyMatrix4(cm);
    darkGeos.push(core);

    // outer armor: 6 curved-ish plates per tier with visible gaps
    const panels = 6;
    for (let p = 0; p < panels; p++) {
      const ang = (p / panels) * Math.PI * 2 + ti * 0.35;
      const pr = w * 0.52;
      const pw = w * 0.52, ph = h * (0.68 + rand() * 0.14);
      const g = new THREE.BoxGeometry(pw, ph, 0.16);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, ang, lean, 'XYZ'));
      m.setPosition(xo + Math.cos(ang) * pr, cy + (rand() - 0.5) * 0.5, Math.sin(ang) * pr);
      g.applyMatrix4(m);
      bodyGeos.push(g);
      // panel trim: thin proud rib on each plate
      const rib = new THREE.BoxGeometry(pw * 0.9, 0.12, 0.2);
      const rm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, ang, lean, 'XYZ'));
      rm.setPosition(xo + Math.cos(ang) * (pr + 0.02), cy + ph * 0.3, Math.sin(ang) * (pr + 0.02));
      rib.applyMatrix4(rm);
      darkGeos.push(rib);
    }

    // exposed frame: 4 corner columns, taller than the tier shell
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      bodyGeos.push(box(0.3, h + 1.1, 0.3, xo + sx * w * 0.58, cy, sz * w * 0.52, 0, 0, lean));
    }
    // ring rib (octagonal) at tier top
    const rib = new THREE.TorusGeometry(w * 0.62, 0.14, 6, 8);
    const rm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2, 0, lean + 0.4, 'XYZ'));
    rm.setPosition(xo, y0 + h * 0.86, 0);
    rib.applyMatrix4(rm);
    darkGeos.push(rib);
    // diagonal braces on two faces
    for (const sgn of [1, -1]) {
      darkGeos.push(box(0.15, Math.min(h * 0.8, w * 1.1), 0.15, xo + sgn * w * 0.2, cy, w * 0.5, 0, 0, lean + sgn * 0.6));
    }
    // horizontal seam bands
    darkGeos.push(box(w * 1.24, 0.3, w * 1.14, xo, y0 + 0.15, 0, 0, 0, lean));
  }

  // ---- jagged tip cluster ----
  const tip = new THREE.ConeGeometry(0.85, 5.4, 5);
  const tm = new THREE.Matrix4().makeRotationZ(0.42);
  tm.setPosition(3.6, 31.6, 0);
  tip.applyMatrix4(tm);
  bodyGeos.push(tip);
  darkGeos.push(box(0.12, 4.4, 0.12, 4.6, 30.4, 0.8, 0, 0, 0.3)); // antenna
  darkGeos.push(box(0.1, 3.0, 0.1, 2.9, 30.8, -0.7, 0, 0, 0.5));

  // ---- spiral pipes (4 runs along the tower) ----
  for (let k = 0; k < 4; k++) {
    const phase = k * (Math.PI / 2) + 0.5;
    const pts = [];
    const turns = 2.2 + k * 0.35;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const y = t * (TOTAL_H - 2) + 1;
      // follow the lean offset roughly
      const xo = Math.min(t * 3.2, 2.6);
      const rr = 2.6 - t * 1.3;
      const a = phase + t * turns * Math.PI;
      pts.push(new THREE.Vector3(xo + Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.13, 6, false);
    darkGeos.push(tube);
  }

  // ---- teal core: bright chunks exposed between armor gaps ----
  for (const [cy, ch, ox] of [[5.0, 3.4, -0.4], [12.2, 3.2, -0.2], [19.4, 3.0, 0.6], [26.2, 3.2, 1.2]]) {
    const g = new THREE.CylinderGeometry(0.32, 0.38, ch, 8);
    const m = new THREE.Matrix4().makeRotationZ(0.06);
    m.setPosition(ox, cy, 0.9);
    g.applyMatrix4(m);
    glowGeos.push(g);
  }

  // ---- merged meshes ----
  const bodyMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x565064, roughness: 0.48, metalness: 0.62 });
  const darkMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x1b1826, roughness: 0.75, metalness: 0.4 });
  const glowMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({
    color: 0x061a16, emissive: 0x2fe8c8, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0, fog: false,
  });
  const body = new THREE.Mesh(mergeGeometries(bodyGeos), bodyMat);
  const dark = new THREE.Mesh(mergeGeometries(darkGeos), darkMat);
  const glow = new THREE.Mesh(mergeGeometries(glowGeos), glowMat);
  body.castShadow = body.receiveShadow = true;
  dark.castShadow = true;
  group.add(body, dark, glow);
  group.userData.core = glow;

  // ---- levitating rings (detached) ----
  const ringMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({
    color: 0x453f55, roughness: 0.42, metalness: 0.8, emissive: 0x0c2f28, emissiveIntensity: 0.5,
  });
  const ringGeos = [];
  for (const [ry, rr, tilt, spin] of [[10.6, 3.4, 0.16, 0.4], [19.6, 2.7, -0.22, 1.5], [27.6, 2.05, 0.3, 2.6]]) {
    const g = new THREE.TorusGeometry(rr, 0.28, 8, 44);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2 + tilt, 0.2, spin, 'XYZ'));
    m.setPosition(0.9 + ry * 0.075, ry, 0);
    g.applyMatrix4(m);
    ringGeos.push(g);
    // small node blocks on each ring
    for (let nb = 0; nb < 4; nb++) {
      const a = (nb / 4) * Math.PI * 2;
      const b = new THREE.BoxGeometry(0.5, 0.42, 0.42);
      const bm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, a, 0));
      bm.setPosition(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      b.applyMatrix4(bm);
      b.applyMatrix4(m);
      ringGeos.push(b);
    }
  }
  const rings = new THREE.Mesh(mergeGeometries(ringGeos), ringMat);
  rings.castShadow = true;
  group.add(rings);

  // ---- floating armor shards (detached, slightly askew) ----
  const shardGeos = [];
  for (const [sy, sa, sr, ss] of [[7.5, 1.2, 3.6, 1.0], [16.8, 2.8, 3.1, 0.8], [23.8, 5.2, 2.6, 0.7], [29.5, 3.8, 2.3, 0.55]]) {
    const g = new THREE.BoxGeometry(ss * 2.2, ss * 0.9, 0.14);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand() * 0.6 - 0.3, sa, rand() * 0.6 - 0.3, 'XYZ'));
    m.setPosition(Math.cos(sa) * sr + sy * 0.07, sy, Math.sin(sa) * sr);
    g.applyMatrix4(m);
    shardGeos.push(g);
  }
  const shards = new THREE.Mesh(mergeGeometries(shardGeos), bodyMat);
  shards.castShadow = true;
  group.add(shards);

  group.position.copy(NEEDLE_BASE);

  // ---- M1: tower windows on the two lowest tier shells + nav light anchors ----
  if (!ctx.graybox) {
    const wrand = mulberry32(4242);
    for (const [y0, h, w, xo] of [[0.0, 9.0, 4.4, 0.0], [8.2, 8.4, 3.5, 0.7]]) {
      for (let i = 0; i < 16; i++) {
        if (wrand() > 0.6) continue;
        const a = wrand() * Math.PI * 2;
        const r = w * 0.56;
        ctx.windows.push({
          x: NEEDLE_BASE.x + xo + Math.cos(a) * r,
          y: NEEDLE_BASE.y + y0 + 1 + wrand() * (h - 2),
          z: NEEDLE_BASE.z + Math.sin(a) * r,
          ry: -a + Math.PI / 2,
        });
      }
    }
    // nav lights: ring nodes, frame column tips, antenna tip
    for (const [ry2, rr] of [[10.6, 3.4], [19.6, 2.7], [27.6, 2.05]]) {
      for (let nb = 0; nb < 4; nb++) {
        const a = (nb / 4) * Math.PI * 2;
        ctx.navs.push({
          x: NEEDLE_BASE.x + 0.9 + ry2 * 0.075 + Math.cos(a) * rr,
          y: NEEDLE_BASE.y + ry2,
          z: NEEDLE_BASE.z + Math.sin(a) * rr,
          red: nb % 2 === 0,
        });
      }
    }
    ctx.navs.push({ x: NEEDLE_BASE.x + 4.6, y: NEEDLE_BASE.y + 32.4, z: NEEDLE_BASE.z + 0.8, red: true });
  }
  return group;
}
