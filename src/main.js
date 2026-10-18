import * as THREE from 'three';
import { buildWorld } from './world.js';
import { buildVoxelGeometry } from './mesher.js';
import { createMusic } from './music.js';

// --------------------------------------------------------------------------
// constants
// --------------------------------------------------------------------------
const ELEVATION = THREE.MathUtils.degToRad(28); // fixed 28° down-tilt
const TARGET = new THREE.Vector3(0, 10, 0);
const CAM_DISTANCE = 60;
const SPIN = 0.12;            // rad / s
const RESUME_MS = 2000;       // auto-spin comes back 2s after release
const DRAG_SENSITIVITY = 0.0075;
const MAX_DPR = 2;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --------------------------------------------------------------------------
// dom
// --------------------------------------------------------------------------
const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');
const fallback = document.getElementById('fallback');
const fallbackNote = document.getElementById('fallback-note');
const ui = document.getElementById('ui');
const statusEl = document.getElementById('status');
const ritualBtn = document.getElementById('ritual');
const musicBtn = document.getElementById('music');
const BLESSING_HTML = statusEl ? statusEl.innerHTML.trim() : '';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function showFallback(reason) {
  stopLoop();
  document.body.classList.add('is-fallback');
  fallback.hidden = false;
  fallbackNote.textContent =
    reason === 'lost'
      ? '图形上下文丢失，已切换为静态版本。WebGL context lost — showing the static cake instead.'
      : '当前设备无法使用 WebGL，已切换为静态版本。WebGL unavailable — showing the static cake instead.';
  if (window.__cake) window.__cake.fallback = reason;
}

// --------------------------------------------------------------------------
// webgl capability
// --------------------------------------------------------------------------
function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
  } catch (err) {
    return false;
  }
}

// --------------------------------------------------------------------------
// renderer / scene
// --------------------------------------------------------------------------
let renderer = null;
let scene = null;
let camera = null;
let light = null;
let baseLightIntensity = 0;
let rafId = 0;
let lastTime = 0;
let azimuth = 0.12;
let autoSpin = !reduceMotion && (window.__intro?.done ?? true);
let dragging = false;
let resumeTimer = 0;
let lastPointerX = 0;

// ritual: lit → (blow) → dark → (relight) → lit
let flameMesh = null;
let ritual = 'lit';
let ritualBusy = false;
let lightScale = 1;
let lightTarget = 1;
let relightTimer = 0;

// a tap is a pointer press that never really moved
let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownAt = 0;
let pointerMoved = false;

const music = createMusic();
let musicStarted = false;

const frameTimes = [];
const stats = {
  drawcalls: 0,
  triangles: 0,
  fps: 0,
  avgFrameMs: 0,
  dpr: 1,
  gpu: 'unknown',
};

window.__cake = {
  ready: false,
  fallback: null,
  skipIntro: () => window.__skipIntro?.(),
  blowOut,
  relight,
  ritual: () => ({ state: ritual, lightScale: Math.round(lightScale * 100) / 100, music: musicStarted }),
  stats() {
    return {
      ...stats,
      frames: frameTimes.length,
      voxels: window.__cake.counts,
      autoSpin,
      reduceMotion,
      azimuth,
    };
  },
};

function boot() {
  if (!hasWebGL()) {
    showFallback('unavailable');
    return;
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    showFallback('unavailable');
    return;
  }

  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) stats.gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  } catch (err) {
    /* informational only */
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The world and the light never move, so the shadow map only needs one pass.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);

  // ---- world -------------------------------------------------------------
  const world = buildWorld();
  window.__cake.counts = world.counts;

  const occupiedSet = new Set([
    ...world.solid.keys(),
    ...world.cake.keys(),
    ...world.flame.keys(),
  ]);
  const occupied = (x, y, z) => occupiedSet.has(`${x}|${y}|${z}`);

  const solidGeo = buildVoxelGeometry(world.solid, occupied, world.palette);
  const cakeGeo = buildVoxelGeometry(world.cake, occupied, world.palette);
  const flameGeo = buildVoxelGeometry(world.flame, occupied, world.palette);

  const solidMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  const cakeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.03,
  });
  // unlit + un-tonemapped: the tips stay the brightest thing on screen
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc04d, toneMapped: false });

  const solidMesh = new THREE.Mesh(solidGeo, solidMat);
  solidMesh.receiveShadow = true;
  solidMesh.castShadow = false;

  const cakeMesh = new THREE.Mesh(cakeGeo, cakeMat);
  cakeMesh.receiveShadow = true;
  cakeMesh.castShadow = true;

  flameMesh = new THREE.Mesh(flameGeo, flameMat);
  flameMesh.castShadow = false;
  flameMesh.receiveShadow = false;

  scene.add(solidMesh, cakeMesh, flameMesh);

  // ---- light -------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0xb5b6c6, 1.08);
  scene.add(ambient);

  light = new THREE.PointLight(0xffcb98, 20, 140, 1.05);
  light.position.set(0, 23.6, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 60;
  light.shadow.bias = -0.0018;
  light.shadow.normalBias = 0.035;
  light.shadow.radius = 2.2;
  scene.add(light);
  baseLightIntensity = light.intensity;

  // ---- camera fit --------------------------------------------------------
  cameraFit = computeCameraFit();

  // ---- context loss ------------------------------------------------------
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFallback('lost');
  }, false);

  // ---- input -------------------------------------------------------------
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', (e) => {
    if (dragging && e.buttons === 0) onPointerUp(e);
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  updateCamera(azimuth);
  renderOnce();

  document.body.classList.add('is-ready');
  if (ui) ui.classList.add('is-shown');
  window.__cake.ready = true;

  // the cake waits for the third letter before it starts turning
  const intro = window.__intro;
  if (intro && !intro.done) {
    intro.onDone = () => {
      autoSpin = !reduceMotion;
      lastTime = 0;
      startLoop();
      startMusic();
    };
  } else {
    if (autoSpin) startLoop();
    // no letters (already dismissed): start on the first gesture
    const kick = () => startMusic();
    document.addEventListener('pointerdown', kick, { once: true, passive: true });
    document.addEventListener('keydown', kick, { once: true });
  }
}

let cameraFit = { maxX: 20, maxY: 20 };

function placeCamera(cam, az) {
  const horizontal = CAM_DISTANCE * Math.cos(ELEVATION);
  cam.position.set(
    TARGET.x + horizontal * Math.sin(az),
    TARGET.y + CAM_DISTANCE * Math.sin(ELEVATION),
    TARGET.z + horizontal * Math.cos(az),
  );
  cam.lookAt(TARGET);
}

// Worst-case projected extents over a full turn, so the framing never breathes.
function computeCameraFit() {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);
  const v = new THREE.Vector3();
  let maxX = 0;
  let maxY = 0;
  const xs = [-19.5, 19.5];
  const zs = [-19.5, 19.5];
  const ys = [0, 27];
  for (let i = 0; i < 24; i++) {
    placeCamera(cam, (i / 24) * Math.PI * 2);
    cam.updateMatrixWorld(true);
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
          maxX = Math.max(maxX, Math.abs(v.x));
          maxY = Math.max(maxY, Math.abs(v.y));
        }
      }
    }
  }
  return { maxX: maxX * 1.04, maxY: maxY * 1.04 };
}

function updateCamera(az) {
  placeCamera(camera, az);
  camera.updateMatrixWorld(true);
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  stats.dpr = dpr;

  const aspect = w / h;
  let halfW = cameraFit.maxX;
  let halfH = cameraFit.maxY;
  if (aspect >= halfW / halfH) halfW = halfH * aspect;
  else halfH = halfW / aspect;

  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();

  updateCamera(azimuth);
  renderOnce();
}

// --------------------------------------------------------------------------
// interaction
// --------------------------------------------------------------------------
function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  dragging = true;
  autoSpin = false;
  lastPointerX = event.clientX;
  pointerDownX = event.clientX;
  pointerDownY = event.clientY;
  pointerDownAt = performance.now();
  pointerMoved = false;
  canvas.setPointerCapture?.(event.pointerId);
  clearTimeout(resumeTimer);
  stopLoop();
  document.body.classList.add('is-dragging');
}

function onPointerMove(event) {
  if (!dragging) return;
  const dx = event.clientX - lastPointerX;
  lastPointerX = event.clientX;
  if (Math.abs(event.clientX - pointerDownX) + Math.abs(event.clientY - pointerDownY) > 12) {
    pointerMoved = true;
  }
  azimuth -= dx * DRAG_SENSITIVITY;
  updateCamera(azimuth);
  renderOnce();
}

function onPointerUp(event) {
  if (!dragging) return;
  dragging = false;
  document.body.classList.remove('is-dragging');
  canvas.releasePointerCapture?.(event.pointerId);

  // a tap (not a drag) blows on the candles, or lights them again
  if (event.type === 'pointerup' && !pointerMoved && performance.now() - pointerDownAt < 600) {
    tapCake();
  }

  if (ritual !== 'lit' || reduceMotion) return;
  clearTimeout(resumeTimer);
  resumeTimer = window.setTimeout(() => {
    autoSpin = true;
    startLoop();
  }, RESUME_MS);
}

// --------------------------------------------------------------------------
// the ritual: blow out the candles, then let them come back
// --------------------------------------------------------------------------
function tapCake() {
  if (!window.__intro?.done) return;
  if (ritual === 'lit') blowOut();
  else if (ritual === 'dark') relight();
}

function blowOut() {
  if (ritual !== 'lit' || !flameMesh || !window.__intro?.done) return;
  ritual = 'dark';
  ritualBusy = true;
  autoSpin = false;
  clearTimeout(resumeTimer);

  flameMesh.visible = false;
  lightTarget = 0;
  document.body.classList.add('is-dark');

  if (statusEl) statusEl.textContent = '愿望已经出发。';
  if (ritualBtn) {
    ritualBtn.disabled = false;
    ritualBtn.textContent = '重新点亮';
  }

  startLoop();
  clearTimeout(relightTimer);
  relightTimer = window.setTimeout(relight, 2800);
}

function relight() {
  if (ritual !== 'dark' || !flameMesh) return;
  ritual = 'relighting';
  clearTimeout(relightTimer);

  flameMesh.visible = true;
  lightTarget = 1.6;
  document.body.classList.remove('is-dark');

  if (statusEl) statusEl.textContent = '重新点亮。';
  if (ritualBtn) {
    ritualBtn.disabled = true;
    ritualBtn.textContent = '正在点亮…';
  }

  window.setTimeout(() => {
    lightTarget = 1;
  }, 280);

  window.setTimeout(() => {
    ritual = 'lit';
    ritualBusy = false;
    if (!reduceMotion) {
      autoSpin = true;
      lastTime = 0;
    }
    if (statusEl) statusEl.innerHTML = BLESSING_HTML;
    if (ritualBtn) {
      ritualBtn.disabled = false;
      ritualBtn.textContent = '吹灭蜡烛';
    }
    startLoop();
  }, 2200);
}

// --------------------------------------------------------------------------
// music
// --------------------------------------------------------------------------
function startMusic() {
  if (musicStarted) return;
  musicStarted = music.start();
  updateMusicButton();
}

function updateMusicButton() {
  if (!musicBtn) return;
  const playing = musicStarted && !music.muted;
  musicBtn.setAttribute('aria-pressed', String(playing));
  document.body.classList.toggle('is-muted', !playing);
}

ritualBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (ritual === 'lit') blowOut();
  else if (ritual === 'dark') relight();
});

musicBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (!musicStarted) {
    startMusic();
    return;
  }
  music.toggle();
  updateMusicButton();
});

function onVisibility() {
  if (document.hidden) {
    stopLoop();
  } else if (autoSpin) {
    lastTime = 0;
    startLoop();
  }
}

// --------------------------------------------------------------------------
// render loop — RAF only runs while something is actually moving
// --------------------------------------------------------------------------
function startLoop() {
  if (rafId || document.hidden) return;
  lastTime = 0;
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function tick(now) {
  rafId = 0;
  if (document.hidden) return;

  const dt = lastTime ? clamp((now - lastTime) / 1000, 0, 0.05) : 1 / 60;
  lastTime = now;

  if (autoSpin && !dragging) azimuth += SPIN * dt;

  if (light) {
    let wobble = 1;
    if (!reduceMotion) {
      const t = now / 1000;
      wobble =
        1 +
        0.045 * Math.sin(t * 0.71) +
        0.028 * Math.sin(t * 1.93 + 1.7) +
        0.016 * Math.sin(t * 4.1 + 0.4);
    }
    // lightTarget drives the blow-out / relight; the wobble rides on top of it
    lightScale += (lightTarget - lightScale) * Math.min(1, dt * 9);
    light.intensity = baseLightIntensity * lightScale * wobble;
  }

  updateCamera(azimuth);
  renderFrame(dt * 1000);

  if (autoSpin || dragging || ritualBusy) rafId = requestAnimationFrame(tick);
}

function renderOnce() {
  if (rafId) return;
  renderFrame(0);
}

function renderFrame(dtMs) {
  renderer.render(scene, camera);
  const info = renderer.info.render;
  stats.drawcalls = info.calls;
  stats.triangles = info.triangles;

  if (dtMs > 0) {
    frameTimes.push(dtMs);
    if (frameTimes.length > 90) frameTimes.shift();
    if (frameTimes.length >= 10) {
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      stats.avgFrameMs = Math.round(avg * 100) / 100;
      stats.fps = Math.round((1000 / avg) * 10) / 10;
    }
  }
}

// --------------------------------------------------------------------------
// go
// --------------------------------------------------------------------------
boot();
