import * as THREE from 'three';
import { ISLAND_POS } from './island.js';
import { mulberry32, makeRadialGlowTexture } from './util.js';

// ---------------------------------------------------------------------------
// M3: the game loop — stability, a state machine, two endings, instant retry.
//
//   INTRO (camera move) -> PLAYING (25s) -> ENDING_FALL (3s)
//                                       -> ENDING_BALANCE (3.5s) -> RESULT
//
// Numbers follow the proven 2D tuning (game-2d-v01.html): full tilt drains
// ~11/s, calm (<~4 deg) recovers ~5.5/s, angular velocity adds stress.
// All scene-driving is deterministic per-frame integration, zero allocation;
// DOM writes are threshold-gated. ?stab=N and ?time=N pin acceptance states.
// ---------------------------------------------------------------------------

const ROUND_TIME = 25;      // seconds per round
const DRAIN_RATE = 11;      // stability/s at full tilt
const RECOVER_RATE = 5.5;   // stability/s when calm
const CALM_SEV = 0.22;      // ~4 degrees: below this the city is "calm"
const FALL_LEN = 3.0;
const BALANCE_LEN = 3.5;

// M4 gravity tides: every ~7s a wave shoves the gravity balance sideways
// (tideOffset, shared with the gravity controller). Numbers are tuned so an
// idle player drowns before the 25s timer — the requested 30-40% shove with
// a 12s decay can mathematically never beat the recovery rate, so the shove
// is ~73-91% of a full drag and decays with tau=10s (valley stays above the
// calm threshold until the next wave lands).
const TIDE_WARN = 1.2;      // s of red-pulse warning before the hit
const TIDE_FIRST_MIN = 3.5; // no tides during the first seconds of a round
const TIDE_GAP_MIN = 5.0, TIDE_GAP_RND = 1.5;
const TIDE_PUSH_MIN = 33, TIDE_PUSH_RND = 8; // world units (~0.73-0.91 of full drag)
const TIDE_TAU = 10;        // s, exponential decay of tideOffset

const EXPOSURE0 = 1.12;
const FOG0 = 0x241c40, HEMI_SKY0 = 0x342a63, HEMI_GND0 = 0x6e4526, HEMI_INT0 = 0.7;
const SUN_COL0 = 0xffa860, SUN_INT0 = 3.6;

const smoothstep = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

export function buildGame(ctx, { rig, lights, scene, renderer, gravity, params, intro, pivot }) {
  // ---------------- DOM: HUD / vignette / dawn wash / result overlay ----------------
  const style = document.createElement('style');
  style.textContent = `
    #hud { position: fixed; top: calc(14px + env(safe-area-inset-top)); left: 50%;
      transform: translateX(-50%); width: min(300px, 62vw); pointer-events: none;
      z-index: 5; opacity: 0; transition: opacity .5s; }
    #hud.show { opacity: 1; }
    #stabWrap { height: 10px; border-radius: 6px; background: rgba(255,255,255,.14);
      box-shadow: 0 0 0 1px rgba(255,255,255,.08) inset, 0 2px 8px rgba(0,0,0,.35); overflow: hidden; }
    #stabFill { height: 100%; width: 100%; border-radius: 6px; transition: width .12s linear; }
    #hudText { margin-top: 5px; text-align: center; font-size: 11px; letter-spacing: 2px;
      color: rgba(255,255,255,.55); font-family: -apple-system, "PingFang SC", sans-serif; }
    #hud.low #stabFill { animation: stabPulse .5s infinite alternate; }
    #hud.warn #stabWrap { animation: stabPulse .35s infinite alternate; }
    @keyframes stabPulse { from { filter: brightness(1); } to { filter: brightness(1.8); } }
    #hud.gold #stabFill { background: linear-gradient(90deg,#ffd98a,#fff0c8) !important; animation: none;
      box-shadow: 0 0 14px rgba(255,214,140,.8); }
    #vignette { position: fixed; inset: 0; z-index: 3; pointer-events: none; opacity: 0;
      background: linear-gradient(180deg, rgba(5,3,12,.30) 0%, rgba(5,3,12,.72) 55%, rgba(3,2,8,.95) 100%); }
    #dawn { position: fixed; inset: 0; z-index: 3; pointer-events: none; opacity: 0;
      mix-blend-mode: screen;
      background: linear-gradient(180deg, rgba(255,196,120,.55) 0%, rgba(255,160,90,.26) 42%, rgba(255,130,70,0) 78%); }
    #overlay { position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 10;
      background: rgba(8,5,18,.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      opacity: 0; pointer-events: none; transition: opacity .6s;
      font-family: -apple-system, "PingFang SC", sans-serif; }
    #overlay.show { opacity: 1; pointer-events: auto; }
    #endTitle { font-size: 34px; color: #ffe9c4; letter-spacing: 8px; margin: 0 0 10px;
      text-shadow: 0 0 24px rgba(255,180,90,.5); font-weight: 600; }
    #endSub { font-size: 13px; color: rgba(255,255,255,.6); letter-spacing: 2px; margin: 0 0 34px; }
    #restartBtn { cursor: pointer; border: 1px solid rgba(255,210,140,.6);
      background: rgba(255,180,90,.12); color: #ffd9a0; border-radius: 999px;
      font-size: 16px; letter-spacing: 4px; padding: 13px 42px; transition: all .2s; }
    #restartBtn:hover { background: rgba(255,180,90,.22); }
    #restartBtn:active { transform: scale(.94); background: rgba(255,180,90,.3); }
    /* gentle landscape nudge: dismissible, never locks the game */
    #rotateHint { position: fixed; inset: 0; z-index: 8; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      background: rgba(10,7,24,.72); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      font-family: -apple-system, "PingFang SC", sans-serif; text-align: center; }
    @media (orientation: landscape) { #rotateHint.on { display: flex; } }
    #rotateHint .big { font-size: 26px; letter-spacing: 6px; color: #ffe9c4; margin-bottom: 12px; }
    #rotateHint .small { font-size: 12px; letter-spacing: 2px; color: rgba(255,255,255,.55); }`;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = '<div id="stabWrap"><div id="stabFill"></div></div><div id="hudText"></div>';
  const vignette = document.createElement('div');
  vignette.id = 'vignette';
  const dawn = document.createElement('div');
  dawn.id = 'dawn';
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.innerHTML = '<h1 id="endTitle"></h1><p id="endSub"></p><button id="restartBtn">↻ 再来一次</button>';
  document.body.append(hud, vignette, dawn, overlay);
  if (ctx.graybox) { // keep graybox inspection shots clean of game UI
    hud.style.display = 'none';
    overlay.style.display = 'none';
    vignette.style.display = 'none';
    dawn.style.display = 'none';
  }

  // landscape nudge: one tap dismisses it for the session, game keeps running
  const rotateHint = document.createElement('div');
  rotateHint.id = 'rotateHint';
  rotateHint.className = 'on';
  rotateHint.innerHTML = '<div class="big">🔄 建议竖屏游玩</div><div class="small">横屏也能玩 · 点按任意处继续</div>';
  rotateHint.addEventListener('click', () => rotateHint.classList.remove('on'));
  if (!ctx.graybox) document.body.appendChild(rotateHint);

  const stabFill = hud.querySelector('#stabFill');
  const hudText = hud.querySelector('#hudText');
  const endTitle = overlay.querySelector('#endTitle');
  const endSub = overlay.querySelector('#endSub');
  overlay.querySelector('#restartBtn').addEventListener('click', restart);

  // ---------------- state ----------------
  const stab0 = parseFloat(params.get('stab'));
  const time0 = parseFloat(params.get('time'));
  const S = {
    state: 'intro',            // intro | playing | fall | balance | result
    stab: Number.isFinite(stab0) ? Math.min(Math.max(stab0, 0), 100) : 100,
    gameT: Number.isFinite(time0) ? Math.min(Math.max(time0, 0), ROUND_TIME) : 0,
    endT: 0,                   // time inside the ending performance
    endKind: null,             // 'fall' | 'balance'
    fallRotZ: 0, fallSign: 1,
  };

  // ---------------- M4 tide machine ----------------
  const tideRng = mulberry32(99);
  const tide = {
    phase: 'idle',             // idle | warn
    nextAt: TIDE_FIRST_MIN + tideRng() * 2,
    warnT: 0,
    px: 0, py: 0,              // pending shove vector (world units)
    hits: 0,                   // waves landed this round
    wavePeak: 0,               // |offset| right after the last hit
    waveAge: 99,               // seconds since the last hit
    tutDone: (() => { try { return localStorage.getItem('tide-tut-done') === '1'; } catch (_) { return false; } })(),
  };
  const tideOff = gravity.tideOffset; // shared with the tilt math
  // acceptance hooks: ?tide=now fires the first wave immediately;
  // ?tide=x,y pins the offset (with ?t= it never decays -> steady frame)
  const tideParam = params.get('tide');
  if (tideParam === 'now') {
    if (params.has('t')) {
      // frozen acceptance frame: pose mid-warning immediately
      const a = tideRng() * Math.PI * 2;
      const m = TIDE_PUSH_MIN + tideRng() * TIDE_PUSH_RND;
      tide.px = Math.cos(a) * m;
      tide.py = Math.sin(a) * m;
      tide.phase = 'warn';
      tide.warnT = TIDE_WARN * 0.85; // M4.1b: pose near full warning intensity
      hud.classList.add('warn');
    } else {
      tide.nextAt = 0;
    }
  } else if (tideParam) {
    const [tx, ty] = tideParam.split(',').map(parseFloat);
    if (Number.isFinite(tx) && Number.isFinite(ty)) {
      tideOff.set(tx, ty);
      tide.hits = 1; tide.wavePeak = Math.hypot(tx, ty); tide.waveAge = 99;
    }
  }
  // scripted player for the ?bot= acceptance harness (used with ?sim=)
  const botMode = params.get('bot'); // 'full' | 'half'
  const bot = { mode: botMode, reactT: -1, hold: false };

  function tideFire() { // the shove lands
    tideOff.x += tide.px;
    tideOff.y += tide.py;
    tide.hits++;
    tide.wavePeak = Math.hypot(tideOff.x, tideOff.y);
    tide.waveAge = 0;
    tide.phase = 'idle';
    tide.nextAt = S.gameT + TIDE_GAP_MIN + tideRng() * TIDE_GAP_RND;
    if (bot.mode === 'full' || (bot.mode === 'half' && tide.hits % 2 === 1)) {
      bot.reactT = bot.mode === 'half' ? 3.5 : 1.2; // the casual player is slower
    } else if (bot.hold) {
      // a wave the bot ignores lands: stop countering and let it shove
      bot.hold = false;
      gravity.botNudge(0, 0);
    }
    gravity.setTideWarn(0, 0, 0, false, 0);
    hud.classList.remove('warn');
  }

  function tideUpdate(dt, sceneT, g) {
    if (dt > 0) {
      // natural decay (very slow) — waves accumulate if ignored
      const decay = Math.exp(-dt / TIDE_TAU);
      tideOff.x *= decay;
      tideOff.y *= decay;
      tide.waveAge += dt;

      if (tide.phase === 'idle') {
        if (S.gameT >= tide.nextAt) { // warning begins: direction is decided now
          const a = tideRng() * Math.PI * 2;
          const m = TIDE_PUSH_MIN + tideRng() * TIDE_PUSH_RND;
          tide.px = Math.cos(a) * m;
          tide.py = Math.sin(a) * m;
          tide.phase = 'warn';
          tide.warnT = 0;
          hud.classList.add('warn');
        }
      } else { // warn
        tide.warnT += dt;
        if (tide.warnT >= TIDE_WARN) tideFire();
      }

      // scripted counter-drag (bot): react 1.2s after the hit, then hold the
      // sun against the tide (re-pinned every frame) until it fully recedes
      if (bot.reactT > 0) {
        bot.reactT -= dt;
        if (bot.reactT <= 0) bot.hold = true;
      }
      if (bot.hold) {
        if (Math.hypot(tideOff.x, tideOff.y) > 1) gravity.botNudge(-tideOff.x, -tideOff.y);
        else { bot.hold = false; gravity.botNudge(0, 0); }
      }

      // tutorial: countering a wave within 4s of the hit dismisses it forever
      if (!tide.tutDone && tide.hits >= 1 && tide.wavePeak > 13 && tide.waveAge < 4) {
        const eff = Math.hypot(g.ndx, g.ndy);
        if (eff < 0.15) {
          tide.tutDone = true;
          try { localStorage.setItem('tide-tut-done', '1'); } catch (_) { /* private mode */ }
        }
      }
    }

    // warning visuals + camera micro-shake run every frame (incl. frozen ?t=)
    if (tide.phase === 'warn') {
      const k = Math.min(tide.warnT / TIDE_WARN, 1);
      const showArrow = !tide.tutDone && tide.hits === 0;
      gravity.setTideWarn(k, -tide.px, -tide.py, showArrow, sceneT);
      ret.camDX += Math.sin(sceneT * 47) * 0.3 * k;
      ret.camDY += Math.cos(sceneT * 39) * 0.22 * k;
    }
  }

  function tideStop() {
    tide.phase = 'idle';
    tide.nextAt = Infinity;
    // M4.1: zero the residual shove too — a frozen leftover offset would keep
    // leaning the tilt target and fight the balance ending's upright ease.
    tideOff.set(0, 0);
    bot.hold = false;
    gravity.setTideWarn(0, 0, 0, false, 0);
    hud.classList.remove('warn');
  }

  const motes = ctx.graybox ? null : buildMotes();
  if (motes) {
    motes.group.position.sub(pivot); // ride the rig like windows/debris do
    rig.add(motes.group);
  }

  // preallocated colors for the dawn transition
  const cFogN = new THREE.Color(FOG0), cFogD = new THREE.Color(0x7a4a58);
  const cSkyN = new THREE.Color(HEMI_SKY0), cSkyD = new THREE.Color(0x5e4468);
  const cGndN = new THREE.Color(HEMI_GND0), cGndD = new THREE.Color(0x9a6238);
  const cSunN = new THREE.Color(SUN_COL0), cSunD = new THREE.Color(0xffd2a0);

  // ?snap=fall:1.5 | balance:1.8 — deterministic acceptance snapshots: jump
  // straight into an ending at the given second. Applied on the first update
  // (after gravity has written its steady state into the rig), so ?t= freeze
  // frames capture the exact performance frame regardless of wall-clock pace.
  let pendingSnap = null;
  const snapRaw = params.get('snap');
  if (snapRaw) {
    const [kind, sec] = snapRaw.split(':');
    if (kind === 'fall' || kind === 'balance') {
      pendingSnap = { kind, t: Math.max(0, parseFloat(sec) || 0) };
    }
  }
  // ?restart=1 (acceptance only): right after a ?snap-driven ending reaches the
  // result screen, run restart() once — a frozen frame then captures the exact
  // fresh-round state the player sees after tapping "再来一次".
  let restartOnce = params.has('restart');

  let lastHud = -1, lastHudText = '';
  function setHud(v, gold) {
    if (Math.abs(v - lastHud) >= 0.4) {
      lastHud = v;
      stabFill.style.width = clamp01(v / 100) * 100 + '%';
      const hue = 8 + (130 - 8) * clamp01(v / 100); // red -> green
      stabFill.style.background = `linear-gradient(90deg, hsl(${hue},85%,58%), hsl(${hue + 18},85%,64%))`;
      hud.classList.toggle('low', v < 25);
    }
    hud.classList.toggle('gold', !!gold);
  }
  function setHudText(s) {
    if (s !== lastHudText) { lastHudText = s; hudText.textContent = s; }
  }

  function startFall() {
    S.state = 'fall'; S.endT = 0; S.endKind = 'fall';
    S.fallRotZ = rig.rotation.z;
    S.fallSign = rig.rotation.z >= 0 ? 1 : -1;
    if (Math.abs(rig.rotation.z) < 0.02) S.fallSign = 1;
    gravity.cancelDrag();
    tideStop();
    setHudText('稳定度归零');
  }
  function startBalance() {
    S.state = 'balance'; S.endT = 0; S.endKind = 'balance';
    gravity.cancelDrag(); // sun springs home, the city eases upright
    tideStop();
    setHudText('重力恢复中…');
  }
  function showResult() {
    S.state = 'result';
    endTitle.textContent = S.endKind === 'fall' ? '它坠入了云海' : '城市得救了';
    endSub.textContent = S.endKind === 'fall'
      ? '稳定度归零 —— 城市没能撑过这个夜晚'
      : '你稳住了重力，黎明照常升起';
    overlay.classList.add('show');
    hud.classList.remove('show');
  }

  function restart() {
    S.state = 'playing'; S.gameT = 0; S.stab = 100; S.endT = 0; S.endKind = null;
    gravity.reset();
    tide.phase = 'idle';
    tide.nextAt = TIDE_FIRST_MIN + tideRng() * 2;
    tide.warnT = 0; tide.hits = 0; tide.wavePeak = 0; tide.waveAge = 99;
    tideOff.set(0, 0);
    bot.reactT = -1;
    bot.hold = false;
    gravity.setTideWarn(0, 0, 0, false, 0);
    hud.classList.remove('warn');
    rig.position.copy(pivot);
    rig.rotation.set(0, 0, 0);
    renderer.toneMappingExposure = EXPOSURE0;
    if (scene.fog) scene.fog.color.set(FOG0);
    const hemi = lights.userData.hemi, sun = lights.userData.sun;
    if (hemi) { hemi.color.set(HEMI_SKY0); hemi.groundColor.set(HEMI_GND0); hemi.intensity = HEMI_INT0; }
    if (sun) { sun.color.set(SUN_COL0); sun.intensity = SUN_INT0; }
    vignette.style.opacity = '0';
    dawn.style.opacity = '0';
    if (motes) motes.intensity = 0;
    overlay.classList.remove('show');
    hud.classList.remove('gold');
    hud.classList.add('show');
    lastHud = -1; lastHudText = '';
  }

  // ---------------- per-frame ----------------
  const ret = { camDX: 0, camDY: 0, agitation: null, scatter: 0, blackout: 0, hudLine: '' };

  function update(sceneT, dt, g) {
    if (S.state === 'intro') {
      if (sceneT >= intro) {
        S.state = 'playing';
        hud.classList.add('show');
      }
    }
    if (pendingSnap && S.state === 'playing') {
      const ps = pendingSnap;
      pendingSnap = null;
      if (ps.kind === 'fall') { S.stab = 0; startFall(); }
      else startBalance();
      S.endT = ps.t;
    }

    ret.camDX = 0; ret.camDY = 0;
    ret.agitation = null; ret.scatter = 0; ret.blackout = 0;

    if (S.state === 'playing') {
      if (dt > 0) {
        S.gameT += dt;
        const sev = Math.min(Math.hypot(g.tiltZDeg, g.tiltXDeg) / 18, 1);
        const angStress = Math.min(Math.hypot(g.tiltVZ, g.tiltVX) * 0.9, 5);
        if (sev < CALM_SEV) S.stab = Math.min(100, S.stab + RECOVER_RATE * dt);
        else S.stab -= (sev * DRAIN_RATE + angStress) * dt;
        if (S.stab <= 0) { S.stab = 0; startFall(); }
        else if (S.gameT >= ROUND_TIME) startBalance();
      }
      if (S.state === 'playing') {
        tideUpdate(dt, sceneT, g); // timing inside is dt-gated; visuals run always
        setHud(S.stab, false);
        setHudText(`稳定度 · 再撑 ${Math.max(0, ROUND_TIME - S.gameT).toFixed(1)}s`);
      }
    }

    if (S.state === 'fall') {
      S.endT += dt;
      const p = clamp01(S.endT / FALL_LEN);
      rig.position.y = pivot.y - p * p * 85;              // accelerating sink
      rig.rotation.z = S.fallRotZ + S.fallSign * p * 0.38; // tipping out of control
      ret.scatter = Math.min(p * 1.6, 1.4);                // debris rain upward
      ret.blackout = clamp01((p - 0.12) / 0.75);           // windows die in swathes
      ret.agitation = Math.max(g.agitation, 1 - ret.blackout);
      ret.camDY = -smoothstep(Math.min(p / 0.45, 1)) * 20; // camera follows, then stops
      renderer.toneMappingExposure = EXPOSURE0 * (1 - p * 0.70);
      vignette.style.opacity = (clamp01((p - 0.3) / 0.7) * 0.9).toFixed(3);
      setHud(S.stab, false);
      if (p >= 1) showResult();
    } else if (S.state === 'balance') {
      S.endT += dt;
      const p = clamp01(S.endT / BALANCE_LEN);
      const k = smoothstep(p * 1.12); // dawn arrives slightly ahead of the fade
      if (scene.fog) scene.fog.color.lerpColors(cFogN, cFogD, k);
      const hemi = lights.userData.hemi, sun = lights.userData.sun;
      if (hemi) {
        hemi.color.lerpColors(cSkyN, cSkyD, k);
        hemi.groundColor.lerpColors(cGndN, cGndD, k);
        hemi.intensity = HEMI_INT0 + k * 0.3;
      }
      if (sun) {
        sun.color.lerpColors(cSunN, cSunD, k);
        sun.intensity = SUN_INT0 + k * 0.7;
      }
      renderer.toneMappingExposure = EXPOSURE0 + k * 0.18;
      dawn.style.opacity = (k * 0.55).toFixed(3);
      setHud(100 * k + S.stab * (1 - k), true); // bar refills and turns gold
      if (motes) motes.intensity = clamp01(p * 2.2);
      if (p >= 1) showResult();
    } else if (S.state === 'result') {
      // keep the aftermath alive behind the overlay
      if (S.endKind === 'balance' && motes) motes.intensity = 1;
      if (S.endKind === 'fall') ret.blackout = 1;
    }

    if (restartOnce && S.state === 'result') { restartOnce = false; restart(); }

    if (motes) motes.update(sceneT);
    const tideNext = tide.phase === 'warn' ? `WARN ${(TIDE_WARN - tide.warnT).toFixed(1)}`
      : Number.isFinite(tide.nextAt) ? `next ${Math.max(0, tide.nextAt - S.gameT).toFixed(1)}s` : 'off';
    ret.hudLine =
      `state ${S.state}  stab ${S.stab.toFixed(1)}  time ${S.gameT.toFixed(1)}\n` +
      `tide (${tideOff.x.toFixed(1)},${tideOff.y.toFixed(1)})  |${Math.hypot(tideOff.x, tideOff.y).toFixed(1)}|  ${tideNext}  hits ${tide.hits}`;
    return ret;
  }

  // ------------------------------------------------------------------ motes
  // golden particles rising off the city in the balance ending (<=300 points,
  // same deterministic-life pattern as the waterfall mist)
  function buildMotes() {
    const N = 260;
    const rand = mulberry32(2024);
    const pPos = new Float32Array(N * 3);
    const pAlpha = new Float32Array(N);
    const pScale = new Float32Array(N);
    const base = new Float32Array(N * 3);
    const rate = new Float32Array(N);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 15;
      base[i * 3] = ISLAND_POS.x + Math.cos(a) * r * 1.25;
      base[i * 3 + 1] = ISLAND_POS.y + 2 + rand() * 9;
      base[i * 3 + 2] = ISLAND_POS.z + Math.sin(a) * r;
      rate[i] = 0.10 + rand() * 0.12;
      phase[i] = rand();
      pScale[i] = 2.5 + rand() * 4.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(pScale, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: {
          value: makeRadialGlowTexture([
            [0, 'rgba(255,246,214,1)'],
            [0.35, 'rgba(255,214,130,0.7)'],
            [1, 'rgba(255,170,80,0)'],
          ], 64),
        },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aAlpha; attribute float aScale; varying float vA;
        void main(){
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aScale * (140.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vA;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(t.rgb, t.a * vA);
        }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    const group = new THREE.Group();
    group.add(points);

    const mote = {
      group,
      intensity: 0,
      update(t) {
        if (mote.intensity < 0.01) { points.visible = false; return; }
        points.visible = true;
        for (let i = 0; i < N; i++) {
          const life = (t * rate[i] + phase[i]) % 1;
          pPos[i * 3] = base[i * 3] + Math.sin(life * 4 + phase[i] * 7) * 1.2;
          pPos[i * 3 + 1] = base[i * 3 + 1] + life * 30;
          pPos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(life * 3 + phase[i] * 5) * 1.2;
          pAlpha[i] = Math.sin(life * Math.PI) * mote.intensity * 0.9;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
      },
    };
    return mote;
  }

  return { update };
}
