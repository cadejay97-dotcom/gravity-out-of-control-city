import * as THREE from 'three';
import { mulberry32 } from './util.js';

// City window lights: instanced emissive panes in two color families
// (warm yellow / cyan-blue). A subset flickers slowly. All animation is a
// deterministic function of scene time (typed arrays, zero allocation).
export function buildWindows(ctx) {
  const group = new THREE.Group();
  if (ctx.graybox) return group;

  const specs = ctx.windows || [];   // {x,y,z,ry}
  const rand = mulberry32(777);
  const warm = [], cool = [];
  for (const s of specs) (rand() < 0.62 ? warm : cool).push(s);

  const geo = new THREE.PlaneGeometry(0.3, 0.42);
  const groups = [
    { list: warm, rgb: [1.35, 1.02, 0.55] },
    { list: cool, rgb: [0.55, 1.0, 1.35] },
  ];

  const flickerSets = [];
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  for (const { list, rgb } of groups) {
    const n = list.length;
    if (!n) continue;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const base = new Float32Array(n * 3);
    const thr = new Float32Array(n); // flicker threshold: flickers when thr < ratio
    const phase = new Float32Array(n);
    const speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      e.set(0, s.ry, 0);
      q.setFromEuler(e);
      v.set(s.x, s.y, s.z);
      m4.compose(v, q, one);
      mesh.setMatrixAt(i, m4);
      const bright = 0.55 + rand() * 0.75;
      base[i * 3] = rgb[0] * bright;
      base[i * 3 + 1] = rgb[1] * bright;
      base[i * 3 + 2] = rgb[2] * bright;
      thr[i] = rand();
      phase[i] = rand() * Math.PI * 2;
      speed[i] = 0.3 + rand() * 0.9;
      mesh.setColorAt(i, new THREE.Color(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    flickerSets.push({ mesh, base, thr, phase, speed, n });
  }

  // agitation (0..1): more windows flicker (14% -> 44%) and they flicker faster.
  // blackout (0..1): windows die in swathes as the city falls (threshold order).
  group.userData.update = (t, agitation = 0, blackout = 0) => {
    const ratio = 0.14 + 0.30 * agitation;
    const rate = 1 + 1.5 * agitation;
    for (const f of flickerSets) {
      const arr = f.mesh.instanceColor.array;
      for (let i = 0; i < f.n; i++) {
        if (f.thr[i] < blackout) { // lights out
          arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = 0;
          continue;
        }
        if (f.thr[i] >= ratio) continue;
        // slow random-ish telegraph flicker, deterministic in t
        const s = Math.sin(t * f.speed[i] * 2.1 * rate + f.phase[i]) * Math.sin(t * 0.37 * rate + f.phase[i] * 1.7);
        const k = s > -0.2 ? 1 : 0.15;
        arr[i * 3] = f.base[i * 3] * k;
        arr[i * 3 + 1] = f.base[i * 3 + 1] * k;
        arr[i * 3 + 2] = f.base[i * 3 + 2] * k;
      }
      f.mesh.instanceColor.needsUpdate = true;
    }
  };

  // ---- navigation / aviation lights on the tower frame, rings, tip ----
  const navs = ctx.navs || []; // {x,y,z,red}
  if (navs.length) {
    const nGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const nMesh = new THREE.InstancedMesh(nGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), navs.length);
    const nBase = new Float32Array(navs.length * 3);
    const nPhase = new Float32Array(navs.length);
    const r2 = mulberry32(55);
    navs.forEach((s, i) => {
      m4.makeTranslation(s.x, s.y, s.z);
      nMesh.setMatrixAt(i, m4);
      const c = s.red ? [1.5, 0.22, 0.16] : [0.2, 1.3, 1.1];
      nBase[i * 3] = c[0]; nBase[i * 3 + 1] = c[1]; nBase[i * 3 + 2] = c[2];
      nPhase[i] = r2() * Math.PI * 2;
      nMesh.setColorAt(i, new THREE.Color(c[0], c[1], c[2]));
    });
    group.add(nMesh);
    const prev = group.userData.update;
    group.userData.update = (t, agitation = 0, blackout = 0) => {
      prev(t, agitation, blackout);
      const arr = nMesh.instanceColor.array;
      const dim = 1 - blackout; // aviation lights fade with the city
      for (let i = 0; i < navs.length; i++) {
        const k = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.0 + nPhase[i]))) * dim;
        arr[i * 3] = nBase[i * 3] * k;
        arr[i * 3 + 1] = nBase[i * 3 + 1] * k;
        arr[i * 3 + 2] = nBase[i * 3 + 2] * k;
      }
      nMesh.instanceColor.needsUpdate = true;
    };
  }

  return group;
}
