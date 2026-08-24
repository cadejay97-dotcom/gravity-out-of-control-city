import * as THREE from 'three';

// ---------- deterministic PRNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- crack textures (star surface) ----------
// emissive: bright orange-white cracks on black (for emissiveMap / bloom)
// albedo:   dark grooves on white (multiplied onto the gray material in graybox mode)
export function makeCrackTextures(seed = 7) {
  const W = 1024, H = 512;
  const rand = mulberry32(seed);

  function drawCracks(ctx, coreStyle, haloStyle, glow) {
    const strokes = 16;
    for (let s = 0; s < strokes; s++) {
      let x = rand() * W, y = H * (0.12 + rand() * 0.76);
      let ang = rand() * Math.PI * 2;
      const steps = 26 + (rand() * 30 | 0);
      let width = 3.2 + rand() * 2.4;
      const pts = [[x, y]];
      for (let i = 0; i < steps; i++) {
        ang += (rand() - 0.5) * 1.15;
        const len = 9 + rand() * 17;
        x += Math.cos(ang) * len;
        y += Math.sin(ang) * len * 0.62;
        y = Math.max(8, Math.min(H - 8, y));
        pts.push([x, y]);
        width *= 0.975;
        // occasional branch
        if (rand() < 0.16) {
          let bx = x, by = y, ba = ang + (rand() < 0.5 ? 1 : -1) * (0.7 + rand() * 0.9);
          const bPts = [[bx, by]];
          const bSteps = 6 + (rand() * 12 | 0);
          for (let j = 0; j < bSteps; j++) {
            ba += (rand() - 0.5) * 0.9;
            bx += Math.cos(ba) * (7 + rand() * 10);
            by += Math.sin(ba) * (7 + rand() * 10) * 0.6;
            bPts.push([bx, by]);
          }
          strokePath(ctx, bPts, Math.max(1, width * 0.55), coreStyle, haloStyle, glow);
        }
      }
      strokePath(ctx, pts, width, coreStyle, haloStyle, glow);
      // bright node at some crack joints
      if (rand() < 0.7) {
        const p = pts[(rand() * pts.length) | 0];
        ctx.fillStyle = coreStyle;
        ctx.beginPath();
        ctx.arc(p[0], p[1], width * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function strokePath(ctx, pts, width, coreStyle, haloStyle, glow) {
    for (const ox of [-W, 0, W]) { // horizontal wrap for sphere UV seam
      // halo pass
      ctx.strokeStyle = haloStyle;
      ctx.lineWidth = width * 2.6;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (glow) { ctx.shadowColor = haloStyle; ctx.shadowBlur = width * 3; } else { ctx.shadowBlur = 0; }
      ctx.beginPath();
      pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px + ox, py) : ctx.lineTo(px + ox, py));
      ctx.stroke();
      // core pass
      ctx.shadowBlur = 0;
      ctx.strokeStyle = coreStyle;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px + ox, py) : ctx.lineTo(px + ox, py));
      ctx.stroke();
    }
  }

  const emCanvas = document.createElement('canvas');
  emCanvas.width = W; emCanvas.height = H;
  const emCtx = emCanvas.getContext('2d');
  emCtx.fillStyle = '#000'; emCtx.fillRect(0, 0, W, H);
  drawCracks(emCtx, '#fff1d6', 'rgba(255,120,30,0.55)', true);
  const emissive = new THREE.CanvasTexture(emCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = THREE.RepeatWrapping;

  const alCanvas = document.createElement('canvas');
  alCanvas.width = W; alCanvas.height = H;
  const alCtx = alCanvas.getContext('2d');
  alCtx.fillStyle = '#ffffff'; alCtx.fillRect(0, 0, W, H);
  drawCracks(alCtx, '#1c1c1c', 'rgba(90,90,90,0.6)', false);
  const albedo = new THREE.CanvasTexture(alCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;

  return { emissive, albedo };
}

// ---------- bright star-surface texture v2 ----------
// three brightness zones (dark sunspots / hot orange / bright yellow-white)
// + three crack tiers (thick main veins / medium branches / fine network), lots of blank ground
export function makeStarSurfaceTexture(seed = 11) {
  const W = 1024, H = 512;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const blob = (x, y, r, col) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  // mid hot-orange ground
  ctx.fillStyle = '#f98a2e';
  ctx.fillRect(0, 0, W, H);
  // dark sunspot regions (layered: wide halo + darker core)
  for (let i = 0; i < 8; i++) {
    const x = rand() * W, y = H * (0.15 + rand() * 0.7), r = 60 + rand() * 110;
    blob(x, y, r, 'rgba(178,72,18,0.4)');
    blob(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 20, r * 0.45, 'rgba(128,46,10,0.5)');
  }
  // bright yellow-white zones
  for (let i = 0; i < 5; i++) {
    blob(rand() * W, H * (0.1 + rand() * 0.8), 50 + rand() * 90, 'rgba(255,226,150,0.34)');
  }
  // fine granulation mottling
  for (let i = 0; i < 200; i++) {
    const light = rand() < 0.5;
    blob(rand() * W, rand() * H, 8 + rand() * 30, light ? 'rgba(255,190,90,0.10)' : 'rgba(220,100,30,0.10)');
  }

  // crack drawing helper
  const stroke = (pts, width, core, halo, glow) => {
    for (const ox of [-W, 0, W]) {
      ctx.strokeStyle = halo;
      ctx.lineWidth = width * 2.2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (glow) { ctx.shadowColor = halo; ctx.shadowBlur = width * 3; } else ctx.shadowBlur = 0;
      ctx.beginPath();
      pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px + ox, py) : ctx.lineTo(px + ox, py));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = core;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px + ox, py) : ctx.lineTo(px + ox, py));
      ctx.stroke();
    }
  };
  const walk = (x, y, steps, lenScale, wobble) => {
    let ang = rand() * Math.PI * 2;
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      ang += (rand() - 0.5) * wobble;
      const len = (7 + rand() * 12) * lenScale;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len * 0.62;
      y = Math.max(6, Math.min(H - 6, y));
      pts.push([x, y]);
    }
    return pts;
  };
  // tier 1: 4 thick main veins
  for (let s = 0; s < 4; s++) {
    const pts = walk(rand() * W, H * (0.2 + rand() * 0.6), 34 + (rand() * 22 | 0), 1.6, 0.9);
    stroke(pts, 4.2 + rand() * 1.8, '#fff6d8', 'rgba(255,214,120,0.6)', true);
    // a couple of branches off the main vein
    for (let b = 0; b < 2; b++) {
      const p = pts[(rand() * pts.length) | 0];
      stroke(walk(p[0], p[1], 10 + (rand() * 10 | 0), 1.0, 1.2), 2.2, '#ffeeb0', 'rgba(255,200,110,0.5)', true);
    }
  }
  // tier 2: 8 medium cracks
  for (let s = 0; s < 8; s++) {
    stroke(walk(rand() * W, H * rand(), 16 + (rand() * 14 | 0), 1.0, 1.15), 1.8 + rand() * 1.0, '#ffe9a8', 'rgba(255,205,115,0.45)', true);
  }
  // tier 3: fine network
  for (let s = 0; s < 16; s++) {
    stroke(walk(rand() * W, H * rand(), 7 + (rand() * 8 | 0), 0.7, 1.3), 0.8 + rand() * 0.5, 'rgba(255,240,200,0.85)', 'rgba(255,220,150,0.3)', false);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ---------- structured corona: radial streaks / feathers ----------
export function makeCoronaTexture(seed = 5, innerCol = '255,236,190', outerCol = '255,150,60') {
  const S = 512, R = S / 2;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  // soft base glow
  const base = ctx.createRadialGradient(R, R, 0, R, R, R);
  base.addColorStop(0, `rgba(${innerCol},0.55)`);
  base.addColorStop(0.45, `rgba(${outerCol},0.18)`);
  base.addColorStop(1, `rgba(${outerCol},0)`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  // radial feathers
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2;
    const r0 = R * (0.16 + rand() * 0.14);
    const r1 = R * (0.45 + rand() * 0.55);
    const w = 1 + rand() * 3;
    const alpha = 0.05 + rand() * 0.22;
    const g = ctx.createLinearGradient(R + Math.cos(a) * r0, R + Math.sin(a) * r0, R + Math.cos(a) * r1, R + Math.sin(a) * r1);
    g.addColorStop(0, `rgba(${innerCol},${alpha})`);
    g.addColorStop(1, `rgba(${outerCol},0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0);
    ctx.lineTo(R + Math.cos(a + (rand() - 0.5) * 0.08) * r1, R + Math.sin(a + (rand() - 0.5) * 0.08) * r1);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- fluffy cloud sprite texture (multi-octave value noise, soft alpha) ----------
export function makeCloudTexture(seed = 3, size = 256) {
  const rand = mulberry32(seed);
  // value-noise grids at several octaves
  const octaves = [4, 8, 16, 32].map(n => {
    const g = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < g.length; i++) g[i] = rand();
    return { n, g };
  });
  const sample = (o, x, y) => {
    const fx = x * o.n, fy = y * o.n;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const s = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));
    const i00 = o.g[iy * (o.n + 1) + ix], i10 = o.g[iy * (o.n + 1) + ix + 1];
    const i01 = o.g[(iy + 1) * (o.n + 1) + ix], i11 = o.g[(iy + 1) * (o.n + 1) + ix + 1];
    return s(s(i00, i10, tx), s(i01, i11, tx), ty);
  };
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = 0, amp = 0.5;
      for (const o of octaves) { n += sample(o, u, v) * amp; amp *= 0.5; }
      // radial falloff so the sprite has soft edges
      const dx = u - 0.5, dy = (v - 0.5) * 1.6;
      const rad = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.15);
      let a = Math.max(0, (n - 0.42) / 0.58) * rad;
      a = Math.min(1, a * 1.5);
      const i = (y * size + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 252; img.data[i + 2] = 248;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- radial glow sprite texture (corona) ----------
export function makeRadialGlowTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, col] of stops) g.addColorStop(t, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- vertical sky gradient texture ----------
export function makeSkyGradientTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [t, col] of stops) g.addColorStop(t, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- geometry vertex jitter (rocks) ----------
export function jitterGeometry(geo, amt, seed = 1, vertical = 0.4) {
  const pos = geo.attributes.position;
  const rand = mulberry32(seed);
  const v = new THREE.Vector3();
  // hash-based displacement so shared vertices stay coherent
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`;
    if (!map.has(key)) {
      map.set(key, [(rand() - 0.5) * 2 * amt, (rand() - 0.5) * 2 * amt * vertical, (rand() - 0.5) * 2 * amt]);
    }
    const d = map.get(key);
    pos.setXYZ(i, v.x + d[0], v.y + d[1], v.z + d[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
