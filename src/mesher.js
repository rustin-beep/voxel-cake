// Turns a voxel map into one merged, face-culled BufferGeometry.
//
// Only faces that touch air are emitted, so the whole diorama collapses into
// a couple of draw calls instead of thousands of cubes.  Each vertex also gets
// a baked ambient-occlusion factor (the classic 3-neighbour voxel AO), which is
// what gives the steps their contact shadows without a second light.

import * as THREE from 'three';

// cube corners for each face, wound counter-clockwise seen from outside
const FACES = [
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [0, -1, 0], v: [[1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, 0, -1], v: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
  { n: [0, 0, 1], v: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
];

const AO_LEVELS = [0.52, 0.7, 0.86, 1.0];

function vertexAO(occ, x, y, z, n, c) {
  let du;
  let dv;
  if (n[0] !== 0) {
    du = [0, c[1] ? 1 : -1, 0];
    dv = [0, 0, c[2] ? 1 : -1];
  } else if (n[1] !== 0) {
    du = [c[0] ? 1 : -1, 0, 0];
    dv = [0, 0, c[2] ? 1 : -1];
  } else {
    du = [c[0] ? 1 : -1, 0, 0];
    dv = [0, c[1] ? 1 : -1, 0];
  }
  const bx = x + n[0];
  const by = y + n[1];
  const bz = z + n[2];
  const s1 = occ(bx + du[0], by + du[1], bz + du[2]) ? 1 : 0;
  const s2 = occ(bx + dv[0], by + dv[1], bz + dv[2]) ? 1 : 0;
  if (s1 && s2) return AO_LEVELS[0];
  const corner = occ(bx + du[0] + dv[0], by + du[1] + dv[1], bz + du[2] + dv[2]) ? 1 : 0;
  return AO_LEVELS[3 - (s1 + s2 + corner)];
}

export function buildVoxelGeometry(voxels, occupied, palette, { ao = true } = {}) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  const colorCache = new Map();
  const colorOf = (name) => {
    let c = colorCache.get(name);
    if (!c) {
      // THREE.Color converts the sRGB hex into the renderer's working (linear) space
      c = new THREE.Color(palette[name] || '#ff00ff');
      colorCache.set(name, c);
    }
    return c;
  };

  let vi = 0;
  for (const [key, name] of voxels) {
    const [x, y, z] = key.split('|').map(Number);
    const base = colorOf(name);
    for (const face of FACES) {
      const n = face.n;
      if (occupied(x + n[0], y + n[1], z + n[2])) continue;
      for (const c of face.v) {
        const k = ao ? vertexAO(occupied, x, y, z, n, c) : 1;
        positions.push(x + c[0], y + c[1], z + c[2]);
        normals.push(n[0], n[1], n[2]);
        colors.push(base.r * k, base.g * k, base.b * k);
      }
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();

  // cells span [x, x+1]; shift so the diorama is centred on the origin
  geo.translate(-0.5, 0, -0.5);
  return geo;
}
