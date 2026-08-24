import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const DECK_TOP = 4.0;
export const DECK_FRONT = 43.0;

// Compact observation platform (~10-12% of frame bottom): metal deck with a
// jagged broken rim, underside support struts, a restrained warm edge light
// strip, railing, and a tiny human silhouette.
export function buildPlatform(ctx) {
  const { graybox } = ctx;
  const group = new THREE.Group();
  const rand = mulberry32(5);

  const deckMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x4b4453, roughness: 0.85, metalness: 0.3 });
  const darkMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x2c2833, roughness: 0.8, metalness: 0.4 });

  // main slab (rear part)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 1.4, 6.8), deckMat);
  deck.position.set(0, DECK_TOP - 0.7, DECK_FRONT + 1.4 + 3.4);
  deck.castShadow = deck.receiveShadow = true;
  group.add(deck);

  // jagged front rim: teeth with one missing + one hanging broken slab
  const teeth = [
    [-5.3, 2.2, 2.8, 0],
    [-2.7, 2.1, 2.2, 0.04],
    [0.2, 2.2, 1.6, -0.05],   // shorter tooth -> notch
    [3.1, 2.0, 2.6, 0.03],
    [5.5, 1.9, 2.0, 0],
  ];
  for (const [x, w, d, rz] of teeth) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), deckMat);
    t.position.set(x, DECK_TOP - 0.7 + (rand() - 0.5) * 0.1, DECK_FRONT + d / 2);
    t.rotation.z = rz;
    t.castShadow = t.receiveShadow = true;
    group.add(t);
  }
  // hanging broken slab under the missing tooth (x ~ 1.5)
  const broken = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.8), deckMat);
  broken.position.set(1.6, DECK_TOP - 1.6, DECK_FRONT + 0.4);
  broken.rotation.set(0.5, 0.2, 0.12);
  broken.castShadow = true;
  group.add(broken);

  // underside support struts (V shape toward camera)
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6.5, 0.7), darkMat);
    strut.position.set(sx * 3.4, DECK_TOP - 3.6, DECK_FRONT + 5.2);
    strut.rotation.set(0.35, 0, sx * 0.28);
    group.add(strut);
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.5, 1.6), darkMat);
  keel.position.set(0.5, DECK_TOP - 3.2, DECK_FRONT + 7.2);
  keel.rotation.z = 0.1;
  group.add(keel);

  // warm edge light strip along the front rim (restrained)
  if (!graybox) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(12.4, 0.09, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x1a0f06, emissive: 0xffb46a, emissiveIntensity: 1.25, roughness: 0.6, fog: false })
    );
    strip.position.set(0, DECK_TOP + 0.04, DECK_FRONT + 0.32);
    group.add(strip);
  }

  // railing posts along front + right side, with broken gaps
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.25, 6);
  const posts = [];
  for (let x = -5.9; x <= 6.0; x += 1.18) {
    if (x > -3.4 && x < -1.2) continue;
    if (x > 3.6 && x < 4.4) continue;
    posts.push([x, DECK_TOP + 0.62, DECK_FRONT + 0.55]);
  }
  for (let z = DECK_FRONT + 1.6; z <= DECK_FRONT + 7.6; z += 1.25) {
    posts.push([6.3, DECK_TOP + 0.62, z]);
  }
  const postMesh = new THREE.InstancedMesh(postGeo, darkMat, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m4.makeRotationZ((rand() - 0.5) * 0.06);
    m4.setPosition(p[0], p[1], p[2]);
    postMesh.setMatrixAt(i, m4);
  });
  postMesh.castShadow = true;
  group.add(postMesh);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 10.4, 6), darkMat);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(1.1, DECK_TOP + 1.24, DECK_FRONT + 0.55);
  group.add(rail);

  // tiny human silhouette at the rim
  const personMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x0c0b11, roughness: 1 });
  const person = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.85, 4, 10), personMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), personMat);
  head.position.y = 1.62;
  person.add(body, head);
  person.position.set(-2.0, DECK_TOP, DECK_FRONT + 1.1);
  person.rotation.y = Math.PI;
  person.scale.setScalar(0.5);
  person.traverse(o => { if (o.isMesh) o.castShadow = true; });
  group.add(person);

  return group;
}
