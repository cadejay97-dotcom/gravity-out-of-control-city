import * as THREE from 'three';
import { STAR_POS, STAR_RADIUS } from './star.js';
import { makeRadialGlowTexture } from './util.js';

// ---------------------------------------------------------------------------
// M2: the one interaction — drag the sun, gravity goes haywire.
//
// Owns: sun drag (Pointer Events on the z = STAR_POS.z plane), sun return
// spring, CityRig tilt spring (follows the sun with lag & overshoot), hint
// ring + drag-hand, inputdebug overlay, and the ?sun=x,y freeze parameter.
// Everything is integrated with a semi-implicit Euler scheme inside update();
// no allocation per frame, no heavy work inside pointermove (only a ray/plane
// intersection and clamps into preallocated state).
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

// drag range on the sun plane (world units, z fixed at STAR_POS.z)
const RANGE = { xMin: -85, xMax: 45, yMin: 48, yMax: 140 };
const FULL_DRAG = 45;          // world units of offset that maps to full tilt
const TILT_Z_MAX = 18 * DEG;   // max lean toward the sun (screen-left/right)
const TILT_X_MAX = 7 * DEG;    // max fore/aft lean (sun higher/lower)
const GRAB_R = STAR_RADIUS * 1.5;

// sun return spring: weak pull, ~2.5-3s drift home, (near) no overshoot.
// The city stays tilted — and keeps bleeding stability — until the player
// pushes the sun back by hand. (M4: was a snappy 1s spring with overshoot.)
const SUN_K = 4.5, SUN_C = 4.2;      // omega ~2.1, zeta ~0.99 (critical)
// city tilt follow spring: visible lag + wobble
const TILT_K = 20, TILT_C = 5.0;    // omega ~4.5, zeta ~0.56

export function buildGravity(ctx, { star, rig, camera, stage, params, tFreeze, intro }) {
  const home = STAR_POS.clone();
  const fixed = parseSunParam(params); // ?sun=x,y -> Vector3 or null
  const inputdebug = params.get('mode') === 'inputdebug';

  // ---- mutable state (all preallocated) ----
  const sunPos = home.clone();
  const sunVel = new THREE.Vector3();
  const tideOffset = new THREE.Vector2(); // M4 tide push, added to the sun offset
  const tilt = { z: 0, x: 0, vz: 0, vx: 0 };          // rig lean (rad)
  const dragTarget = new THREE.Vector3();
  let dragging = false;
  let dragMoved = false;
  let activePointer = -1;
  let downXY = { x: 0, y: 0 };

  // smoothed normalized sun offset, exposed for camera/debris/mist coupling
  const out = {
    ndx: 0, ndy: 0,            // -1..1 normalized sun offset
    tiltZDeg: 0, tiltXDeg: 0,  // actual rig lean in degrees
    agitation: 0,              // 0 calm .. 1 haywire
    camDX: 0, camDY: 0,        // camera follow shift
    bendZ: 0, bendX: 0,        // waterfall extra bend (rad)
    mistBX: 0,                 // mist initial-velocity bias
    debBX: 0, debBY: 0,        // debris drift bias
    dragging: false,
  };

  if (fixed) {
    sunPos.copy(fixed);
    const ndx = THREE.MathUtils.clamp((sunPos.x - home.x) / FULL_DRAG, -1, 1);
    const ndy = THREE.MathUtils.clamp((sunPos.y - home.y) / FULL_DRAG, -1, 1);
    tilt.z = -ndx * TILT_Z_MAX;
    tilt.x = -ndy * TILT_X_MAX; // jump straight to steady state (acceptance mode)
  }

  // ---- hint: dashed ring + sliding drag-hand, attached to the star group ----
  let hint = null;
  if (!ctx.graybox && !fixed && !hintDone()) {
    hint = buildHint();
    star.add(hint.group);
  }

  // ---- tide warning channel (red pulse ring + counter-drag tutorial arrow) ----
  const tideFx = ctx.graybox ? null : buildTideWarn();
  if (tideFx) star.add(tideFx.group);

  // ---- inputdebug overlay ----
  let dbg = null;
  if (inputdebug) {
    dbg = document.createElement('div');
    dbg.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:10;pointer-events:none;' +
      'background:rgba(4,6,14,0.62);color:#9fe8ff;font:12px/1.5 ui-monospace,monospace;' +
      'padding:8px 10px;border-radius:6px;white-space:pre;';
    document.body.appendChild(dbg);
  }

  // ---- pointer input (skipped entirely when ?sun= pins the star) ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -STAR_POS.z); // z = STAR_POS.z
  const hit = new THREE.Vector3();

  function planePoint(ev) {
    const w = stage.clientWidth, h = stage.clientHeight;
    ndc.set((ev.clientX / w) * 2 - 1, -(ev.clientY / h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }

  function onDown(ev) {
    if (fixed || activePointer !== -1) return;
    const p = planePoint(ev);
    if (!p) return;
    if (p.distanceTo(sunPos) > GRAB_R) return;
    activePointer = ev.pointerId;
    dragging = true;
    dragMoved = false;
    downXY.x = ev.clientX; downXY.y = ev.clientY;
    dragTarget.copy(p);
    sunVel.set(0, 0, 0);
    try { stage.setPointerCapture(ev.pointerId); } catch (_) { /* noop */ }
    ev.preventDefault();
  }
  function onMove(ev) {
    if (ev.pointerId !== activePointer) return;
    const p = planePoint(ev);
    if (!p) return;
    dragTarget.set(
      THREE.MathUtils.clamp(p.x, RANGE.xMin, RANGE.xMax),
      THREE.MathUtils.clamp(p.y, RANGE.yMin, RANGE.yMax),
      home.z
    );
    if (!dragMoved && Math.hypot(ev.clientX - downXY.x, ev.clientY - downXY.y) > 12) {
      dragMoved = true; // first effective drag: dismiss the hint for good
      if (hint) hint.dismiss();
      markHintDone();
    }
    ev.preventDefault();
  }
  function onUp(ev) {
    if (ev.pointerId !== activePointer) return;
    activePointer = -1;
    dragging = false;
    try { stage.releasePointerCapture(ev.pointerId); } catch (_) { /* noop */ }
  }

  if (!fixed) {
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // ---- per-frame update ----
  function update(t, dt, gameLine) {
    dt = Math.min(dt, 0.05);

    // sun: follow finger 1:1 while dragging; spring back home otherwise
    if (dragging) {
      sunPos.copy(dragTarget);
      sunVel.set(0, 0, 0);
    } else if (!fixed && dt > 0) {
      sunVel.x += (-SUN_K * (sunPos.x - home.x) - SUN_C * sunVel.x) * dt;
      sunVel.y += (-SUN_K * (sunPos.y - home.y) - SUN_C * sunVel.y) * dt;
      sunPos.x += sunVel.x * dt;
      sunPos.y += sunVel.y * dt;
    }
    star.position.set(sunPos.x - home.x, sunPos.y - home.y, 0);

    // normalized offset that drives the city: sun drag + tide push combined
    out.ndx = THREE.MathUtils.clamp((sunPos.x - home.x + tideOffset.x) / FULL_DRAG, -1, 1);
    out.ndy = THREE.MathUtils.clamp((sunPos.y - home.y + tideOffset.y) / FULL_DRAG, -1, 1);
    out.sunNdx = THREE.MathUtils.clamp((sunPos.x - home.x) / FULL_DRAG, -1, 1); // drag alone

    // city tilt spring toward the sun-implied target
    const tz = -out.ndx * TILT_Z_MAX;
    const tx = -out.ndy * TILT_X_MAX;
    if (dt > 0) {
      tilt.vz += (-TILT_K * (tilt.z - tz) - TILT_C * tilt.vz) * dt;
      tilt.vx += (-TILT_K * (tilt.x - tx) - TILT_C * tilt.vx) * dt;
      tilt.z += tilt.vz * dt;
      tilt.x += tilt.vx * dt;
    } else {
      // frozen acceptance frame (?t=): jump straight to the steady state so
      // ?sun= / ?tide= pins produce the exact posed tilt without integration
      tilt.z = tz; tilt.x = tx; tilt.vz = tilt.vx = 0;
    }
    rig.rotation.z = tilt.z;
    rig.rotation.x = tilt.x;

    const nz = tilt.z / TILT_Z_MAX, nx = tilt.x / TILT_X_MAX; // -1..1 actual lean
    out.tiltZDeg = tilt.z / DEG;
    out.tiltXDeg = tilt.x / DEG;
    out.tiltVZ = tilt.vz;
    out.tiltVX = tilt.vx;
    out.agitation = Math.min(Math.hypot(nz, nx), 1);

    // camera follows ~18% of the drag, softened
    out.camDX = -nz * 3.2;
    out.camDY = -nx * 1.8;

    // waterfalls flow along the NEW gravity: the rig's own rotation tips a
    // hanging fall's bottom away from the sun, so the local bend must
    // overcompensate — world bend ends up ~1.4x the tilt toward the sun.
    out.bendZ = THREE.MathUtils.clamp(-tilt.z * 2.4, -45 * DEG, 45 * DEG);
    out.bendX = THREE.MathUtils.clamp(-tilt.x * 2.4, -18 * DEG, 18 * DEG);
    out.mistBX = -nz * 2.2;

    // debris slides with the lean + floats up as things get wild
    out.debBX = -nz * 6;
    out.debBY = out.agitation * 2.5;

    out.dragging = dragging;

    if (hint) hint.update(t);
    if (dbg) {
      const state = fixed ? 'pinned(?sun)' : dragging ? 'dragging'
        : (Math.abs(sunPos.x - home.x) + Math.abs(sunPos.y - home.y) > 0.4 ? 'returning' : 'settled');
      dbg.textContent =
        `sun world  x ${sunPos.x.toFixed(1)}  y ${sunPos.y.toFixed(1)}\n` +
        `sun offset ndx ${out.ndx.toFixed(2)}  ndy ${out.ndy.toFixed(2)}\n` +
        `tilt Z ${out.tiltZDeg.toFixed(1)}°  X ${out.tiltXDeg.toFixed(1)}°  | ${Math.hypot(out.tiltZDeg, out.tiltXDeg).toFixed(1)}°\n` +
        `spring ${state}  vz ${tilt.vz.toFixed(3)}\n` +
        `agitation ${(out.agitation * 100).toFixed(0)}%  flicker ${(14 + 30 * out.agitation).toFixed(0)}%` +
        (gameLine ? `\n${gameLine}` : '');
    }
    return out;
  }

  // back to a clean round: sun home, springs settled, drag released
  function reset() {
    dragging = false;
    activePointer = -1;
    sunVel.set(0, 0, 0);
    if (fixed) {
      sunPos.copy(fixed);
      const ndx = THREE.MathUtils.clamp((sunPos.x - home.x) / FULL_DRAG, -1, 1);
      const ndy = THREE.MathUtils.clamp((sunPos.y - home.y) / FULL_DRAG, -1, 1);
      tilt.z = -ndx * TILT_Z_MAX;
      tilt.x = -ndy * TILT_X_MAX;
    } else {
      sunPos.copy(home);
      tilt.z = tilt.x = 0;
    }
    tilt.vz = tilt.vx = 0;
  }

  // endings seize control: release any active drag so the sun springs home
  function cancelDrag() {
    dragging = false;
    activePointer = -1;
  }

  // scripted counter-drag for the ?bot= acceptance harness
  function botNudge(wx, wy) {
    sunPos.set(home.x + wx, home.y + wy, home.z);
    sunVel.set(0, 0, 0);
  }

  // tide warning visuals. k 0..1 fades in; dirX/dirY is the direction the
  // player should drag to counter; showArrow only on the first tide.
  function setTideWarn(k, dirX, dirY, showArrow, t) {
    if (!tideFx) return;
    if (k <= 0.01) { tideFx.group.visible = false; return; }
    tideFx.group.visible = true;
    // M4.1: raised pulse floor (0.56k min) + wider scale thump so the ring
    // stays readable at 390x844 even at the bottom of the pulse cycle
    const pulse = 0.78 + 0.22 * Math.sin(t * 9);
    tideFx.ring.material.opacity = k * pulse;
    const s = 1 + 0.11 * Math.sin(t * 9);
    tideFx.ring.scale.set(s, s, 1);
    tideFx.arrow.material.opacity = showArrow ? Math.min(k * 1.0, 1) : 0;
    if (showArrow) tideFx.arrow.rotation.z = Math.atan2(dirY, dirX) - ARROW_BASE;
  }

  return { update, reset, cancelDrag, botNudge, setTideWarn, tideOffset };
}

// ---------------------------------------------------------------------------
function parseSunParam(params) {
  const raw = params.get('sun');
  if (!raw) return null;
  const [xs, ys] = raw.split(',');
  const nx = parseFloat(xs), ny = parseFloat(ys);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  // stage-normalized: -1..1 maps to a comfortable offset envelope around home
  return new THREE.Vector3(
    THREE.MathUtils.clamp(STAR_POS.x + nx * 40, RANGE.xMin, RANGE.xMax),
    THREE.MathUtils.clamp(STAR_POS.y + ny * 34, RANGE.yMin, RANGE.yMax),
    STAR_POS.z
  );
}

function hintDone() {
  try { return localStorage.getItem('gravity-hint-done') === '1'; } catch (_) { return false; }
}
function markHintDone() {
  try { localStorage.setItem('gravity-hint-done', '1'); } catch (_) { /* private mode */ }
}

// dashed ring texture (drawn on canvas so the dashes stay readable over the
// star's additive corona — a 1px GL line would drown in the glow). lw/dash/rad
// let the tide warning use a bolder, tighter variant than the drag hint.
function makeDashedRingTexture(color = 'rgba(255,244,214,0.95)', lw = 5, dash = [14, 11], rad = 118) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.setLineDash(dash);
  g.beginPath();
  g.arc(S / 2, S / 2, rad, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// arc + arrowhead texture for the "drag THIS way" counter-tide tutorial.
// The arrowhead points along texture direction ARROW_BASE (rad); rotate the
// mesh by (targetAngle - ARROW_BASE) to aim it.
const ARROW_A1 = -2.4;
const ARROW_BASE = ARROW_A1 - Math.PI / 2;
function makeArcArrowTexture() {
  const S = 256, cx = 128, cy = 128, r = 88, a0 = -0.4;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,214,150,0.95)';
  g.lineWidth = 20; // M4.1b: extra-bold arc, readable at 390x844
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, r, a0, ARROW_A1, true); // clockwise sweep
  g.stroke();
  const tx = cx + Math.cos(ARROW_A1) * r, ty = cy + Math.sin(ARROW_A1) * r;
  const tan = ARROW_BASE;
  g.fillStyle = 'rgba(255,214,150,0.95)';
  g.beginPath();
  g.moveTo(tx + Math.cos(tan) * 38, ty + Math.sin(tan) * 38);
  g.lineTo(tx + Math.cos(tan + 2.5) * 24, ty + Math.sin(tan + 2.5) * 24);
  g.lineTo(tx + Math.cos(tan - 2.5) * 24, ty + Math.sin(tan - 2.5) * 24);
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// red pulse ring + counter-drag arrow, attached to the star group
function buildTideWarn() {
  const group = new THREE.Group();
  group.position.copy(STAR_POS); // star-group children use absolute coords
  const R = STAR_RADIUS * 1.5;

  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 2.3, R * 2.3),
    new THREE.MeshBasicMaterial({
      map: makeDashedRingTexture('rgba(255,116,104,0.95)', 10, [16, 10], 62), // M4.1b: tight, bold
      transparent: true, opacity: 0, depthWrite: false, fog: false,
      // M4.1b: normal blending — additive red over the bright sun/sky just
      // washes to white and the ring vanishes; solid alpha keeps it readable
      blending: THREE.NormalBlending,
    })
  );
  ring.position.z = 44;
  group.add(ring);

  const arrow = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 52), // M4.1: bigger counter-drag arrow
    new THREE.MeshBasicMaterial({
      map: makeArcArrowTexture(),
      transparent: true, opacity: 0, depthWrite: false, fog: false,
      blending: THREE.NormalBlending, // M4.1b: same wash-out fix as the ring
    })
  );
  arrow.position.set(0, -(R + 30), 44); // below the sun, out of the way
  group.add(arrow);

  group.visible = false;
  return { group, ring, arrow };
}

// dashed ring around the star + a glowing "hand" dot sliding along a small arc
function buildHint() {
  const group = new THREE.Group();
  group.position.copy(STAR_POS); // star-group children use absolute coords
  const R = STAR_RADIUS * 1.5;

  // textured plane facing the camera, slightly in front of the star's surface
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 2.15, R * 2.15),
    new THREE.MeshBasicMaterial({
      map: makeDashedRingTexture(), transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    })
  );
  ring.position.z = 42; // ahead of the star sphere and its corona sprites
  group.add(ring);

  const hand = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialGlowTexture([
      [0, 'rgba(255,255,246,1)'],
      [0.25, 'rgba(255,226,160,0.9)'],
      [0.6, 'rgba(255,190,100,0.35)'],
      [1, 'rgba(255,180,90,0)'],
    ], 64),
    depthWrite: false, fog: false, opacity: 0,
  }));
  hand.scale.setScalar(10);
  group.add(hand);

  let dismissed = false;
  let fade = 0; // 0 hidden .. 1 shown
  const INTRO_END = 7;

  return {
    group,
    dismiss() { dismissed = true; },
    update(t) {
      const target = dismissed ? 0 : (t > INTRO_END ? 1 : 0);
      fade += (target - fade) * 0.06;
      if (fade < 0.01) { group.visible = false; return; }
      group.visible = true;
      ring.material.opacity = fade * 0.85;
      ring.rotation.z = t * 0.15;
      const a = Math.PI / 6 + Math.sin(t * 0.9) * 0.55;
      hand.position.set(Math.cos(a) * R, Math.sin(a) * R, 46);
      hand.material.opacity = fade * (0.6 + 0.35 * Math.sin(t * 2.2));
    },
  };
}
