import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STAR_POS, STAR_RADIUS } from './star.js';
import { mulberry32 } from './util.js';

// Broken orbital ring as a world structure: 4 misaligned segments with big gaps,
// larger station/node blocks spaced along each arc, a continuous emissive light
// rail that breaks at the gaps, and small debris drifting near the break points.
export function buildRing(ctx) {
  const { graybox } = ctx;
  const rand = mulberry32(42);
  const group = new THREE.Group();

  const R = STAR_RADIUS * 1.12;
  const tube = 2.6;
  const arcs = [0.62, 0.5, 0.85, 0.45];

  const bodyGeos = [];
  const railGeos = [];
  const debrisGeos = [];
  let cursor = 3.5;
  const gapMidAngles = [];
  for (let i = 0; i < arcs.length; i++) {
    const arc = arcs[i];
    // per-segment transform (kept so the light rail shares the same misalignment)
    const e = new THREE.Euler((rand() - 0.5) * 0.34, (rand() - 0.5) * 0.22, cursor, 'XYZ');
    const m = new THREE.Matrix4().makeRotationFromEuler(e);
    m.setPosition((rand() - 0.5) * 6.0, (rand() - 0.5) * 6.0, (rand() - 0.5) * 7.0);

    const g = new THREE.TorusGeometry(R, tube * (0.85 + rand() * 0.45), 8, 56, arc);
    g.applyMatrix4(m);
    bodyGeos.push(g);

    // emissive light rail riding the outer edge of the arc (breaks at the gaps)
    const rail = new THREE.TorusGeometry(R + tube * 0.85, 0.5, 6, 56, arc * 0.94);
    rail.applyMatrix4(m);
    railGeos.push(rail);

    // station nodes spaced along the arc
    const nodes = Math.max(2, Math.round(arc / 0.3));
    for (let n = 0; n < nodes; n++) {
      const a = (n + 0.5) / nodes * arc;
      const b = new THREE.BoxGeometry(3.2, 2.6, 2.6);
      const bm = new THREE.Matrix4().makeRotationZ(a);
      bm.setPosition(Math.cos(a) * R, Math.sin(a) * R, 0);
      b.applyMatrix4(bm);
      b.applyMatrix4(m);
      bodyGeos.push(b);
    }

    gapMidAngles.push({ matrix: m.clone(), endAngle: arc, gap: 0.55 + rand() * 0.55 });
    cursor += arc + gapMidAngles[gapMidAngles.length - 1].gap;
  }

  // debris chunks drifting near two of the break points
  for (const gi of [0, 2]) {
    const { matrix, endAngle } = gapMidAngles[gi];
    for (let d = 0; d < 3; d++) {
      const a = endAngle + 0.12 + d * 0.16 + rand() * 0.06;
      const s = 0.7 + rand() * 1.1;
      const g = new THREE.BoxGeometry(s, s * 0.7, s * 0.8);
      const dm = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      dm.setPosition(Math.cos(a) * (R + (rand() - 0.5) * 7), Math.sin(a) * (R + (rand() - 0.5) * 7), (rand() - 0.5) * 8);
      g.applyMatrix4(dm);
      debrisGeos.push(g);
    }
  }

  const body = new THREE.Mesh(
    mergeGeometries(bodyGeos),
    graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.42, metalness: 0.85 })
  );
  const rail = new THREE.Mesh(
    mergeGeometries(railGeos),
    graybox ? ctx.gray : new THREE.MeshStandardMaterial({
      color: 0x080604, emissive: 0xffd9a8, emissiveIntensity: 2.4, roughness: 0.6, metalness: 0, fog: false,
    })
  );
  const debris = new THREE.Mesh(mergeGeometries(debrisGeos), graybox ? ctx.gray : body.material);
  const roll = new THREE.Group();
  roll.add(body, rail, debris);
  roll.position.copy(STAR_POS);
  roll.rotation.z = THREE.MathUtils.degToRad(-34); // diagonal slash across the star face
  group.add(roll);
  return group;
}
