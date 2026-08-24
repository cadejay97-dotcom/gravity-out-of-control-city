import * as THREE from 'three';
import { STAR_POS } from './star.js';
import { NEEDLE_CORE_POS } from './needle.js';

// Lighting rigs for both modes. Geometry is identical; only lights/fog/materials differ.
export function buildLights(ctx) {
  const { scene, graybox } = ctx;
  const group = new THREE.Group();

  if (graybox) {
    // flat, even inspection lighting
    group.add(new THREE.AmbientLight(0xffffff, 1.05));
    group.add(new THREE.HemisphereLight(0xffffff, 0x9c9c9c, 0.85));
    const soft = new THREE.DirectionalLight(0xffffff, 0.5);
    soft.position.set(40, 80, 60);
    group.add(soft);
    scene.fog = null;
  } else {
    // key: warm orange-gold from the star's direction (only shadow caster)
    const sun = new THREE.DirectionalLight(0xffa860, 3.6);
    sun.position.set(STAR_POS.x + 15, STAR_POS.y, STAR_POS.z + 40);
    sun.target.position.set(6, 12, -30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 380;
    sun.shadow.bias = -0.002;
    group.add(sun, sun.target);

    // rim: cool cyan-blue from the opposite front-low side
    const rim = new THREE.DirectionalLight(0x5fb9dd, 1.25);
    rim.position.set(-55, 18, 85);
    rim.target.position.set(6, 18, -40);
    group.add(rim, rim.target);

    // hemisphere ambient: deep violet-blue above, muted warm below
    const hemi = new THREE.HemisphereLight(0x342a63, 0x6e4526, 0.7);
    group.add(hemi);

    // teal point light at the gravity-needle core
    const core = new THREE.PointLight(0x2fe8c8, 50, 95, 2);
    core.position.copy(NEEDLE_CORE_POS);
    group.add(core);
    group.userData.coreLight = core;
    // exposed for the M3 dawn transition (balance ending)
    group.userData.hemi = hemi;
    group.userData.sun = sun;

    // air perspective
    scene.fog = new THREE.FogExp2(0x241c40, 0.004);
  }
  return group;
}
