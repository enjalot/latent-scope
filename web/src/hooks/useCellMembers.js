import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { apiService } from '../lib/apiService';

// Members-in-cell tooltip engine, shared by the 2D heatmap (TilePlot) and the
// 3D voxel view. Membership is computed client-side from scopeRows (already in
// memory): a memoized Map cell -> [scopeRow positions]. Hovering a cell yields
// an INSTANT summary (count + dominant cluster label) and, after a short dwell,
// up to `maxSnippets` sampled text snippets fetched via the existing
// POST /api/query endpoint (debounced, cached per cell, cancel-on-move).
//
// `cellKeyOf(row)` maps a scope row to its cell key (row.voxel_index_64 for 3D,
// row.tile_index_64 for the 2D heatmap).

const DWELL_MS = 150;
const MAX_SNIPPETS = 6;

// Evenly sample up to n items from an array (spread across the cell rather than
// just the first n, so the preview is representative).
function sampleEven(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const stride = arr.length / n;
  for (let k = 0; k < n; k++) out.push(arr[Math.floor(k * stride)]);
  return out;
}

export function useCellMembers({ scopeRows, scope, cellKeyOf, maxSnippets = MAX_SNIPPETS }) {
  // cell key -> array of scopeRow positions (non-deleted only)
  const membership = useMemo(() => {
    const m = new Map();
    if (!scopeRows) return m;
    for (let i = 0; i < scopeRows.length; i++) {
      const row = scopeRows[i];
      if (row.deleted) continue;
      const key = cellKeyOf(row);
      if (key === null || key === undefined) continue;
      let arr = m.get(key);
      if (!arr) {
        arr = [];
        m.set(key, arr);
      }
      arr.push(i);
    }
    return m;
  }, [scopeRows, cellKeyOf]);

  // Instant, synchronous summary for a cell: total count + dominant cluster.
  const summarize = useCallback(
    (key) => {
      const idxs = membership.get(key);
      if (!idxs || !idxs.length) return null;
      const counts = new Map();
      for (const i of idxs) {
        const c = scopeRows[i].cluster;
        counts.set(c, (counts.get(c) || 0) + 1);
      }
      let dominantCluster = -1;
      let domCount = -1;
      for (const [c, n] of counts) {
        if (n > domCount) {
          domCount = n;
          dominantCluster = c;
        }
      }
      const lookup = scope?.cluster_labels_lookup || [];
      const entry = lookup[dominantCluster];
      const label = entry?.label ?? (dominantCluster >= 0 ? `Cluster ${dominantCluster}` : 'noise');
      return { count: idxs.length, dominantCluster, label };
    },
    [membership, scopeRows, scope]
  );

  const [active, setActive] = useState(null); // { key, summary }
  const [snippets, setSnippets] = useState([]); // string[]
  const [loadingSnippets, setLoadingSnippets] = useState(false);
  const cacheRef = useRef(new Map()); // key -> string[]
  const dwellTimer = useRef(null);
  const reqSeq = useRef(0);

  const clearDwell = () => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  };

  // Call on hover with a cell key, or null to clear. Summary is instant; the
  // snippet fetch fires only after DWELL_MS of dwell and is cancelled on move.
  const setActiveCell = useCallback(
    (key) => {
      clearDwell();
      if (key === null || key === undefined) {
        setActive(null);
        setSnippets([]);
        setLoadingSnippets(false);
        return;
      }
      const summary = summarize(key);
      if (!summary) {
        setActive(null);
        setSnippets([]);
        setLoadingSnippets(false);
        return;
      }
      setActive({ key, summary });

      // Warm cache hit -> render instantly, no fetch.
      if (cacheRef.current.has(key)) {
        setSnippets(cacheRef.current.get(key));
        setLoadingSnippets(false);
        return;
      }

      setSnippets([]);
      setLoadingSnippets(true);
      const seq = ++reqSeq.current;
      dwellTimer.current = setTimeout(() => {
        const idxs = membership.get(key) || [];
        const sample = sampleEven(idxs, maxSnippets).map((i) => scopeRows[i].ls_index);
        apiService
          .getSnippets(scope, sample)
          .then((texts) => {
            if (seq !== reqSeq.current) return; // superseded by a newer hover
            cacheRef.current.set(key, texts);
            setSnippets(texts);
            setLoadingSnippets(false);
          })
          .catch(() => {
            if (seq === reqSeq.current) setLoadingSnippets(false);
          });
      }, DWELL_MS);
    },
    [summarize, membership, scope, scopeRows, maxSnippets]
  );

  useEffect(() => () => clearDwell(), []);

  return { membership, summarize, setActiveCell, active, snippets, loadingSnippets };
}

export default useCellMembers;
