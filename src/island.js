import * as THREE from 'three';
import { jitterGeometry } from './util.js';

export const ISLAND_POS = new THREE.Vector3(7, 14, -42); // top surface of the plateau
export const ISLAND_RADIUS = 18;

// Floating island: flat plateau the city stands on + jittered rock cone below + floating shards.
export function buildIsland(ctx) {
  const { graybox } = ctx;
  const group = new THREE.Group();
  const rockMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x453c52, roughness: 0.95, metalness: 0.05, flatShading: true });
  const topMat = graybox ? ctx.gray : new THREE.MeshStandardMaterial({ color: 0x5c5468, roughness: 0.9, metalness: 0.05, flatShading: true });

  const plateauGeo = jitterGeometry(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 2.5, 3.2, 26, 2), 0.55, 11);
  const plateau = new THREE.Mesh(plateauGeo, topMat);
  plateau.position.set(ISLAND_POS.x, ISLAND_POS.y - 1.6, ISLAND_POS.z);
  plateau.castShadow = plateau.receiveShadow = true;
  group.add(plateau);

  const coneGeo = jitterGeometry(new THREE.CylinderGeometry(ISLAND_RADIUS - 2.5, 3.2, 24, 22, 7), 1.5, 23);
  const cone = new THREE.Mesh(coneGeo, rockMat);
  cone.position.set(ISLAND_POS.x, ISLAND_POS.y - 3.2 - 12, ISLAND_POS.z);
  cone.castShadow = cone.receiveShadow = true;
  group.add(cone);

  // floating shards near the island edges (gravity is broken)
  const shardMat = rockMat;
  const shardDefs = [
    [ISLAND_RADIUS + 5.5, -4, 3, 2.6, 31],
    [-(ISLAND_RADIUS + 4), -7, -5, 1.9, 47],
    [ISLAND_RADIUS + 2, -10, -8, 1.4, 59],
  ];
  for (const [dx, dy, dz, s, seed] of shardDefs) {
    const g = jitterGeometry(new THREE.IcosahedronGeometry(s, 1), s * 0.35, seed);
    const shard = new THREE.Mesh(g, shardMat);
    shard.position.set(ISLAND_POS.x + dx, ISLAND_POS.y + dy, ISLAND_POS.z + dz);
    shard.rotation.set(seed, seed * 0.7, seed * 0.3);
    shard.castShadow = true;
    group.add(shard);
  }
  return group;
}
