import * as THREE from 'three';
import { mulberry32, makeRadialGlowTexture } from './util.js';
import { ISLAND_POS } from './island.js';

// Water streak texture (procedural, vertically tiling)
function makeWaterTexture(seed) {
  const W = 128, H = 512;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x = rand() * W;
    const w = 1 + rand() * 3.5;
    const a = 0.12 + rand() * 0.4;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(235,250,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w, 0, w * 3, H);
  }
  for (let i = 0; i < 60; i++) { // foam dashes
    ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.3})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 3 + rand() * 12);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Ribbon fall: curved drape mesh with scrolling UVs + mist particles at the base.
class Fall {
  constructor(ctx, origin, opts) {
    const { graybox } = ctx;
    const rand = mulberry32(opts.seed);
    const LEN = opts.len || 26;
    const W = opts.width || 2.4;

    // drape: plane bent along a curve, drifting outward as it drops
    const geo = new THREE.PlaneGeometry(W, LEN, 4, 30);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const v = 0.5 - y / LEN;                 // 0 top -> 1 bottom
      pos.setX(i, x + Math.sin(v * 2.6 + opts.seed) * 0.7 * v);
      pos.setZ(i, v * v * 3.2 + Math.sin(v * 5 + opts.seed) * 0.3 * v);
    }
    geo.computeVertexNormals();

    this.tex = makeWaterTexture(opts.seed);
    this.mat = graybox
      ? ctx.gray
      : new THREE.MeshBasicMaterial({
          map: this.tex, color: 0x8fd8f0, transparent: true, opacity: 0.6,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
        });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(0, -LEN / 2, 0); // relative to the top pivot
    this.rotY = opts.rotY || 0;
    this.base = new THREE.Vector3(0, -LEN, 0); // mist base, relative to pivot
    this.pivot = new THREE.Group();
    this.pivot.position.copy(origin); // top anchor (world coords inside the falls group)
    this.pivot.add(this.mesh);
    this.group = new THREE.Group();
    this.group.add(this.pivot);

    if (!graybox) this.buildMist(rand, opts.count || 240);
  }

  buildMist(rand, count) {
    const n = count;
    this.n = n;
    this.pPos = new Float32Array(n * 3);
    this.pAlpha = new Float32Array(n);
    this.pScale = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.rate = new Float32Array(n);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.5 + rand() * 1.8;
      this.vel[i * 3] = Math.cos(a) * r * 2.2;
      this.vel[i * 3 + 1] = -(1.5 + rand() * 3.5);
      this.vel[i * 3 + 2] = Math.sin(a) * r * 2.2 + 1.2;
      this.rate[i] = 0.24 + rand() * 0.22;
      this.phase[i] = rand();
      this.pScale[i] = 9 + rand() * 17;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(this.pScale, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeRadialGlowTexture([[0, 'rgba(230,248,255,0.9)'], [0.5, 'rgba(180,230,250,0.35)'], [1, 'rgba(160,220,250,0)']], 64) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aAlpha; attribute float aScale; varying float vA;
        void main(){
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aScale * (120.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vA;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(t.rgb, t.a * vA);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.pivot.add(this.points);
  }

  // bendZ/bendX: extra lean from the shifted gravity field; mistBX biases the
  // mist particles' initial velocity toward the sun.
  update(t, bendZ = 0, bendX = 0, mistBX = 0) {
    this.pivot.rotation.set(bendX, this.rotY, bendZ);
    if (this.mat.map) this.mat.map.offset.y = -t * 0.9;
    if (!this.points) return;
    for (let i = 0; i < this.n; i++) {
      const life = (t * this.rate[i] + this.phase[i]) % 1;
      const k = life * 3.2; // seconds-equivalent drift
      this.pPos[i * 3] = this.base.x + (this.vel[i * 3] + mistBX) * k;
      this.pPos[i * 3 + 1] = this.base.y + this.vel[i * 3 + 1] * k - 1.5 * k * k * 0.12;
      this.pPos[i * 3 + 2] = this.base.z + this.vel[i * 3 + 2] * k;
      const fadeIn = Math.min(life * 5, 1);
      this.pAlpha[i] = fadeIn * (1 - life) * 0.75;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

// Three falls from the island rim: two on the front edge, one on the side,
// placed to avoid the hero tower and the ring sightline.
export function buildWaterfalls(ctx) {
  const group = new THREE.Group();
  const falls = [
    new Fall(ctx, new THREE.Vector3(ISLAND_POS.x - 9, ISLAND_POS.y, ISLAND_POS.z + 16.5), { seed: 7, len: 26, width: 2.6, rotY: 0.15, count: 240 }),
    new Fall(ctx, new THREE.Vector3(ISLAND_POS.x + 5.5, ISLAND_POS.y, ISLAND_POS.z + 17), { seed: 21, len: 24, width: 2.0, rotY: -0.1, count: 240 }),
    new Fall(ctx, new THREE.Vector3(ISLAND_POS.x + 16, ISLAND_POS.y, ISLAND_POS.z + 4), { seed: 40, len: 27, width: 2.2, rotY: 1.35, count: 240 }),
  ];
  for (const f of falls) group.add(f.group);
  group.userData.update = (t, bendZ = 0, bendX = 0, mistBX = 0) => {
    for (const f of falls) f.update(t, bendZ, bendX, mistBX);
  };
  return group;
}
