import * as THREE from 'three';
import { makeSkyGradientTexture } from './util.js';

// Sky = scene.background gradient + matching CSS gradient for the side bands on desktop.
export function buildSky(ctx) {
  const { scene, graybox } = ctx;
  let stops, css;
  if (graybox) {
    stops = [[0, '#e2e2e2'], [0.55, '#cfcfcf'], [1, '#b8b8b8']];
    css = 'linear-gradient(180deg,#e2e2e2 0%,#cfcfcf 55%,#b8b8b8 100%)';
  } else {
    stops = [
      [0.0, '#0d0a24'],
      [0.4, '#1b1440'],
      [0.7, '#2a1c4a'],
      [0.88, '#43284a'],
      [1.0, '#5d3228'],
    ];
    css = 'linear-gradient(180deg,#0d0a24 0%,#1b1440 40%,#2a1c4a 70%,#43284a 88%,#5d3228 100%)';
  }
  scene.background = makeSkyGradientTexture(stops);
  document.body.style.background = css;
  return new THREE.Group();
}
