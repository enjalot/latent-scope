import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { Button } from 'react-element-forge';
import { clusterColorHex } from '../../lib/clusterColor';
import { useColorMode } from '../../hooks/useColorMode';
import { useCellMembers } from '../../hooks/useCellMembers';
import MembersTooltip from './MembersTooltip';
import { Readout } from '../ui';
import styles from './VoxelView.module.scss';

CameraControls.install({ THREE });

// Chrome colors live in the token layer; the WebGL clear color is read at
// build time and the scene rebuilds when the color mode flips (CrosshairPlot
// pattern). Voxel/point colors themselves are data-driven and stay in JS.
const readToken = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Scale a color's luminance by cell density so denser cells glow brighter,
// keeping a floor so sparse cells still read on a dark bg.
const _c = new THREE.Color();
const _hsl = {};
function shadeByDensity(color, density) {
  color.getHSL(_hsl);
  const l = 0.32 + 0.36 * density; // density 0..1 -> lightness 0.32..0.68
  color.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.05), l);
  return color;
}
function voxelColor(hex, density) {
  _c.set(hex);
  return shadeByDensity(_c, density).clone();
}

function VoxelView({ scopeRows, width, height, scope, clusterLabels, pointColors = null, onCellSelect }) {
  // useColorMode re-renders on theme flips, which re-reads the chrome tokens.
  const { isDark } = useColorMode();
  const [resolution, setResolution] = useState(64); // voxel_index_64 default
  const [sliceT, setSliceT] = useState(0.5); // 0..1 depth along the FIXED view axis
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const sliceTRef = useRef(0.5);
  sliceTRef.current = sliceT;
  const [tooltipPos, setTooltipPos] = useState(null); // {x, y} viewport
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches,
    []
  );

  const column = `voxel_index_${resolution}`;
  const cellKeyOf = useCallback((row) => row[column], [column]);
  const { setActiveCell, active, snippets, loadingSnippets, membership } = useCellMembers({
    scopeRows,
    scope,
    cellKeyOf,
  });

  const numClusters = useMemo(() => {
    let max = 0;
    for (const r of scopeRows || []) if (r.cluster > max) max = r.cluster;
    return Math.max(max + 1, clusterLabels?.length || 0, 1);
  }, [scopeRows, clusterLabels]);

  // Aggregate populated voxels: count + dominant cluster per cell.
  const cells = useMemo(() => {
    const n = resolution;
    const agg = new Map(); // idx -> { count, clusterCounts: Map }
    for (const r of scopeRows || []) {
      if (r.deleted) continue;
      const idx = r[column];
      if (idx === null || idx === undefined) continue;
      let a = agg.get(idx);
      if (!a) {
        a = { idx, count: 0, cc: new Map() };
        agg.set(idx, a);
      }
      a.count++;
      a.cc.set(r.cluster, (a.cc.get(r.cluster) || 0) + 1);
    }
    let maxCount = 1;
    const out = [];
    for (const a of agg.values()) {
      if (a.count > maxCount) maxCount = a.count;
    }
    for (const a of agg.values()) {
      let dom = -1;
      let dn = -1;
      for (const [c, k] of a.cc) if (k > dn) { dn = k; dom = c; }
      const xb = a.idx % n;
      const yb = Math.floor(a.idx / n) % n;
      const zb = Math.floor(a.idx / (n * n));
      const s = 2 / n;
      out.push({
        idx: a.idx,
        count: a.count,
        cluster: dom,
        x: (xb + 0.5) * s - 1,
        y: (yb + 0.5) * s - 1,
        z: (zb + 0.5) * s - 1,
        density: Math.log(1 + a.count) / Math.log(1 + maxCount),
      });
    }
    return out;
  }, [scopeRows, column, resolution]);

  // Per-cell color. With Color By active, average the member point hues (same
  // useColorBy palette as the 2D map + 3D scatter) and shade by density; with
  // Color By off, fall back to the dominant-cluster palette. Recomputed on
  // colorby change without rebuilding the mesh.
  const cellColors = useMemo(() => {
    return cells.map((c) => {
      if (pointColors) {
        const mem = membership.get(c.idx) || [];
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const i of mem) {
          const pc = pointColors[i];
          if (pc) {
            r += pc[0];
            g += pc[1];
            b += pc[2];
            n++;
          }
        }
        const base = n
          ? new THREE.Color(r / n, g / n, b / n)
          : new THREE.Color(0.6, 0.63, 0.65);
        return shadeByDensity(base, c.density).clone();
      }
      return voxelColor(clusterColorHex(c.cluster, numClusters), c.density);
    });
  }, [cells, pointColors, membership, numClusters]);

  // Keep the latest cell colors reachable from the build closure + recolor.
  const cellColorsRef = useRef(cellColors);
  cellColorsRef.current = cellColors;

  // Map surface token (the darkest surface in dark mode). A primitive string,
  // so the build effect below only re-runs when the theme actually changes.
  const bg = readToken('--ls-surface-map');

  // Build the scene (renderer, lights, instanced cubes, camera, controls).
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !cells.length || !width || !height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.setClearColor(bg, 1);
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);

    // lighting: key + cool fill/rim so cube faces sculpt into a data-terrain.
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x141820, isDark ? 0.9 : 1.1));
    const keyL = new THREE.DirectionalLight(0xfff2e0, 2.0);
    keyL.position.set(1.4, 2.2, 1.1);
    scene.add(keyL);
    const rimL = new THREE.DirectionalLight(0x4a6cff, 0.7);
    rimL.position.set(-1.5, 0.6, -1.2);
    scene.add(rimL);
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.28 : 0.5));

    const n = resolution;
    const s = 2 / n;
    const geo = new THREE.BoxGeometry(s * 0.92, s * 0.92, s * 0.92);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.0 });
    mat.transparent = true;

    // Slice-plane fade injected via onBeforeCompile: per-instance center ->
    // signed distance to the plane; |d| < half-voxel = full opacity, else fade.
    const uPlaneNormal = { value: new THREE.Vector3(0, 0, 1) };
    const uPlaneConstant = { value: 0 };
    const uHalfVoxel = { value: s * 0.75 };
    const uFadeAlpha = { value: 0.06 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPlaneNormal = uPlaneNormal;
      shader.uniforms.uPlaneConstant = uPlaneConstant;
      shader.uniforms.uHalfVoxel = uHalfVoxel;
      shader.uniforms.uFadeAlpha = uFadeAlpha;
      shader.vertexShader =
        'attribute vec3 instanceCenter;\nuniform vec3 uPlaneNormal;\nuniform float uPlaneConstant;\nuniform float uHalfVoxel;\nuniform float uFadeAlpha;\nvarying float vSliceFade;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nfloat sd = dot(uPlaneNormal, instanceCenter) - uPlaneConstant;\nvSliceFade = abs(sd) <= uHalfVoxel ? 1.0 : uFadeAlpha;'
        );
      shader.fragmentShader =
        'varying float vSliceFade;\n' +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\ngl_FragColor.a *= vSliceFade;'
        );
    };

    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const centerArr = new Float32Array(cells.length * 3);
    const mm = new THREE.Matrix4();
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const baseColors = [];
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      mm.makeTranslation(c.x, c.y, c.z);
      mesh.setMatrixAt(k, mm);
      const col = (cellColorsRef.current[k] || voxelColor('#9aa0a6', c.density)).clone();
      baseColors.push(col);
      mesh.setColorAt(k, col);
      centerArr[k * 3] = c.x;
      centerArr[k * 3 + 1] = c.y;
      centerArr[k * 3 + 2] = c.z;
      cx += c.x;
      cy += c.y;
      cz += c.z;
    }
    geo.setAttribute('instanceCenter', new THREE.InstancedBufferAttribute(centerArr, 3));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    // frame populated extent (centroid + rms spread)
    const M = cells.length;
    cx /= M;
    cy /= M;
    cz /= M;
    let ss = 0;
    for (let k = 0; k < M; k++) {
      const dx = centerArr[k * 3] - cx;
      const dy = centerArr[k * 3 + 1] - cy;
      const dz = centerArr[k * 3 + 2] - cz;
      ss += dx * dx + dy * dy + dz * dz;
    }
    const radius = Math.max(0.3, Math.sqrt(ss / M) * 1.9);

    const controls = new CameraControls(camera, renderer.domElement);
    controls.dollyToCursor = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.05;
    controls.maxDistance = 40;
    controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    // Touch gestures: one finger orbits, two fingers pinch-zoom + pan.
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;
    const d = radius * 2.3;
    controls.setLookAt(cx + d * 0.5, cy + d * 0.35, cz + d, cx, cy, cz, false);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    // FIXED slice-plane derivation. The plane normal is derived ONCE from the
    // current camera view direction and then held constant while orbiting, so
    // the slice stays the static 2D plane of the initial view (not the moving
    // camera). "Align to view" re-derives it on demand.
    const planeNormal = new THREE.Vector3();
    let projMin = -1;
    let projMax = 1;
    const signed = new Float32Array(cells.length); // signed dist per cell (hover gating)
    const applySlice = (t) => {
      const cst = projMin + (projMax - projMin) * t;
      uPlaneConstant.value = cst;
      for (let k = 0; k < M; k++) {
        signed[k] =
          planeNormal.x * centerArr[k * 3] +
          planeNormal.y * centerArr[k * 3 + 1] +
          planeNormal.z * centerArr[k * 3 + 2] -
          cst;
      }
    };
    const recomputePlaneAxis = () => {
      camera.updateMatrixWorld(true);
      camera.getWorldDirection(planeNormal); // points away from camera into scene
      planeNormal.negate().normalize(); // normal toward camera
      uPlaneNormal.value.copy(planeNormal);
      projMin = Infinity;
      projMax = -Infinity;
      for (let k = 0; k < M; k++) {
        const p =
          planeNormal.x * centerArr[k * 3] +
          planeNormal.y * centerArr[k * 3 + 1] +
          planeNormal.z * centerArr[k * 3 + 2];
        if (p < projMin) projMin = p;
        if (p > projMax) projMax = p;
      }
      applySlice(st.sliceT);
    };

    const st = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      baseColors,
      signed,
      raycaster,
      ndc,
      recomputePlaneAxis,
      applySlice,
      uHalfVoxel,
      sliceT: sliceTRef.current,
      hovered: -1,
      raf: 0,
      clock: new THREE.Clock(),
      dpr,
    };
    stateRef.current = st;
    // Apply the initial lookAt immediately so the plane is derived from the
    // real starting view (not the camera's pre-update default orientation),
    // then freeze that plane. NO controlend re-derivation — orbiting keeps it.
    controls.update(0);
    recomputePlaneAxis();

    const animate = () => {
      st.raf = requestAnimationFrame(animate);
      controls.update(st.clock.getDelta());
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(st.raf);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, width, height, numClusters, bg, resolution]);

  // Color By live update: recolor instances in place (no rebuild).
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    for (let k = 0; k < cellColors.length && k < st.baseColors.length; k++) {
      st.baseColors[k] = cellColors[k].clone();
      if (k !== st.hovered) st.mesh.setColorAt(k, st.baseColors[k]);
    }
    if (st.hovered >= 0) {
      _c.copy(st.baseColors[st.hovered]).lerp(new THREE.Color(1, 1, 1), 0.55);
      st.mesh.setColorAt(st.hovered, _c);
    }
    if (st.mesh.instanceColor) st.mesh.instanceColor.needsUpdate = true;
  }, [cellColors]);

  // slider -> update slice constant along the FIXED normal (no rebuild)
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.sliceT = sliceT;
    st.applySlice(sliceT);
  }, [sliceT]);

  // hover (desktop) + click/tap (both): raycast instanceId; only in-plane
  // (highlighted) voxels are hoverable/selectable.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    const dom = st.renderer.domElement;
    const setHighlight = (id) => {
      if (st.hovered === id) return;
      if (st.hovered >= 0) st.mesh.setColorAt(st.hovered, st.baseColors[st.hovered]);
      if (id >= 0) {
        _c.copy(st.baseColors[id]).lerp(new THREE.Color(1, 1, 1), 0.55);
        st.mesh.setColorAt(id, _c);
      }
      if (st.mesh.instanceColor) st.mesh.instanceColor.needsUpdate = true;
      st.hovered = id;
    };
    const pickAt = (clientX, clientY) => {
      const rect = dom.getBoundingClientRect();
      st.ndc.x = ((clientX - rect.left) / width) * 2 - 1;
      st.ndc.y = -((clientY - rect.top) / height) * 2 + 1;
      st.raycaster.setFromCamera(st.ndc, st.camera);
      const hits = st.raycaster.intersectObject(st.mesh, false);
      for (const h of hits) {
        // only accept in-plane voxels (matches what's rendered at full opacity)
        if (Math.abs(st.signed[h.instanceId]) <= st.uHalfVoxel.value) return h.instanceId;
      }
      return -1;
    };
    const onMove = (e) => {
      const picked = pickAt(e.clientX, e.clientY);
      setHighlight(picked);
      if (picked >= 0) {
        setActiveCell(cells[picked].idx);
        setTooltipPos({ x: e.clientX, y: e.clientY });
      } else {
        setActiveCell(null);
        setTooltipPos(null);
      }
    };
    const onLeave = () => {
      setHighlight(-1);
      setActiveCell(null);
      setTooltipPos(null);
    };
    const onClick = (e) => {
      const picked = pickAt(e.clientX, e.clientY);
      if (picked >= 0 && onCellSelect) onCellSelect(cells[picked].idx, column);
    };
    // shift+wheel -> nudge the slice depth (intercept before camera-controls).
    const onWheel = (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setSliceT((t) => Math.min(1, Math.max(0, t + (e.deltaY > 0 ? 0.02 : -0.02))));
    };
    if (!isTouch) dom.addEventListener('mousemove', onMove);
    dom.addEventListener('mouseleave', onLeave);
    dom.addEventListener('click', onClick);
    dom.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      dom.removeEventListener('mousemove', onMove);
      dom.removeEventListener('mouseleave', onLeave);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [cells, width, height, setActiveCell, column, onCellSelect, isTouch]);

  const alignToView = useCallback(() => {
    stateRef.current?.recomputePlaneAxis();
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, width, height }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {/* slice + resolution controls. On touch/small screens the bottom is
          occupied by the data-table sheet, so the controls anchor to the top. */}
      <div
        className={`ls-panel ls-panel--floating ${styles.hud} ${
          isTouch ? styles.hudTop : styles.hudBottom
        }`}
      >
        <div className={styles.row}>
          <span className={styles.rowLabel}>Slice</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={sliceT}
            onChange={(e) => setSliceT(Number(e.target.value))}
            className={styles.slider}
            aria-label="Slice depth"
          />
          <Button
            size="small"
            variant="outline"
            color="secondary"
            text="Align"
            onClick={alignToView}
            title="Re-align the slice plane to the current view"
          />
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Res</span>
          <button
            type="button"
            className={`ls-chip ${styles.chipBtn} ${resolution === 32 ? 'ls-badge--selected' : ''}`}
            aria-pressed={resolution === 32}
            onClick={() => setResolution(32)}
          >
            32
          </button>
          <button
            type="button"
            className={`ls-chip ${styles.chipBtn} ${resolution === 64 ? 'ls-badge--selected' : ''}`}
            aria-pressed={resolution === 64}
            onClick={() => setResolution(64)}
          >
            64
          </button>
          <span className={styles.cellCount}>
            <Readout label="Cells" value={cells.length.toLocaleString()} />
          </span>
        </div>
        <div className={styles.hint}>
          {isTouch
            ? 'tap a cell for its contents'
            : 'shift + wheel to move slice · click a cell for its contents'}
        </div>
      </div>
      {!isTouch && tooltipPos && active && (
        <MembersTooltip
          x={tooltipPos.x}
          y={tooltipPos.y}
          summary={active.summary}
          snippets={snippets}
          loading={loadingSnippets}
        />
      )}
    </div>
  );
}

export default VoxelView;
