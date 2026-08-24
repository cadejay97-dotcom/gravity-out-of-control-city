import * as THREE from 'three';
import { jitterGeometry, mulberry32 } from './util.js';
import { ISLAND_POS } from './island.js';

// 20-30 small floating debris chunks around the island/city (plus a few near
// the frame wreckage). One InstancedMesh; sinusoidal drift + slow self-rotation,
// all deterministic functions of scene time.
export function buildDebris(ctx) {
  const { graybox } = ctx;
  const group = new THREE.Group();
  const rand = mulberry32(314);

  const N = 26;
  const geo = jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.28, 61);
  const mat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({
    color: 0x3d3648, roughness: 0.9, metalness: 0.2, flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;

  const base = new Float32Array(N * 3);
  const amp = new Float32Array(N * 3);
  const spd = new Float32Array(N);
  const pha = new Float32Array(N);
  const rot = new Float32Array(N * 3);
  const scl = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    if (i < 22) { // around the island / city
      const a = rand() * Math.PI * 2;
      const r = 21 + rand() * 22;
      base[i * 3] = ISLAND_POS.x + Math.cos(a) * r;
      base[i * 3 + 1] = 2 + rand() * 22;
      base[i * 3 + 2] = ISLAND_POS.z + Math.sin(a) * r;
    } else { // a few near the frame wreckage
      const side = i % 2 ? 1 : -1;
      base[i * 3] = side * (20 + rand() * 8);
      base[i * 3 + 1] = 10 + rand() * 24;
      base[i * 3 + 2] = 2 + rand() * 10;
    }
    amp[i * 3] = 0.4 + rand() * 0.9;
    amp[i * 3 + 1] = 0.3 + rand() * 0.8;
    amp[i * 3 + 2] = 0.4 + rand() * 0.9;
    spd[i] = 0.15 + rand() * 0.3;
    pha[i] = rand() * Math.PI * 2;
    rot[i * 3] = (rand() - 0.5) * 0.5;
    rot[i * 3 + 1] = (rand() - 0.5) * 0.5;
    rot[i * 3 + 2] = (rand() - 0.5) * 0.5;
    scl[i] = 0.35 + rand() * 1.1;
  }
  group.add(mesh);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  // scatter (0..~1.5): chunks fly apart upward — the debris rain of the fall
  group.userData.update = (t, bx = 0, by = 0, scatter = 0) => {
    for (let i = 0; i < N; i++) {
      v.set(
        base[i * 3] + bx + Math.sin(t * spd[i] + pha[i]) * amp[i * 3] + scatter * Math.sin(pha[i] * 2.3) * 5,
        base[i * 3 + 1] + by + Math.sin(t * spd[i] * 0.83 + pha[i] * 1.3) * amp[i * 3 + 1] + scatter * (3 + spd[i] * 14),
        base[i * 3 + 2] + Math.cos(t * spd[i] * 0.71 + pha[i]) * amp[i * 3 + 2] + scatter * Math.cos(pha[i] * 1.7) * 5
      );
      e.set(rot[i * 3] * t + pha[i], rot[i * 3 + 1] * t, rot[i * 3 + 2] * t + pha[i] * 0.5);
      q.setFromEuler(e);
      s.setScalar(scl[i]);
      m4.compose(v, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return group;
}
