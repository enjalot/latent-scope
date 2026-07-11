import { useState, useEffect, useRef, useCallback } from 'react';
import FilterActions from '../components/Explore/FilterActions';
import VisualizationPane from '../components/Explore/VisualizationPane';
import MobileFilterDataTable from '../components/Explore/MobileFilterDataTable';
import { useScope } from '../contexts/ScopeContext';
import { useFilter } from '../contexts/FilterContext';
import styles from './MobileExplore.module.css';

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
  const [hovered] = useState(null);
  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [hoverAnnotations] = useState([]);

  const [size, setSize] = useState([window.innerWidth, window.innerHeight - 200]);
  const vizContainerRef = useRef(null);

  useEffect(() => {
    if (!vizContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Reserve 150px for the bottom sheet
        setSize([width, height - 150]);
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

  if (!dataset) return <div>Loading...</div>;

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
              onSelect={() => {}}
              hoverAnnotations={hoverAnnotations}
              selectedAnnotations={[]}
              hoveredCluster={hoveredCluster}
              isSmallScreen={true}
            />
          ) : null}

          {filterLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner}></div>
                <div>Loading...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <MobileFilterDataTable dataset={dataset} onHover={handleHover} />
    </div>
  );
}

export default MobileExplore;
