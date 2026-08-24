import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

// Close-to-camera framing: wreckage of a man-made megastructure, not rock.
// Left: snapped truss wall + a broken ring-structure arc with hull panels.
// Right: ruined floor-stack (exposed storey slices with window openings) + truss mast.
// Warm rim from the star side + cool fill from the opposite side make the
// artificial structure readable.
export function buildFrames(ctx) {
  const { graybox } = ctx;
  const rand = mulberry32(31);
  const group = new THREE.Group();

  const structMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x322c40, roughness: 0.6, metalness: 0.7 });
  const panelMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x241f31, roughness: 0.8, metalness: 0.45 });
  const holeMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x0d0b14, roughness: 1, metalness: 0 });

  const structGeos = [];
  const panelGeos = [];
  const holeGeos = [];
  const place = (geo, arr, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    m.setPosition(x, y, z);
    geo.applyMatrix4(m);
    arr.push(geo);
  };

  // ---------------- left: broken truss wall ----------------
  // a ladder-like wall of repeated beam cells, with some beams torn out
  const trussOrigin = new THREE.Vector3(-24, 4, 10);
  const trussRotY = 0.35;
  const cellW = 4.2, cellH = 4.6, cols = 3, rows = 7;
  const beam = (w, h, d, lx, ly, lz, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().makeRotationZ(rz);
    m.setPosition(lx, ly, lz);
    g.applyMatrix4(m);
    const m2 = new THREE.Matrix4().makeRotationY(trussRotY);
    m2.setPosition(trussOrigin.x, trussOrigin.y, trussOrigin.z);
    g.applyMatrix4(m2);
    structGeos.push(g);
  };
  for (let r = 0; r <= rows; r++) {
    const broken = (r === 2 || r === 5) && rand() < 0.9;
    if (!broken) beam(cols * cellW, 0.32, 0.32, (cols * cellW) / 2, r * cellH, 0); // horizontal
    else beam(cols * cellW * 0.45, 0.32, 0.32, cols * cellW * 0.22, r * cellH + 0.3, 0, 0.15);
  }
  for (let c = 0; c <= cols; c++) {
    const torn = c === 2;
    beam(0.32, rows * cellH * (torn ? 0.55 : 1), 0.32, c * cellW, (rows * cellH * (torn ? 0.55 : 1)) / 2, 0, torn ? 0.1 : 0);
  }
  for (let r = 0; r < rows; r++) { // diagonal braces, some missing
    for (let c = 0; c < cols; c++) {
      if (rand() < 0.35) continue;
      const len = Math.hypot(cellW, cellH);
      beam(0.16, len, 0.16, c * cellW + cellW / 2, r * cellH + cellH / 2, 0.05, (r + c) % 2 ? 0.74 : -0.74);
    }
  }

  // ---------------- left-top: broken ring-structure arc with hull panels ----------------
  const arcC = new THREE.Vector3(-26, 46, 14);
  const arcRot = new THREE.Euler(1.15, 0.35, 2.35, 'XYZ');
  const arcG = new THREE.TorusGeometry(14, 0.9, 8, 48, Math.PI * 0.7);
  place(arcG, structGeos, arcC.x, arcC.y, arcC.z, arcRot.x, arcRot.y, arcRot.z);
  // hull plates bolted along the arc, with gaps
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 7) continue; // missing plates
    const t = (i / 9) * Math.PI * 0.7 + 0.06;
    const g = new THREE.BoxGeometry(3.6, 2.0, 0.18);
    const m = new THREE.Matrix4().makeRotationZ(t);
    m.setPosition(Math.cos(t) * 15.2, Math.sin(t) * 15.2, 0);
    g.applyMatrix4(m);
    const m2 = new THREE.Matrix4().makeRotationFromEuler(arcRot);
    m2.setPosition(arcC.x, arcC.y, arcC.z);
    g.applyMatrix4(m2);
    panelGeos.push(g);
  }

  // ---------------- right: ruined floor-stack (exposed storeys + window holes) ----------------
  const ruinOrigin = new THREE.Vector3(15.7, 2, 6);
  const ruinRotY = -0.5;
  const floors = 10, fw = 13, fd = 8;
  for (let f = 0; f < floors; f++) {
    const y = f * 3.4;
    const shrink = 1 - f * 0.07;
    // floor slab (torn corner on some)
    const g = new THREE.BoxGeometry(fw * shrink, 0.5, fd * shrink);
    place(g, panelGeos, ruinOrigin.x, ruinOrigin.y + y, ruinOrigin.z, 0, ruinRotY, (rand() - 0.5) * 0.05);
    // columns at corners
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (f > 3 && sx === -1 && sz === 1) continue; // collapsed corner
      const c = new THREE.BoxGeometry(0.4, 3.0, 0.4);
      place(c, structGeos,
        ruinOrigin.x + sx * fw * shrink * 0.46 * Math.cos(ruinRotY) - sz * fd * shrink * 0.46 * Math.sin(ruinRotY),
        ruinOrigin.y + y + 1.7,
        ruinOrigin.z - sx * fw * shrink * 0.46 * Math.sin(ruinRotY) + sz * fd * shrink * 0.46 * Math.cos(ruinRotY),
        0, ruinRotY, (rand() - 0.5) * 0.06);
    }
    // window openings: dark inset slots on the star-facing side
    const slots = 5 - (f > 4 ? 1 : 0);
    for (let s = 0; s < slots; s++) {
      const wx = -fw * shrink * 0.36 + s * (fw * shrink * 0.24);
      const g = new THREE.BoxGeometry(fw * shrink * 0.14, 1.6, 0.22);
      const wxr = wx * Math.cos(ruinRotY) - (fd * shrink * 0.5) * Math.sin(ruinRotY);
      const wzr = -wx * Math.sin(ruinRotY) + (fd * shrink * 0.5) * Math.cos(ruinRotY);
      place(g, holeGeos, ruinOrigin.x + wxr, ruinOrigin.y + y + 1.6, ruinOrigin.z + wzr, 0, ruinRotY);
    }
  }
  // snapped truss mast on top of the ruin
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const g = new THREE.BoxGeometry(0.22, 9 - i * 1.2, 0.22);
    place(g, structGeos, ruinOrigin.x + Math.cos(a) * 1.4, ruinOrigin.y + floors * 3.4 + (9 - i * 1.2) / 2, ruinOrigin.z + Math.sin(a) * 1.4, 0.06 * (i - 1.5), 0, 0.05 * (i - 1.5));
  }

  const sMesh = new THREE.Mesh(mergeGeometries(structGeos), structMat);
  const pMesh = new THREE.Mesh(mergeGeometries(panelGeos), panelMat);
  const hMesh = new THREE.Mesh(mergeGeometries(holeGeos), holeMat);
  sMesh.castShadow = pMesh.castShadow = true;
  group.add(sMesh, pMesh, hMesh);
  return group;
}
