import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { makeCrackTextures, makeStarSurfaceTexture } from './util.js';
import { buildSky } from './sky.js';
import { buildStar } from './star.js';
import { buildRing } from './ring.js';
import { buildIsland, ISLAND_POS } from './island.js';
import { buildCity } from './city.js';
import { buildNeedle, NEEDLE_BASE } from './needle.js';
import { buildPlatform } from './platform.js';
import { buildFrames } from './frames.js';
import { buildClouds } from './clouds.js';
import { buildLights } from './lights.js';
import { buildWindows } from './windows.js';
import { buildWaterfalls } from './waterfalls.js';
import { buildDebris } from './debris.js';
import { buildGravity } from './gravity.js';
import { buildGame } from './game.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const graybox = mode === 'graybox';
const nobloom = mode === 'nobloom';
const cameraPreset = params.get('camera');
const tFreeze = params.has('t') ? parseFloat(params.get('t')) : null;

const stage = document.getElementById('stage');

// mobile performance tier: cap pixel ratio at 1.5 (renderer) and halve bloom
// resolution (applied as a setSize override in resize(), see bloomPass there)
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.devicePixelRatio > 2.5;

// block rubber-band scrolling / pull-to-refresh everywhere (the page never scrolls)
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// loading screen: dismissed once modules are loaded and the first frame is up
// (?loading=1 keeps it for acceptance screenshots). One-shot: animate() calls
// this every frame, so guard the fade + remove timer behind a flag.
const loadingEl = document.getElementById('loading');
let loadingDismissed = false;
function dismissLoading() {
  if (loadingDismissed || !loadingEl) return;
  if (params.has('loading')) return;
  loadingDismissed = true;
  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.remove(), 800);
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 3));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 9 / 16, 0.1, 900);

// ---------------- camera choreography ----------------
const INTRO = 7; // seconds
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function posterPose(aspect) {
  if (aspect >= 1.2) return { pos: [2, 12, 84], look: [0, 22, -40], fov: 50 };
  return { pos: [0, 8, 58], look: [2, 24, -40], fov: 55 };
}
function introStartPose(aspect) {
  if (aspect >= 1.2) return { pos: [2, 6.5, 72], look: [0, 25, -41], fov: 50 };
  // low, close behind the deck: strong foreground occlusion
  return { pos: [-1.2, 4.6, 54.0], look: [3, 26, -43], fov: 55 };
}

const _look = new THREE.Vector3();
function camAt(t, aspect, camDX = 0, camDY = 0) {
  if (cameraPreset === 'tower') {
    camera.fov = 42;
    camera.position.set(NEEDLE_BASE.x + 26, NEEDLE_BASE.y + 16, NEEDLE_BASE.z + 45);
    _look.set(NEEDLE_BASE.x + 0.5, NEEDLE_BASE.y + 12, NEEDLE_BASE.z);
  } else if (cameraPreset === 'city') {
    camera.fov = 46;
    camera.position.set(30, 22, -8);
    _look.set(2, 12, -42);
  } else {
    const s = introStartPose(aspect);
    const p = posterPose(aspect);
    if (t < INTRO) {
      const k = easeInOutCubic(t / INTRO);
      camera.fov = s.fov;
      camera.position.set(
        s.pos[0] + (p.pos[0] - s.pos[0]) * k,
        s.pos[1] + (p.pos[1] - s.pos[1]) * k,
        s.pos[2] + (p.pos[2] - s.pos[2]) * k
      );
      _look.set(
        s.look[0] + (p.look[0] - s.look[0]) * k,
        s.look[1] + (p.look[1] - s.look[1]) * k,
        s.look[2] + (p.look[2] - s.look[2]) * k
      );
    } else {
      camera.fov = p.fov;
      const bob = Math.sin((t - INTRO) * 0.45) * 0.14; // IDLE breathing
      camera.position.set(p.pos[0], p.pos[1] + bob, p.pos[2]);
      _look.set(p.look[0], p.look[1], p.look[2]);
    }
  }
  // M2: the camera leans a little toward the dragged sun (~18%)
  camera.position.x += camDX;
  camera.position.y += camDY;
  camera.lookAt(_look.x + camDX * 0.5, _look.y + camDY * 0.5, _look.z);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

const ctx = {
  scene,
  graybox,
  gray: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.95, metalness: 0 }),
  textures: { crack: makeCrackTextures(7), starSurface: makeStarSurfaceTexture(11) },
  windows: [],
  navs: [],
};

scene.add(buildSky(ctx));
const star = buildStar(ctx);
scene.add(star);
scene.add(buildRing(ctx));

// CityRig: everything the sun's gravity can tip over, pivoting near the
// island's heart. Children keep their absolute world coordinates; mounting
// subtracts the pivot so the rig's rotation leans the whole city as one body.
const rig = new THREE.Group();
const PIVOT = new THREE.Vector3(ISLAND_POS.x, ISLAND_POS.y + 4, ISLAND_POS.z);
rig.position.copy(PIVOT);
scene.add(rig);
const mount = (g) => { g.position.sub(PIVOT); rig.add(g); return g; };

mount(buildIsland(ctx));
mount(buildCity(ctx));
const needle = mount(buildNeedle(ctx));
scene.add(buildPlatform(ctx));
scene.add(buildFrames(ctx));
scene.add(buildClouds(ctx));
const lights = buildLights(ctx);
scene.add(lights);
// the needle's core light rides the rig so it stays glued to the tipping tower
const coreLight = lights.userData.coreLight;
if (coreLight) {
  lights.remove(coreLight);
  coreLight.position.sub(PIVOT);
  rig.add(coreLight);
}
// M1 atmosphere layer
const windows = mount(buildWindows(ctx));
const falls = mount(buildWaterfalls(ctx));
const debris = mount(buildDebris(ctx));

// M2: the one interaction — drag the sun, gravity goes haywire
const gravity = buildGravity(ctx, { star, rig, camera, stage, params, tFreeze, intro: INTRO });
// M3: the game loop — stability, endings, instant retry
const game = buildGame(ctx, { rig, lights, scene, renderer, gravity, params, intro: INTRO, pivot: PIVOT });

let composer = null, bloomPass = null;
if (!graybox && !nobloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // NOTE: the constructor resolution is immediately overridden by setSize()
  // (UnrealBloomPass derives its mips from whatever setSize receives), so the
  // mobile 0.5x tier is applied in resize() below, not here.
  bloomPass = new UnrealBloomPass(new THREE.Vector2(390, 844), 0.45, 0.5, 0.8);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setSize(w, h);
    // mobile tier: halve bloom again. UnrealBloomPass.setSize(w,h) seeds mip0
    // at (w/2, h/2); overriding with (w/2, h/2) puts mobile mip0 at (w/4, h/4)
    // = 0.5x the desktop bloom resolution. Desktop keeps the default.
    if (isMobile && bloomPass) bloomPass.setSize(Math.round(w / 2), Math.round(h / 2));
  }
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const spinners = star.userData.spinners || [];
const spinnerBase = spinners.map(s => s.mat.rotation);
let elapsed = 0;
let pulseExtra = 0; // agitation-driven extra core-pulse phase (accumulated)
let hudLine = '';   // game state line shown by the inputdebug overlay (1-frame lag)

function updateScene(t, dt, aspect) {
  const g = gravity.update(t, dt, hudLine);
  const gm = game.update(t, dt, g);
  hudLine = gm.hudLine;
  const agitation = gm.agitation ?? g.agitation;
  camAt(t, aspect, g.camDX + gm.camDX, g.camDY + gm.camDY);
  if (!graybox) {
    pulseExtra += dt * agitation * 2.4; // core pulse quickens when haywire
    const phase = t * 1.6 + pulseExtra;
    const core = needle.userData.core;
    if (core) core.material.emissiveIntensity = 1.15 + Math.sin(phase) * 0.25;
    const cl = lights.userData.coreLight;
    if (cl) cl.intensity = 46 + Math.sin(phase) * 12;
    spinners.forEach((s, i) => { s.mat.rotation = spinnerBase[i] + t * s.speed; });
    windows.userData.update?.(t, agitation, gm.blackout);
  }
  falls.userData.update?.(t, g.bendZ, g.bendX, g.mistBX);
  debris.userData.update?.(t, g.debBX, g.debBY, gm.scatter);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = tFreeze !== null ? 0 : Math.min(clock.getDelta(), 0.1);
  const t = tFreeze !== null ? tFreeze : (elapsed += dt);
  updateScene(t, dt, stage.clientWidth / stage.clientHeight);
  if (composer) composer.render();
  else renderer.render(scene, camera);
  dismissLoading();
}

// ?sim=N: fast-forward N scene-seconds at fixed 1/60 steps before the first
// frame. Deterministic (seeded RNG), independent of headless virtual-time
// pacing — the acceptance harness for tide/stability numbers.
// ?simmode=state steps ONLY gravity/game logic (no camera, material, window,
// waterfall or debris updates) then syncs visuals once for the final frame;
// it is picked automatically under headless automation (navigator.webdriver).
// ?simmode=full forces the legacy whole-scene stepping. Physics-identical:
// the skipped updates are purely visual and never feed back into the sim.
const simSec = parseFloat(params.get('sim'));
if (Number.isFinite(simSec) && simSec > 0) {
  const steps = Math.min(Math.round(simSec * 60), 60 * 150);
  const simMode = params.get('simmode');
  const stateOnly = simMode === 'state' || (simMode === null && navigator.webdriver);
  const simAspect = stage.clientWidth / stage.clientHeight;
  if (stateOnly) {
    for (let i = 0; i < steps; i++) {
      elapsed += 1 / 60;
      const g = gravity.update(elapsed, 1 / 60, hudLine);
      hudLine = game.update(elapsed, 1 / 60, g).hudLine;
    }
    updateScene(elapsed, 0, simAspect); // one visual sync for the final frame
  } else {
    for (let i = 0; i < steps; i++) {
      elapsed += 1 / 60;
      updateScene(elapsed, 1 / 60, simAspect);
    }
  }
}
animate();

let calls = 0;
scene.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) calls++; });
console.log('[m3] mode =', mode || 'lit', '| camera =', cameraPreset || 'hero', '| t =', tFreeze, '| sun =', params.get('sun'), '| stab =', params.get('stab'), '| time =', params.get('time'), '| renderables =', calls);
