import { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { clusterColorRgb } from '../../lib/clusterColor';
import { useColorMode } from '../../hooks/useColorMode';

CameraControls.install({ THREE });

// Chrome colors live in the token layer; the WebGL clear color is read at
// build time and the scene rebuilds when the color mode flips (CrosshairPlot
// pattern). Point palettes themselves are data-driven and stay in JS.
const readToken = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------------------------------------------------------------------------
// Soft-splat billboard shader, ported/adapted from latent-renders pointset.js:
// FOV-correct size attenuation with min/max pixel clamps, energy-preserving
// alpha on the min side, and a soft round footprint. Per-instance color comes
// straight from the cluster palette (clusterColorRgb) so the 3D view matches the
// 2D map's cluster hues. Hover pops size + brightness; a selected cluster dims
// everyone else to alpha ~0.15.
// ---------------------------------------------------------------------------
const VERT = /* glsl */ `
precision highp float;
attribute vec2 corner;
attribute vec3 iPos;
attribute vec3 iColor;
attribute float iId;
attribute float iCluster;
uniform vec2 uViewport;
uniform float uPointScale;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uHoverId;
uniform float uSelCluster;
uniform float uHasSel;
uniform float uDimAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = corner;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float projScale = 0.5 * uViewport.y * projectionMatrix[1][1];
  float rad = uPointScale;
  bool hovered = abs(iId - uHoverId) < 0.5;
  if (hovered) rad *= 2.2;                       // size pop on hover
  float sizePx = rad * projScale / max(-mv.z, 1e-4);
  float clampedPx = clamp(sizePx, uMinPx, uMaxPx);
  float ref = max(sizePx, uMinPx);
  vAlpha = (sizePx * sizePx) / (ref * ref);      // energy preservation (min side)

  vec3 col = iColor;
  if (hovered) col = mix(col, vec3(1.0), 0.55);  // brightness pop on hover
  vColor = col;

  // Selected-cluster focus: non-matching points fade back.
  if (uHasSel > 0.5 && !hovered) {
    if (abs(iCluster - uSelCluster) > 0.5) vAlpha *= uDimAlpha;
  }

  vec4 clip = projectionMatrix * mv;
  vec2 px = corner * clampedPx * 0.5;
  clip.xy += (px / uViewport) * 2.0 * clip.w;
  gl_Position = clip;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float core = smoothstep(1.0, 0.2, r2);         // soft round falloff
  if (core <= 0.02) discard;
  float shade = 0.6 + 0.4 * core;                // subtle volume
  float a = vAlpha * core;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * shade, a);
}`;

// Pick shader: same geometry/sizing, outputs the 24-bit id in RGB (A=1 marks a
// hit). Mirrors picking.js — a full-buffer render + single-pixel readback,
// robust on the ANGLE/Metal backend (the setViewOffset trick is broken there).
const PICK_VERT = /* glsl */ `
precision highp float;
attribute vec2 corner;
attribute vec3 iPos;
attribute float iId;
uniform vec2 uViewport;
uniform float uPointScale;
uniform float uMinPx;
uniform float uMaxPx;
varying vec2 vUv;
varying float vId;
void main() {
  vUv = corner;
  vId = iId;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float projScale = 0.5 * uViewport.y * projectionMatrix[1][1];
  float sizePx = uPointScale * projScale / max(-mv.z, 1e-4);
  float clampedPx = clamp(sizePx, max(uMinPx, 4.0), uMaxPx);
  vec4 clip = projectionMatrix * mv;
  vec2 px = corner * clampedPx * 0.5;
  clip.xy += (px / uViewport) * 2.0 * clip.w;
  gl_Position = clip;
}`;

const PICK_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vId;
void main() {
  if (dot(vUv, vUv) > 1.0) discard;
  float id = vId;
  float r = mod(id, 256.0);
  float g = mod(floor(id / 256.0), 256.0);
  float b = mod(floor(id / 65536.0), 256.0);
  gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
}`;

// Resolve the [r,g,b] (0..1) for a point: a color-by hue when one is supplied
// (mirrors the 2D map exactly — same useColorBy palette), otherwise the shared
// cluster palette (clusterColorRgb). A null entry inside pointColors means the
// point has a missing/out-of-range value for the active color-by column, which
// we render as a neutral gray so it reads as "no value" rather than vanishing.
const GRAY = [0.6, 0.63, 0.65];
function resolvePointColor(pointColors, i, cluster, numClusters) {
  if (pointColors) {
    const c = pointColors[i];
    return c || GRAY;
  }
  return clusterColorRgb(cluster, numClusters);
}

function Scatter3D({
  scopeRows,
  width,
  height,
  clusterLabels,
  selectedCluster, // clusterFilter.cluster object (or null)
  hoveredIndex,
  onHover,
  onSelect,
  pointScale = 1,
  // Per-point [r,g,b] (0..1) color-by triples aligned to scopeRows order, or
  // null when Color By is off (falls back to the cluster palette). Mirrors the
  // 2D scatter's `pointColors` so the 3D view respects Color By identically.
  pointColors = null,
  // Lightweight preview mode (Setup): points + orbit only — no picking, no
  // hover/select wiring, no tooltip fetch. Used by the umap preview panel.
  lightweight = false,
}) {
  // useColorMode re-renders on theme flips, which re-reads the chrome tokens.
  useColorMode();
  const mountRef = useRef(null);
  const stateRef = useRef(null); // holds three.js objects across renders
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  onHoverRef.current = onHover;
  onSelectRef.current = onSelect;
  // Keep the latest color-by array reachable from the build closure + the
  // recolor effect without forcing a full scene rebuild on every change.
  const pointColorsRef = useRef(pointColors);
  pointColorsRef.current = pointColors;
  // Coarse-pointer (touch) devices: bigger minimum point size + tap-to-select
  // instead of hover, and touch-friendly camera-controls gestures.
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches,
    []
  );
  // Bumped whenever the scene is (re)built so the hover/size/selection effects
  // re-apply their uniforms onto the fresh material (rebuild resets uniforms).
  const [sceneVersion, setSceneVersion] = useState(0);

  const numClusters = useMemo(() => {
    let max = 0;
    for (const r of scopeRows || []) if (r.cluster > max) max = r.cluster;
    return Math.max(max + 1, clusterLabels?.length || 0, 1);
  }, [scopeRows, clusterLabels]);

  // Map surface token (the darkest surface in dark mode). A primitive string,
  // so the build effect below only re-runs when the theme actually changes.
  const bg = readToken('--ls-surface-map');

  // Build the scene once (renderer, camera, controls, mesh). Rebuilds when the
  // point data or canvas size changes.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !scopeRows?.length || !width || !height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.setClearColor(bg, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = width + 'px';
    renderer.domElement.style.height = height + 'px';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);

    const controls = new CameraControls(camera, renderer.domElement);
    controls.dollyToCursor = true;
    controls.dampingFactor = 0.06;
    controls.draggingDampingFactor = 0.12;
    controls.minDistance = 0.05;
    controls.maxDistance = 40;
    // Right-drag -> truck (pan). Wheel -> dolly to cursor.
    controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    // Touch gestures: one finger orbits, two fingers pinch-zoom + pan together.
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;

    // --- build instanced billboard mesh (skip deleted points) ---
    const N = scopeRows.length;
    const geom = new THREE.InstancedBufferGeometry();
    const corners = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
    geom.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    geom.setIndex([0, 1, 2, 0, 2, 3]);

    const posArr = new Float32Array(N * 3);
    const colArr = new Float32Array(N * 3);
    const idArr = new Float32Array(N);
    const cluArr = new Float32Array(N);
    let m = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < N; i++) {
      const r = scopeRows[i];
      if (r.deleted) continue; // deleted points hidden
      const x = r.x;
      const y = r.y;
      const z = r.z ?? 0;
      posArr[m * 3] = x;
      posArr[m * 3 + 1] = y;
      posArr[m * 3 + 2] = z;
      idArr[m] = i; // scopeRows position -> matches the existing hover flow
      cluArr[m] = r.cluster;
      const pc = resolvePointColor(pointColorsRef.current, i, r.cluster, numClusters);
      colArr[m * 3] = pc[0];
      colArr[m * 3 + 1] = pc[1];
      colArr[m * 3 + 2] = pc[2];
      cx += x;
      cy += y;
      cz += z;
      m++;
    }
    geom.instanceCount = m;
    geom.setAttribute('iPos', new THREE.InstancedBufferAttribute(posArr.subarray(0, m * 3), 3));
    geom.setAttribute('iColor', new THREE.InstancedBufferAttribute(colArr.subarray(0, m * 3), 3));
    geom.setAttribute('iId', new THREE.InstancedBufferAttribute(idArr.subarray(0, m), 1));
    geom.setAttribute('iCluster', new THREE.InstancedBufferAttribute(cluArr.subarray(0, m), 1));
    geom.frustumCulled = false;

    // world radius: ~pixel size mapped to a small world unit (points attenuate).
    const worldScale = 0.02;
    const uniforms = {
      uViewport: { value: new THREE.Vector2(width * dpr, height * dpr) },
      uPointScale: { value: pointScale * 2.2 * worldScale },
      // Bigger floor on touch screens so 100k points stay legible / tappable.
      uMinPx: { value: isTouch ? 3.0 : 1.5 },
      uMaxPx: { value: 42.0 },
      uHoverId: { value: -1 },
      uSelCluster: { value: -999 },
      uHasSel: { value: 0 },
      uDimAlpha: { value: 0.15 },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      blending: THREE.NormalBlending,
    });
    const pickMaterial = new THREE.ShaderMaterial({
      vertexShader: PICK_VERT,
      fragmentShader: PICK_FRAG,
      uniforms: {
        uViewport: uniforms.uViewport,
        uPointScale: uniforms.uPointScale,
        uMinPx: uniforms.uMinPx,
        uMaxPx: uniforms.uMaxPx,
      },
      transparent: false,
      depthTest: true,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(geom, material);
    mesh.frustumCulled = false;
    scene.add(mesh);

    // frame the populated cloud (centroid + rms spread — robust to outliers).
    cx /= m;
    cy /= m;
    cz /= m;
    let ss = 0;
    for (let k = 0; k < m; k++) {
      const dx = posArr[k * 3] - cx;
      const dy = posArr[k * 3 + 1] - cy;
      const dz = posArr[k * 3 + 2] - cz;
      ss += dx * dx + dy * dy + dz * dz;
    }
    const radius = Math.max(0.3, Math.sqrt(ss / m) * 2.2);
    const center = new THREE.Vector3(cx, cy, cz);
    const d = radius * 2.4;
    // The preview uses a more oblique 3/4 angle so the depth reads as 3D at a
    // glance (the Explore view starts closer to head-on for a familiar map).
    if (lightweight) {
      controls.setLookAt(cx + d * 0.9, cy + d * 0.55, cz + d * 0.7, cx, cy, cz, false);
    } else {
      controls.setLookAt(cx + d * 0.4, cy + d * 0.3, cz + d, cx, cy, cz, false);
    }

    // --- picking (full-buffer render + 1px readback) ---
    const pickTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(width * dpr)),
      Math.max(1, Math.floor(height * dpr)),
      { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }
    );
    const pixel = new Uint8Array(4);
    const pick = (sx, sy) => {
      const W = pickTarget.width;
      const H = pickTarget.height;
      const fx = Math.max(0, Math.min(W - 1, Math.floor(sx * dpr)));
      const fy = Math.max(0, Math.min(H - 1, Math.floor((height - sy) * dpr)));
      mesh.material = pickMaterial;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(pickTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(pickTarget, fx, fy, 1, 1, pixel);
      renderer.setRenderTarget(prev);
      renderer.setClearColor(bg, 1);
      mesh.material = material;
      if (pixel[3] === 0) return -1;
      return pixel[0] + pixel[1] * 256 + pixel[2] * 65536;
    };

    const st = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      material,
      pickMaterial,
      uniforms,
      pickTarget,
      pick,
      center,
      radius,
      dpr,
      raf: 0,
      clock: new THREE.Clock(),
      // recolor-in-place handles (Color By live updates without a rebuild)
      colorAttr: geom.getAttribute('iColor'),
      idAttr: geom.getAttribute('iId'),
      cluAttr: geom.getAttribute('iCluster'),
      count: m,
      numClusters,
    };
    stateRef.current = st;

    // --- interaction ---
    // Preview (lightweight) mode is orbit-only: no picking, hover, or select.
    const dom = renderer.domElement;
    if (!lightweight) {
    let pendingPick = null;
    let rafPick = 0;
    const doPick = () => {
      rafPick = 0;
      if (!pendingPick) return;
      const { x, y } = pendingPick;
      const id = pick(x, y);
      onHoverRef.current && onHoverRef.current(id === -1 ? null : id);
    };
    const onMove = (e) => {
      const rect = dom.getBoundingClientRect();
      pendingPick = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!rafPick) rafPick = requestAnimationFrame(doPick);
    };
    const onLeave = () => {
      pendingPick = null;
      onHoverRef.current && onHoverRef.current(null);
    };
    const onClick = (e) => {
      const rect = dom.getBoundingClientRect();
      const id = pick(e.clientX - rect.left, e.clientY - rect.top);
      onSelectRef.current && onSelectRef.current(id === -1 ? [] : [id]);
    };
    const onDblClick = (e) => {
      const rect = dom.getBoundingClientRect();
      const id = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (id === -1) return;
      const r = scopeRows[id];
      if (!r) return;
      // fly the orbit target to the point (smooth) and dolly a touch closer.
      controls.moveTo(r.x, r.y, r.z ?? 0, true);
      controls.dolly(radius * 0.5, true);
    };
    // Touch devices don't hover — a tap selects (opening the detail drawer),
    // so we skip the pick-on-move listener there but keep click/dblclick.
    if (!isTouch) dom.addEventListener('mousemove', onMove);
    dom.addEventListener('mouseleave', onLeave);
    dom.addEventListener('click', onClick);
    dom.addEventListener('dblclick', onDblClick);
    st.cleanupInteraction = () => {
      if (rafPick) cancelAnimationFrame(rafPick);
      dom.removeEventListener('mousemove', onMove);
      dom.removeEventListener('mouseleave', onLeave);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('dblclick', onDblClick);
    };
    }

    const animate = () => {
      st.raf = requestAnimationFrame(animate);
      const dt = st.clock.getDelta();
      controls.update(dt);
      renderer.render(scene, camera);
    };
    animate();
    setSceneVersion((v) => v + 1); // let dependent effects re-apply uniforms

    return () => {
      cancelAnimationFrame(st.raf);
      st.cleanupInteraction?.();
      controls.dispose();
      geom.dispose();
      material.dispose();
      pickMaterial.dispose();
      pickTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeRows, width, height, numClusters, bg]);

  // hover highlight (uniform update, no rebuild)
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.uniforms.uHoverId.value = hoveredIndex === null || hoveredIndex === undefined ? -1 : hoveredIndex;
  }, [hoveredIndex, sceneVersion]);

  // point size (uniform update)
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.uniforms.uPointScale.value = pointScale * 2.2 * 0.02;
  }, [pointScale, sceneVersion]);

  // Color By live update: rewrite the per-instance color buffer in place (no
  // scene rebuild) so switching the Color By column recolors instantly and
  // mirrors the 2D map. When pointColors is null we fall back to the cluster
  // palette, so "None (selection)" restores the default cluster hues.
  useEffect(() => {
    const st = stateRef.current;
    if (!st || !st.colorAttr) return;
    const col = st.colorAttr.array;
    const ids = st.idAttr.array;
    const clus = st.cluAttr.array;
    for (let k = 0; k < st.count; k++) {
      const i = ids[k];
      const c = resolvePointColor(pointColors, i, clus[k], st.numClusters);
      col[k * 3] = c[0];
      col[k * 3 + 1] = c[1];
      col[k * 3 + 2] = c[2];
    }
    st.colorAttr.needsUpdate = true;
  }, [pointColors, sceneVersion]);

  // Selected-cluster focus: dim non-members + fit the camera to the cluster bbox.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    const cid = selectedCluster?.cluster;
    if (cid === null || cid === undefined) {
      st.uniforms.uHasSel.value = 0;
      st.uniforms.uSelCluster.value = -999;
      // ease back out to the whole-cloud framing
      const { center: c, radius: rad } = st;
      const d = rad * 2.4;
      st.controls.setLookAt(c.x + d * 0.4, c.y + d * 0.3, c.z + d, c.x, c.y, c.z, true);
      return;
    }
    st.uniforms.uHasSel.value = 1;
    st.uniforms.uSelCluster.value = cid;
    // compute 3D bbox of the cluster's (non-deleted) points
    const box = new THREE.Box3();
    box.makeEmpty();
    const v = new THREE.Vector3();
    let n = 0;
    for (const r of scopeRows) {
      if (r.deleted || r.cluster !== cid) continue;
      box.expandByPoint(v.set(r.x, r.y, r.z ?? 0));
      n++;
    }
    if (n > 0) {
      // pad a little so the cluster fills the view without touching the edges
      const size = new THREE.Vector3();
      box.getSize(size);
      const pad = Math.max(size.length() * 0.12, 0.05);
      box.expandByScalar(pad);
      st.controls.fitToBox(box, true, { paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 });
    }
  }, [selectedCluster, scopeRows, sceneVersion]);

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, width, height }} />;
}

export default Scatter3D;
