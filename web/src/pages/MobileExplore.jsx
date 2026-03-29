import { useState, useEffect, useRef, useCallback } from 'react';
import FilterActions from '../components/Explore/FilterActions';
import VisualizationPane from '../components/Explore/VisualizationPane';
import MobileFilterDataTable from '../components/Explore/MobileFilterDataTable';
import { useScope } from '../contexts/ScopeContext';
import { useFilter } from '../contexts/FilterContext';
import styles from './MobileExplore.module.css';

function MobileExplore() {
  const { dataset, scope, scopeRows, deletedIndices, clusterLabels } = useScope();
  const { loading: filterLoading } = useFilter();

  const [scatter, setScatter] = useState({});
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [hoverAnnotations, setHoverAnnotations] = useState([]);

  const [size, setSize] = useState([500, 500]);
  const vizContainerRef = useRef(null);

  function updateSize() {
    if (vizContainerRef.current) {
      const vizRect = vizContainerRef.current.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(vizContainerRef.current);
      setSize([vizRect.width, parseInt(computedStyle.height) - 150]);
    }
  }

  useEffect(() => {
    const observer = new MutationObserver(() => {
      updateSize();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
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
              dataTableRows={[]}
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
