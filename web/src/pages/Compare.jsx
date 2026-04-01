import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { extent } from 'd3-array';
import { scaleSymlog } from 'd3-scale';

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
  const drawPointsRef = useRef([]);
  const [displacementLoading, setDisplacementLoading] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [aboveThresholdCount, setAboveThresholdCount] = useState(0);

  // Metric controls
  const [metric, setMetric] = useState('displacement');
  const [metricK, setMetricK] = useState(10);

  // View mode
  const [viewMode, setViewMode] = useState('transition');
  const [direction, setDirection] = useState('left');

  // Scatterplot state
  const [scatter, setScatter] = useState(null);
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);

  // Selection state
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [hoveredIndex, setHoveredIndex] = useState(null);

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
        const log = scaleSymlog(extent(displacementData), [0, 1]);
        const dpts = leftPoints.map((d, i) => {
          const displacement = log(displacementData[i]);
          return [d[0], d[1], displacement < threshold ? 1 : 0, displacement];
        });
        setDrawPoints(dpts);
        drawPointsRef.current = dpts;
        setAboveThresholdCount(dpts.filter((d) => d[2] !== 1).length);
        setDisplacementLoading(false);
        prevCompareKey.current = key;
      });
  }, [datasetId, left, right, leftPoints, rightPoints, metric, metricK, threshold]);

  // Update threshold without re-fetching
  useEffect(() => {
    if (!drawPointsRef.current.length) return;
    const newPoints = drawPointsRef.current.map((point) => [
      point[0],
      point[1],
      point[3] < threshold ? 1 : 0,
      point[3],
    ]);
    setDrawPoints(newPoints);
    setAboveThresholdCount(newPoints.filter((d) => d[2] !== 1).length);
  }, [threshold]);

  // ===== Interaction Handlers =====

  const handleView = useCallback((xd, yd) => {
    setXDomain(xd);
    setYDomain(yd);
  }, []);

  const handleSelected = useCallback((indices) => {
    setSelectedIndices(indices);
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
      if (!searchModel) return;
      fetch(
        `${apiUrl}/search/nn?dataset=${datasetId}&query=${query}&embedding_id=${searchModel.id}&dimensions=${searchModel.dimensions}`
      )
        .then((r) => r.json())
        .then((data) => {
          setDistances(data.distances);
          setSearchIndices(data.indices);
          scatter?.zoomToPoints(data.indices, {
            transition: true,
            padding: 0.2,
            transitionDuration: 1500,
          });
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

  // Annotations
  const activePoints = direction === 'left' ? leftPoints : rightPoints;
  const searchAnnotations = searchIndices.map((i) => activePoints[i]).filter(Boolean);
  const hoverAnnotations =
    hoveredIndex != null && activePoints[hoveredIndex] ? [activePoints[hoveredIndex]] : [];

  const pointSizeRange = [5, 1];
  const opacityRange = [1, 0.2];

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
              leftPoints={leftPoints}
              rightPoints={rightPoints}
              drawPoints={drawPoints}
              width={scopeWidth}
              height={scopeHeight}
              onScatter={setScatter}
              onSelect={handleSelected}
              onHover={handleHover}
              searchAnnotations={searchAnnotations}
              hoverAnnotations={hoverAnnotations}
              pointSizeRange={pointSizeRange}
              opacityRange={opacityRange}
              hoveredIndex={hoveredIndex}
            />
          )}
        </div>
      </div>

      <CompareDataPanel
        dataset={dataset}
        datasetId={datasetId}
        embeddings={embeddings}
        selectedIndices={selectedIndices}
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
  );
}

export default Compare;
