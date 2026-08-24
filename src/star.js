import * as THREE from 'three';
import { makeRadialGlowTexture, makeCoronaTexture } from './util.js';

export const STAR_POS = new THREE.Vector3(-22, 92, -130);
export const STAR_RADIUS = 38;

// Cracked star: bright layered surface (sunspots / hot / bright zones + 3-tier cracks),
// hot-core billboard, structured (feathered) multi-layer corona, rim flares.
export function buildStar(ctx) {
  const { graybox, textures } = ctx;
  const group = new THREE.Group();
  const R = STAR_RADIUS;

  const geo = new THREE.SphereGeometry(R, 96, 64);
  let mat;
  if (graybox) {
    mat = new THREE.MeshStandardMaterial({
      color: 0x8a8a8a, map: textures.crack.albedo, roughness: 0.95, metalness: 0,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: textures.starSurface,
      emissiveIntensity: 1.45,
      roughness: 1, metalness: 0,
      fog: false,
    });
  }
  const star = new THREE.Mesh(geo, mat);
  star.position.copy(STAR_POS);
  group.add(star);

  if (!graybox) {
    const spinners = [];
    const addSprite = (tex, scale, opacity, offset, spin) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity,
        rotation: Math.random() * Math.PI * 2,
      }));
      s.position.copy(STAR_POS);
      if (offset) s.position.add(offset);
      s.scale.setScalar(scale);
      group.add(s);
      if (spin) spinners.push({ mat: s.material, speed: spin });
      return s;
    };

    // hot core: white-yellow center fading to the orange limb
    addSprite(makeRadialGlowTexture([
      [0, 'rgba(255,250,228,0.9)'],
      [0.3, 'rgba(255,214,140,0.5)'],
      [0.65, 'rgba(255,150,60,0.1)'],
      [1, 'rgba(255,120,40,0)'],
    ]), R * 1.5, 0.85);

    // structured corona: two feathered layers with different spin + one wide soft golden halo
    addSprite(makeCoronaTexture(5, '255,236,190', '255,150,60'), R * 3.4, 0.95, null, 0.03);
    addSprite(makeCoronaTexture(9, '255,220,160', '240,110,50'), R * 5.2, 0.75, null, -0.018);
    addSprite(makeRadialGlowTexture([
      [0, 'rgba(255,205,115,0.22)'],
      [0.5, 'rgba(235,165,75,0.08)'],
      [1, 'rgba(205,125,55,0)'],
    ]), R * 7.4, 0.8);

    // rim flares: 3 small hot knots on the limb + 1 tiny ejected arc
    const flareTex = makeRadialGlowTexture([
      [0, 'rgba(255,250,225,1)'],
      [0.35, 'rgba(255,200,120,0.5)'],
      [1, 'rgba(255,150,60,0)'],
    ], 128);
    const rim = (deg, z) => new THREE.Vector3(
      STAR_POS.x + R * 0.98 * Math.cos(THREE.MathUtils.degToRad(deg)),
      STAR_POS.y + R * 0.98 * Math.sin(THREE.MathUtils.degToRad(deg)),
      STAR_POS.z + z
    );
    addSprite(flareTex, 13, 0.95, rim(32, 9));
    addSprite(flareTex, 8, 0.9, rim(158, 7));
    addSprite(flareTex, 16, 0.85, rim(284, 10));

    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(R * 0.32, 0.55, 6, 28, 1.15),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, fog: false })
    );
    arc.position.copy(rim(205, 6));
    arc.rotation.set(0.4, 0.2, THREE.MathUtils.degToRad(205) + 1.2);
    group.add(arc);

    group.userData.spinners = spinners;
  }
  return group;
}
