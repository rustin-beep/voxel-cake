// Voxel layout for the birthday diorama.
//
// x,z ∈ [-19, 19], y ∈ [0, 22] → 39 × 23 × 39 cells, inside the 40 × 40 × 32 budget.
//
// Groups (three draw calls):
//   solid  – ground, tray, gifts, balloons, strings, flowers, cat  (receive only)
//   cake   – tiers, icing, candle plates, candle bodies            (cast + receive)
//   flame  – three emissive candle tips                            (unlit)
//
// Small-screen rule: ornament must survive 8 px per cell. So: no random
// speckle storms, no 1-cell features that need a magnifier — every detail is
// either a deliberate 2–4 cell shape or a single accent with breathing room.

export const PALETTE = {
  groundA: '#454e6c',
  groundB: '#2f3648',
  tray: '#6a5238',
  trayRim: '#8a6a44',
  pink: '#e79aa9',
  vanilla: '#f4e2c4',
  cream: '#fffaf0',
  candle: '#fff3d8',
  flame: '#ffb23c',
  berry: '#d9556f',
  mint: '#5fa895',
  gold: '#dfa845',
  goldTrim: '#d2a86a',
  giftBody: '#b8495f',
  giftRib: '#e8bb62',
  gift2Body: '#4f8f83',
  gift2Rib: '#f0e0bf',
  balloon1: '#b06878',
  balloon2: '#6d9a84',
  balloon3: '#c39a55',
  string: '#565d70',
  stem: '#4a6b4e',
  petalWhite: '#f2e3c4',
  petalPink: '#d98a94',
  petalGold: '#e9b45c',
  catFur: '#b98256',
  catCream: '#f2ddb8',
  catEar: '#8f5f3f',
  catEye: '#5b3a24',
  stone: '#7b8397',
  grass: '#4f7a52',
  grassLight: '#6b9a62',
};

const KEY = (x, y, z) => `${x}|${y}|${z}`;

function hash2(x, z) {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export function buildWorld() {
  const solid = new Map();
  const cake = new Map();
  const flame = new Map();

  const putS = (x, y, z, c) => solid.set(KEY(x, y, z), c);
  const putC = (x, y, z, c) => cake.set(KEY(x, y, z), c);
  const putF = (x, y, z, c) => flame.set(KEY(x, y, z), c);
  const free = (x, y, z) => !solid.has(KEY(x, y, z)) && !cake.has(KEY(x, y, z));

  // ---------------------------------------------------------------- ground
  for (let x = -19; x <= 19; x++) {
    for (let z = -19; z <= 19; z++) putS(x, 0, z, 'groundB');
  }
  for (let x = -18; x <= 18; x++) {
    for (let z = -18; z <= 18; z++) {
      const block = (Math.floor((x + 18) / 3) + Math.floor((z + 18) / 3)) & 1;
      const rim = Math.abs(x) === 18 || Math.abs(z) === 18;
      putS(x, 1, z, rim ? 'groundB' : block ? 'groundA' : 'groundB');
    }
  }

  // ------------------------------------------------------------------ tray
  for (let x = -14; x <= 14; x++) {
    for (let z = -14; z <= 14; z++) putS(x, 2, z, 'tray');
  }
  for (let x = -14; x <= 14; x++) {
    for (let z = -14; z <= 14; z++) {
      if (Math.abs(x) === 14 || Math.abs(z) === 14) {
        putS(x, 3, z, ((x + z) % 3 + 3) % 3 === 0 ? 'goldTrim' : 'trayRim');
      }
    }
  }

  // ------------------------------------------------------------------ cake
  const sprinkles = ['berry', 'mint', 'gold', 'cream', 'cream', 'cream'];
  const tiers = [
    { half: 11, y0: 3, y1: 8, body: 'pink', drips: [-5, 4] },
    { half: 9, y0: 9, y1: 13, body: 'vanilla', drips: [-3, 5] },
    { half: 7, y0: 14, y1: 17, body: 'pink', drips: [-2, 3] },
  ];

  for (const t of tiers) {
    const h = t.half;

    for (let y = t.y0; y <= t.y1; y++) {
      for (let x = -h; x <= h; x++) {
        for (let z = -h; z <= h; z++) {
          const edge = Math.abs(x) === h || Math.abs(z) === h;
          let c = t.body;

          if (y === t.y1) {
            if (edge) {
              const k = hash2(x, z);
              c = k < 0.1 ? sprinkles[Math.floor(k * 1000) % sprinkles.length] : 'cream';
            } else if (h === 7) {
              // four piped rosettes: 3×3 cream ring with a berry centre
              const dx = Math.abs(x) - 5;
              const dz = Math.abs(z) - 5;
              if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
                c = dx === 0 && dz === 0 ? 'berry' : 'cream';
              }
            }
          } else if (edge && y > t.y0 && hash2(x * 3 + 1, z * 5 + 2) > 0.965) {
            c = sprinkles[Math.floor(hash2(x * 3 + 1, z * 5 + 2) * 997) % sprinkles.length];
          }
          putC(x, y, z, c);
        }
      }
    }

    // one short drip per face — sparse enough not to read as pilasters
    [['z', 1], ['z', -1], ['x', 1], ['x', -1]].forEach(([axis, sign], i) => {
      const o = t.drips[i % t.drips.length];
      for (let k = 1; k <= 3; k++) {
        if (axis === 'z') putC(o, t.y1 - k, sign * h, 'cream');
        else putC(sign * h, t.y1 - k, o, 'cream');
      }
    });

    // icing hanging off the four corners
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
      const ex = sx * h;
      const ez = sz * h;
      putC(ex, t.y1 - 1, ez, 'cream');
      putC(ex, t.y1 - 2, ez, 'cream');
      if ((h + i) % 2 === 0) putC(ex, t.y1 - 3, ez, 'cream');
    });
  }

  // ---------------------------------------------------------- candle plates
  for (const x of [-4, 0, 4]) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) putC(x + dx, 18, dz, 'goldTrim');
    }
    for (let y = 19; y <= 21; y++) putC(x, y, 0, 'candle');
    putF(x, 22, 0, 'flame');
  }

  // ------------------------------------------------------------ star topper
  // 7 × 7 five-point star, two cells thick, on a stick above the candles.
  // It has to sit clear of the icing: when the lower points touched the cake
  // top they disappeared into the cream and the star read as a gold cross.
  for (let y = 18; y <= 20; y++) putC(0, y, -6, 'goldTrim');
  const starRows = [
    [21, [-3, 3]],
    [22, [-2, -1, 1, 2]],
    [23, [-1, 0, 1]],
    [24, [-2, -1, 0, 1, 2]],
    [25, [-3, -2, -1, 0, 1, 2, 3]],
    [26, [-1, 0, 1]],
    [27, [0]],
  ];
  for (const [y, xs] of starRows) {
    for (const x of xs) {
      putC(x, y, -6, 'gold');
      putC(x, y, -5, 'gold');
    }
  }

  // --------------------------------------------------------------- presents
  const gift = (x0, y0, z0, w, h, body, rib, lid) => {
    const cx = x0 + Math.floor(w / 2);
    const cz = z0 + Math.floor(w / 2);
    for (let x = x0; x < x0 + w; x++) {
      for (let z = z0; z < z0 + w; z++) {
        for (let y = y0; y < y0 + h; y++) {
          putS(x, y, z, x === cx || z === cz ? rib : body);
        }
      }
    }
    for (let x = x0 - 1; x <= x0 + w; x++) {
      for (let z = z0 - 1; z <= z0 + w; z++) {
        if (x === x0 - 1 || x === x0 + w || z === z0 - 1 || z === z0 + w) {
          putS(x, y0 + h - 1, z, lid);
        }
      }
    }
    putS(cx, y0 + h, cz, rib);
    putS(cx - 1, y0 + h, cz, rib);
    putS(cx + 1, y0 + h, cz, rib);
  };
  gift(-18, 2, 4, 3, 3, 'giftBody', 'giftRib', 'giftRib');
  gift(8, 2, 15, 3, 4, 'gift2Body', 'gift2Rib', 'gift2Rib');

  // -------------------------------------------------------------- balloons
  const balloon = (x0, y0, z0, c) => {
    for (let x = x0; x < x0 + 4; x++) {
      for (let y = y0; y < y0 + 4; y++) {
        for (let z = z0; z < z0 + 4; z++) {
          const ex = x === x0 || x === x0 + 3;
          const ey = y === y0 || y === y0 + 3;
          const ez = z === z0 || z === z0 + 3;
          if (ex && ey && ez) continue;
          putS(x, y, z, c);
        }
      }
    }
    putS(x0 + 1, y0 - 1, z0 + 1, c);
    putS(x0 + 2, y0 - 1, z0 + 2, c);
  };
  const balloonTail = (x, y0, z) => {
    [0, 0, -1, 0].forEach((o, i) => putS(x + o, y0 - i, z, 'string'));
  };
  balloon(-18, 18, -10, 'balloon1');
  balloonTail(-16, 16, -8);
  balloon(-16, 18, 1, 'balloon2');
  balloonTail(-14, 16, 3);
  balloon(15, 18, -14, 'balloon3');
  balloonTail(17, 16, -12);

  // --------------------------------------------------------------- flowers
  const flower = (x, z, petal) => {
    if (!free(x, 2, z)) return;
    putS(x, 2, z, 'stem');
    putS(x, 3, z, petal);
  };
  flower(-18, -3, 'petalWhite');
  flower(-16, 9, 'petalPink');
  flower(18, -12, 'petalGold');
  flower(16, 3, 'petalWhite');
  flower(5, 18, 'petalPink');
  flower(-11, 17, 'petalGold');
  flower(11, 16, 'petalWhite');
  flower(-8, 17, 'petalPink');
  flower(17, -4, 'petalGold');
  flower(-17, 8, 'petalWhite');

  // ------------------------------------------------ courtyard life (detail)
  // confetti ground into the paving: recolour single top-layer cells
  const confetti = ['berry', 'mint', 'gold', 'petalPink', 'petalWhite'];
  for (let x = -18; x <= 18; x++) {
    for (let z = -18; z <= 18; z++) {
      if (Math.abs(x) <= 14 && Math.abs(z) <= 14) continue; // tray footprint
      if (!free(x, 2, z)) continue;
      const h = hash2(x * 13 + 7, z * 17 + 3);
      if (h < 0.05) putS(x, 1, z, confetti[Math.floor(h * 1000) % confetti.length]);
    }
  }

  // a few pebbles and grass tufts, clustered rather than sprinkled
  [
    [-17, 12], [-15, -7], [16, -16], [12, 2], [18, 8], [-9, -17],
  ].forEach(([x, z]) => {
    if (free(x, 2, z)) putS(x, 2, z, 'stone');
  });
  [
    [-17, -14], [-16, -16], [15, 14], [17, 16], [-11, -16], [13, -17], [-18, 18],
  ].forEach(([x, z]) => {
    if (!free(x, 2, z)) return;
    putS(x, 2, z, 'grass');
    if (free(x, 3, z)) putS(x, 3, z, 'grassLight');
  });

  // a small extra present tucked beside the big one
  for (let x = -17; x <= -16; x++) {
    for (let z = 11; z <= 12; z++) {
      for (let y = 2; y <= 3; y++) putS(x, y, z, 'gift2Body');
    }
  }
  putS(-17, 4, 11, 'gift2Rib');
  putS(-16, 4, 12, 'gift2Rib');

  const bounds = { min: [-19, 0, -19], max: [19, 22, 19] };
  const counts = { solid: solid.size, cake: cake.size, flame: flame.size };
  return { solid, cake, flame, palette: PALETTE, bounds, counts };
}
