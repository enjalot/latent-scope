import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { extent } from 'd3-array';
import { scaleSymlog, scaleLinear } from 'd3-scale';
import { interpolateReds, interpolateViridis } from 'd3-scale-chromatic';

import CompareControls from '../components/Compare/CompareControls';
import TransitionView from '../components/Compare/TransitionView';
import SideBySideView from '../components/Compare/SideBySideView';
import CompareDataPanel from '../components/Compare/CompareDataPanel';

import styles from './Compare.module.css';

const apiUrl = import.meta.env.VITE_API_URL;

const viewModes = [
  { id: 'transition', name: 'Transition' },
  { id: 'side-by-side', name: 'Side by Side' },
];

function Compare() {
  const { dataset: datasetId } = useParams();
  const [dataset, setDataset] = useState(null);
  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);

  // UMAP selection
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);

  // Points for both sides (loaded eagerly)
  const [leftPoints, setLeftPoints] = useState([]);
  const [rightPoints, setRightPoints] = useState([]);

  // Displacement data and display points
  const [drawPoints, setDrawPoints] = useState([]);
  const [displacementLoading, setDisplacementLoading] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [aboveThresholdCount, setAboveThresholdCount] = useState(0);

  // Metric controls
  const [metric, setMetric] = useState('relative');
  const [metricK, setMetricK] = useState(10);

  // Color-by: '__drift__' (the compare metric) or a numeric column name (#131)
  const [colorBy, setColorBy] = useState('__drift__');
  const [columnData, setColumnData] = useState(null); // { values, extent }

  // Raw displacement data (before threshold) for tooltip display
  const [rawDisplacementData, setRawDisplacementData] = useState([]);

  // View mode
  const [viewMode, setViewMode] = useState('side-by-side');
  const [direction, setDirection] = useState('left');

  // Scatterplot state
  const [scatter, setScatter] = useState(null);
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);

  // Selection state
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Neighbor selection state (from SideBySideView clicks)
  const [neighborSelectedIndex, setNeighborSelectedIndex] = useState(null);
  const [neighborIndices, setNeighborIndices] = useState([]);

  // Search state
  const [searchModel, setSearchModel] = useState(null);
  const [searchIndices, setSearchIndices] = useState([]);
  const [distances, setDistances] = useState([]);

  // Layout sizing
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState([500, 500]);

  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) return;
      const { height, width } = containerRef.current.getBoundingClientRect();
      setContainerSize([width - 15, height - 25]);
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    setTimeout(updateSize, 200);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const [scopeWidth, scopeHeight] = containerSize;

  // ===== Data Loading =====

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then((r) => r.json())
      .then(setDataset);
  }, [datasetId]);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/datasets/${datasetId}/embeddings`).then((r) => r.json()),
      fetch(`${apiUrl}/datasets/${datasetId}/umaps`).then((r) => r.json()),
    ]).then(([embData, umapData]) => {
      setEmbeddings(embData);
      setUmaps(umapData);
    });
  }, [datasetId]);

  // Auto-select first two UMAPs
  useEffect(() => {
    if (umaps.length >= 2) {
      setLeft(umaps[0]);
      setRight(umaps[1]);
    } else if (umaps.length === 1) {
      setLeft(umaps[0]);
      setRight(umaps[0]);
    }
  }, [umaps]);

  // Auto-select first embedding for search
  useEffect(() => {
    if (embeddings.length) {
      setSearchModel(embeddings[0]);
    }
  }, [embeddings]);

  // Load both point sets eagerly when UMAPs are selected
  useEffect(() => {
    if (!left || !right) return;
    Promise.all([
      fetch(`${apiUrl}/datasets/${datasetId}/umaps/${left.id}/points`).then((r) => r.json()),
      fetch(`${apiUrl}/datasets/${datasetId}/umaps/${right.id}/points`).then((r) => r.json()),
    ]).then(([lp, rp]) => {
      setLeftPoints(lp.map((d) => [d.x, d.y]));
      setRightPoints(rp.map((d) => [d.x, d.y]));
    });
  }, [datasetId, left, right]);

  // ===== Displacement Computation =====

  const prevCompareKey = useRef('');

  // Always compute the drift metric — it powers the tooltip readout and is the
  // default color source. Color-by-column (#131) reuses the same [3] slot.
  useEffect(() => {
    if (!left || !right || !leftPoints.length || !rightPoints.length) return;
    const key = `${left.id}:${right.id}:${metric}:${metricK}`;
    if (prevCompareKey.current === key) return;

    setDisplacementLoading(true);
    fetch(
      `${apiUrl}/search/compare?dataset=${datasetId}&umap_left=${left.id}&umap_right=${right.id}&metric=${metric}&k=${metricK}`
    )
      .then((r) => r.json())
      .then((displacementData) => {
        setRawDisplacementData(displacementData);
        setDisplacementLoading(false);
        prevCompareKey.current = key;
      });
  }, [datasetId, left, right, leftPoints, rightPoints, metric, metricK]);

  // Fetch the selected numeric column's values when coloring by a column.
  useEffect(() => {
    if (colorBy === '__drift__') {
      setColumnData(null);
      return;
    }
    let cancelled = false;
    fetch(`${apiUrl}/datasets/${datasetId}/column/${encodeURIComponent(colorBy)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setColumnData({ values: data.values, extent: data.extent });
      })
      .catch(() => !cancelled && setColumnData(null));
    return () => {
      cancelled = true;
    };
  }, [datasetId, colorBy]);

  // Derive the drawn points ([x, y, dimFlag, normalizedColorValue]) from either
  // the drift metric (symlog + threshold dimming) or the chosen column (linear
  // normalize, no dimming). Slot [3] is what Scatter maps to color via valueB.
  useEffect(() => {
    if (!leftPoints.length) return;

    if (colorBy === '__drift__') {
      if (!rawDisplacementData.length) return;
      const norm = scaleSymlog(extent(rawDisplacementData), [0, 1]);
      const dpts = leftPoints.map((d, i) => {
        const v = norm(rawDisplacementData[i]);
        return [d[0], d[1], v < threshold ? 1 : 0, v];
      });
      setDrawPoints(dpts);
      setAboveThresholdCount(dpts.filter((d) => d[2] !== 1).length);
    } else {
      if (!columnData?.values?.length) return;
      const [lo, hi] = columnData.extent || extent(columnData.values.filter((v) => v != null));
      const norm = scaleLinear().domain([lo, hi]).range([0, 1]).clamp(true);
      const dpts = leftPoints.map((d, i) => {
        const raw = columnData.values[i];
        // Nulls (NaN/missing) fall to 0 on the ramp and stay fully visible.
        return [d[0], d[1], 0, raw == null ? 0 : norm(raw)];
      });
      setDrawPoints(dpts);
      setAboveThresholdCount(0);
    }
  }, [colorBy, rawDisplacementData, columnData, threshold, leftPoints]);

  // ===== Interaction Handlers =====

  const handleView = useCallback((xd, yd) => {
    setXDomain(xd);
    setYDomain(yd);
  }, []);

  const handleSelected = useCallback((indices) => {
    setSelectedIndices(indices);
  }, []);

  // A lasso brush in either Compare pane. Region selection supersedes the
  // single-point neighbor mode; both panes highlight the same rows.
  const handleRegionSelect = useCallback((indices) => {
    setSelectedIndices(indices || []);
    if (indices?.length) {
      setNeighborSelectedIndex(null);
      setNeighborIndices([]);
    }
  }, []);

  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  }, []);

  const handleClicked = useCallback(
    (index) => {
      scatter?.zoomToPoints([index], { transition: true, padding: 0.9, transitionDuration: 1500 });
    },
    [scatter]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIndices([]);
    setNeighborSelectedIndex(null);
    setNeighborIndices([]);
    scatter?.select([]);
    scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 });
  }, [scatter]);

  const handleSetLeft = useCallback(
    (id) => {
      setLeft(umaps.find((d) => d.id === id));
    },
    [umaps]
  );

  const handleSetRight = useCallback(
    (id) => {
      setRight(umaps.find((d) => d.id === id));
    },
    [umaps]
  );

  // Search
  const handleSearch = useCallback(
    (query) => {
      if (!searchModel || !query) return;
      const params = new URLSearchParams({
        dataset: datasetId,
        query,
        embedding_id: searchModel.id,
      });
      // Only send dimensions when the embedding actually declares them —
      // otherwise the string "undefined" reaches the server and int() 500s,
      // making search appear completely broken (matches apiService's guard).
      if (searchModel.dimensions != null) {
        params.set('dimensions', searchModel.dimensions);
      }
      fetch(`${apiUrl}/search/nn?${params}`)
        .then((r) => r.json())
        .then((data) => {
          const indices = data.indices || [];
          setDistances(data.distances || []);
          setSearchIndices(indices);
          if (indices.length) {
            try {
              scatter?.zoomToPoints(indices, {
                transition: true,
                padding: 0.2,
                transitionDuration: 1500,
              });
            } catch (e) {
              /* scatter not ready — results still render in the panel */
            }
          }
        })
        .catch(() => {
          setDistances([]);
          setSearchIndices([]);
        });
    },
    [searchModel, datasetId, scatter]
  );

  const handleSearchModelChange = useCallback(
    (id) => {
      setSearchModel(embeddings.find((e) => e.id === id));
    },
    [embeddings]
  );

  const handleClearSearch = useCallback(() => {
    setSearchIndices([]);
    setDistances([]);
  }, []);

  const handleNeighborSelect = useCallback((pointIndex, neighbors) => {
    setNeighborSelectedIndex(pointIndex);
    setNeighborIndices(neighbors || []);
    if (pointIndex != null) {
      setSelectedIndices([pointIndex, ...(neighbors || [])]);
    } else {
      setSelectedIndices([]);
    }
  }, []);

  // Annotations
  const activePoints = direction === 'left' ? leftPoints : rightPoints;
  const searchAnnotations = searchIndices.map((i) => activePoints[i]).filter(Boolean);
  const hoverAnnotations =
    hoveredIndex != null && activePoints[hoveredIndex] ? [activePoints[hoveredIndex]] : [];

  const pointSizeRange = [5, 1];
  const opacityRange = [1, 0.2];

  // Color-by derived values (#131)
  const colorInterpolator = colorBy === '__drift__' ? interpolateReds : interpolateViridis;
  const colorExtent = colorBy === '__drift__' ? [0, 1] : columnData?.extent || [0, 1];
  const numericColumns = Object.entries(dataset?.column_metadata || {})
    .filter(([, m]) => m?.type === 'number')
    .map(([name]) => name);

  // Resizable bottom panel
  const [panelHeight, setPanelHeight] = useState(200);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = panelHeight;

    const handleDragMove = (e) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartYRef.current - e.clientY;
      const newHeight = Math.max(40, Math.min(600, dragStartHeightRef.current + delta));
      setPanelHeight(newHeight);
    };

    const handleDragEnd = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [panelHeight]);

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className={styles['container']}>
      <CompareControls
        dataset={dataset}
        datasetId={datasetId}
        umaps={umaps}
        embeddings={embeddings}
        left={left}
        right={right}
        onSetLeft={handleSetLeft}
        onSetRight={handleSetRight}
        threshold={threshold}
        onThresholdChange={setThreshold}
        aboveThresholdCount={aboveThresholdCount}
        metric={metric}
        onMetricChange={setMetric}
        metricK={metricK}
        onMetricKChange={setMetricK}
        displacementLoading={displacementLoading}
        colorBy={colorBy}
        onColorByChange={setColorBy}
        numericColumns={numericColumns}
      />

      <div className={styles['visualization']}>
        <div className={styles['view-tabs']}>
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={
                mode.id === viewMode ? styles['view-tab-active'] : styles['view-tab-inactive']
              }
            >
              {mode.name}
            </button>
          ))}
        </div>

        <div ref={containerRef} className={styles['view-container']}>
          {viewMode === 'transition' && (
            <TransitionView
              leftPoints={leftPoints}
              rightPoints={rightPoints}
              drawPoints={drawPoints}
              width={scopeWidth}
              height={scopeHeight}
              direction={direction}
              onDirectionChange={setDirection}
              onScatter={setScatter}
              onView={handleView}
              onSelect={handleSelected}
              onHover={handleHover}
              xDomain={xDomain}
              yDomain={yDomain}
              searchAnnotations={searchAnnotations}
              hoverAnnotations={hoverAnnotations}
              pointSizeRange={pointSizeRange}
              opacityRange={opacityRange}
            />
          )}

          {viewMode === 'side-by-side' && (
            <SideBySideView
              datasetId={datasetId}
              dataset={dataset}
              left={left}
              right={right}
              leftPoints={leftPoints}
              rightPoints={rightPoints}
              drawPoints={drawPoints}
              displacementData={rawDisplacementData}
              width={scopeWidth}
              height={scopeHeight}
              onScatter={setScatter}
              onSelect={handleSelected}
              onHover={handleHover}
              onNeighborSelect={handleNeighborSelect}
              onRegionSelect={handleRegionSelect}
              selectedIndices={selectedIndices}
              searchIndices={searchIndices}
              pointSizeRange={pointSizeRange}
              opacityRange={opacityRange}
              hoveredIndex={hoveredIndex}
              metricK={metricK}
              colorInterpolator={colorInterpolator}
              colorExtent={colorExtent}
              colorLabel={colorBy === '__drift__' ? 'Drift' : colorBy}
            />
          )}
        </div>
      </div>

      <div className={styles['drag-handle']} onMouseDown={handleDragStart}>
        <div className={styles['drag-grip']} />
      </div>
      <div style={{ height: panelHeight, minHeight: 40 }}>
        <CompareDataPanel
          dataset={dataset}
          datasetId={datasetId}
          embeddings={embeddings}
          left={left}
          right={right}
          selectedIndices={selectedIndices}
          neighborSelectedIndex={neighborSelectedIndex}
          neighborIndices={neighborIndices}
          onClearSelection={handleClearSelection}
          searchIndices={searchIndices}
          distances={distances}
          onClearSearch={handleClearSearch}
          onSearch={handleSearch}
          searchModel={searchModel}
          onSearchModelChange={handleSearchModelChange}
          onHover={handleHover}
          onClick={handleClicked}
        />
      </div>
    </div>
  );
}

export default Compare;
