import { useState, useEffect, useRef, useCallback } from 'react';
import FilterActions from '../components/Explore/FilterActions';
import VisualizationPane from '../components/Explore/VisualizationPane';
import MobileFilterDataTable from '../components/Explore/MobileFilterDataTable';
import PointDetail from '../components/Explore/PointDetail';
import { useScope } from '../contexts/ScopeContext';
import { useFilter } from '../contexts/FilterContext';
import { Spinner } from '../components/ui';
import styles from './MobileExplore.module.css';

// Height reserved for the bottom-sheet table under the map (px)
const BOTTOM_SHEET_RESERVE = 150;

function MobileExplore() {
  const {
    dataset,
    scope,
    scopeRows,
    deletedIndices,
    clusterLabels,
    scopeId,
    error: scopeError,
  } = useScope();
  const { loading: filterLoading } = useFilter();

  const [scatter, setScatter] = useState({});
  const [hoveredIndex, setHoveredIndex] = useState(null);
  // Touch has no hover: a tap selects a point and its detail opens in the
  // drawer (the touch equivalent of the desktop hover tooltip).
  const [selectedIndex, setSelectedIndex] = useState(null);
  const handleSelect = useCallback(
    (indices) => {
      const i = indices?.[0];
      setSelectedIndex(i === undefined || i === -1 || deletedIndices.includes(i) ? null : i);
    },
    [deletedIndices]
  );
  const [hovered] = useState(null);
  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [hoverAnnotations] = useState([]);

  const [size, setSize] = useState([
    window.innerWidth,
    window.innerHeight - BOTTOM_SHEET_RESERVE,
  ]);
  const vizContainerRef = useRef(null);

  useEffect(() => {
    if (!vizContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize([width, height - BOTTOM_SHEET_RESERVE]);
      }
    });
    observer.observe(vizContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleHover = useCallback(
    (index) => {
      const nonDeletedIndex = deletedIndices.includes(index) ? null : index;
      setHoveredIndex(nonDeletedIndex);
      setHoveredCluster(null);
    },
    [deletedIndices]
  );

  const [width, height] = size;

  if (scopeError) {
    return (
      <div>
        <p>Failed to load scope {scopeId}.</p>
        <p>{scopeError.message}</p>
        <a href="/">Back to home</a>
      </div>
    );
  }

  if (!dataset)
    return (
      <div className={styles.pageLoading}>
        <Spinner label="LOADING SCOPE…" />
      </div>
    );

  return (
    <div className={styles.mobileExploreLayout}>
      <div className={styles.visualizationPaneContainer}>
        <div className={styles.filterActionsOverlay}>
          <FilterActions
            clusterLabels={clusterLabels}
            scatter={scatter}
            scope={scope}
            dataset={dataset}
          />
        </div>
        <div ref={vizContainerRef} className={styles.visualizationPane}>
          {scopeRows?.length ? (
            <VisualizationPane
              width={width}
              height={height}
              onScatter={setScatter}
              hovered={hovered}
              hoveredIndex={hoveredIndex}
              onHover={handleHover}
              onSelect={handleSelect}
              hoverAnnotations={hoverAnnotations}
              selectedAnnotations={[]}
              hoveredCluster={hoveredCluster}
              dataTableRows={[]}
              isSmallScreen={true}
            />
          ) : null}

          <PointDetail selectedIndex={selectedIndex} onClose={() => setSelectedIndex(null)} />

          {filterLoading && (
            <div className="ls-scrim">
              <Spinner label="LOADING…" />
            </div>
          )}
        </div>
      </div>

      <MobileFilterDataTable dataset={dataset} onHover={handleHover} />
    </div>
  );
}

export default MobileExplore;
