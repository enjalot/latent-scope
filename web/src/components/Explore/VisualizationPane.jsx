import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { groups } from 'd3-array';
// import Scatter from '../Scatter';
// import Scatter from '../ScatterCanvas';
import Scatter from './ScatterGL';
import AnnotationPlot from '../AnnotationPlot';
import HullPlot from '../HullPlot';
import TilePlot from '../TilePlot';
import { Tooltip } from 'react-tooltip';
import CrossHair from './Crosshair';
import { processHulls } from './util';
import FilteredPointsOverlay from './FilteredPointsOverlay';
import PointLabel from './PointLabel';
import { filterConstants } from './Search/utils';

// import { useColorMode } from '../../hooks/useColorMode';

import { useScope } from '../../contexts/ScopeContext';
import { useFilter } from '../../contexts/FilterContext';

import { mapSelectionKey } from '../../lib/colors';
import { imageUrlFor } from '../../lib/imageUrl';
import { fetchAtlasStatus } from '../../lib/atlasUrl';
import { atlasLod } from '../../lib/atlasLod';
import HoverThumbnail from './HoverThumbnail';
import AtlasOverlay from './AtlasOverlay';
import PointsOverlay from './PointsOverlay';
import styles from './VisualizationPane.module.scss';
import ConfigurationPanel from './ConfigurationPanel';
import { Button } from 'react-element-forge';
// VisualizationPane.propTypes = {
//   hoverAnnotations: PropTypes.array.isRequired,
//   hoveredCluster: PropTypes.object,
//   cluster: PropTypes.object,
//   scope: PropTypes.object,
//   selectedAnnotations: PropTypes.array.isRequired,
//   onScatter: PropTypes.func.isRequired,
//   onSelect: PropTypes.func.isRequired,
//   onHover: PropTypes.func.isRequired,
//   hovered: PropTypes.object,
//   dataset: PropTypes.object.isRequired,
//   containerRef: PropTypes.object.isRequired,
// };

function VisualizationPane({
  width,
  height,
  hovered,
  onHover,
  onSelect,
  hoverAnnotations,
  selectedAnnotations,
  hoveredCluster,
  dataTableRows,
  isSmallScreen = false,
}) {
  const { scopeRows, clusterLabels, scope, features, dataset } = useScope();

  // first binary image column (if any) for the hover thumbnail
  const hoverImageColumn = useMemo(() => {
    const columnMetadata = dataset?.column_metadata || {};
    return Object.keys(columnMetadata).find((col) => columnMetadata[col]?.type === 'image');
  }, [dataset]);

  // ====================================================================================================
  // Image map: heatmap -> representative-image atlas -> points, as one LOD.
  // The atlas (sprite sheets keyed to the heatmap grid) is generated as a
  // post-scope step; when present, an image dataset defaults to this view.
  // ====================================================================================================
  const [atlasStatus, setAtlasStatus] = useState({ generated: false });
  useEffect(() => {
    let cancelled = false;
    if (!dataset?.id || !scope?.id || !hoverImageColumn) {
      setAtlasStatus({ generated: false });
      return;
    }
    fetchAtlasStatus(dataset.id, scope.id, hoverImageColumn)
      .then((status) => {
        if (!cancelled) setAtlasStatus(status);
      })
      .catch(() => {
        if (!cancelled) setAtlasStatus({ generated: false });
      });
    return () => {
      cancelled = true;
    };
  }, [dataset?.id, scope?.id, hoverImageColumn]);

  // An image dataset with a generated atlas defaults to the image map (heatmap
  // -> images -> points). The master toggle lets the user fall back to a plain
  // scatter; "always show points" keeps individual points drawn on top.
  const isImageDataset = !!hoverImageColumn && !!atlasStatus.generated;
  const [imageMode, setImageMode] = useState(false);
  const [alwaysShowPoints, setAlwaysShowPoints] = useState(false);
  useEffect(() => {
    setImageMode(isImageDataset);
  }, [isImageDataset]);

  const toggleImageMode = useCallback(() => setImageMode((p) => !p), []);
  const toggleAlwaysShowPoints = useCallback(() => setAlwaysShowPoints((p) => !p), []);

  const atlasResolutions = useMemo(
    () => (atlasStatus.resolutions || []).map((r) => r.num_tiles),
    [atlasStatus]
  );

  const { featureFilter, clusterFilter, shownIndices, filteredIndices, filterConfig, filterActive } =
    useFilter();

  // only show the hull if we are filtering by cluster
  const showHull = filterConfig?.type === filterConstants.CLUSTER;

  const maxZoom = 40;

  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const handleView = useCallback(
    (xDomain, yDomain, transform) => {
      setXDomain(xDomain);
      setYDomain(yDomain);
      setTransform(transform);
    },
    [setXDomain, setYDomain]
  );

  // const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFullScreen] = useState(true);
  const umapRef = useRef(null);

  // Level of detail for the image map at the current zoom.
  const lod = useMemo(
    () => atlasLod(transform?.k || 1, width, atlasResolutions),
    [transform, width, atlasResolutions]
  );
  // Points drawn on top of the atlas: past the deepest grid, or always-on.
  const pointsVisible = imageMode && (lod.deepest || alwaysShowPoints);

  const featureIsSelected = featureFilter.feature !== -1;

  // Add new memoized feature activation lookup
  const featureActivationMap = useMemo(() => {
    if (!featureIsSelected || !dataTableRows || !shownIndices) {
      return new Map();
    }

    const lookup = new Map();
    dataTableRows.forEach((data) => {
      const activatedIdx = data.sae_indices.indexOf(featureFilter.feature);
      if (activatedIdx !== -1) {
        const activatedFeature = data.sae_acts[activatedIdx];
        // normalize the activation to be between 0 and 1
        const min = 0.0;
        const max = features[featureFilter.feature].dataset_max;
        const normalizedActivation = (activatedFeature - min) / (max - min);
        lookup.set(data.ls_index, normalizedActivation);
      }
    });
    return lookup;
  }, [featureIsSelected, dataTableRows, featureFilter.feature, features]);

  const drawingPoints = useMemo(() => {
    return scopeRows.map((p, i) => {
      if (featureIsSelected) {
        if (shownIndices?.includes(i)) {
          const activation = featureActivationMap.get(p.ls_index);
          return activation !== undefined
            ? [p.x, p.y, mapSelectionKey.selected, activation]
            : [p.x, p.y, mapSelectionKey.notSelected, 0.0];
        }
        return [p.x, p.y, mapSelectionKey.notSelected, 0.0];
      }

      if (p.deleted) {
        return [-10, -10, mapSelectionKey.hidden, 0.0];
        //   } else if (hoveredIndex === i) {
        //     return [p.x, p.y, mapSelectionKey.hovered, 0.0];
      } else if (shownIndices?.includes(i)) {
        return [p.x, p.y, mapSelectionKey.selected, 0.0];
      } else if (shownIndices?.length) {
        return [p.x, p.y, mapSelectionKey.notSelected, 0.0];
      } else {
        return [p.x, p.y, mapSelectionKey.normal, 0.0];
      }
    });
  }, [scopeRows, shownIndices, featureActivationMap, featureIsSelected]);

  // const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  // useEffect(() => {
  //   console.log('==== hovered ==== ', hovered);
  //   if (hovered) {
  //     // console.log("hovered", hovered, scopeRows[hovered.index])
  //     const point = scopeRows[hovered.index];
  //     if (point && xDomain && yDomain) {
  //       let px = point.x;
  //       if (px < xDomain[0]) px = xDomain[0];
  //       if (px > xDomain[1]) px = xDomain[1];
  //       let py = point.y;
  //       if (py < yDomain[0]) py = yDomain[0];
  //       if (py > yDomain[1]) py = yDomain[1];
  //       const xPos = ((px - xDomain[0]) / (xDomain[1] - xDomain[0])) * width + 19;
  //       const yPos = ((py - yDomain[1]) / (yDomain[0] - yDomain[1])) * size[1] + umapOffset - 28;
  //       // console.log("xPos", xPos, "yPos", yPos)
  //       setTooltipPosition({
  //         x: xPos,
  //         y: yPos,
  //       });
  //     }
  //   }
  // }, [hovered, scopeRows, xDomain, yDomain, width, height, umapOffset]);

  const hulls = useMemo(() => {
    return processHulls(clusterLabels, scopeRows, (d) => (d.deleted ? null : [d.x, d.y]));
  }, [scopeRows, clusterLabels]);

  // derive the hulls from the cluster, and filter deleted points via an accessor
  const clusterHulls = useMemo(() => {
    if (!clusterFilter.cluster || !scopeRows) return [];
    return processHulls([clusterFilter.cluster], scopeRows, (d) => (d.deleted ? null : [d.x, d.y]));
  }, [clusterFilter.cluster, scopeRows]);

  const hoveredHulls = useMemo(() => {
    if (!hoveredCluster || !scopeRows) return [];
    return processHulls([hoveredCluster], scopeRows, (d) => (d.deleted ? null : [d?.x, d?.y]));
  }, [hoveredCluster, scopeRows]);

  // TODO: these should just be based on which tile we choose, 32, 64 or 128
  const tileMeta = useMemo(() => {
    return {
      size: 2 / 64,
      cols: 64,
    };
  }, []);
  const tiles = useMemo(() => {
    return groups(scopeRows, (d) => d.tile_index_64).map((tile) => {
      return {
        tile_index: tile[0],
        points: tile[1],
      };
    });
  }, [scopeRows]);

  // ====================================================================================================
  // Configuration Panel
  // ====================================================================================================
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [vizConfig, setVizConfig] = useState({
    showHeatMap: false,
    showClusterOutlines: true,
    pointSize: 1,
    pointOpacity: 1,
  });

  useEffect(() => {
    if (scopeRows?.length <= 1000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 2.25 }));
    } else if (scopeRows?.length <= 10000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 1.25 }));
    } else if (scopeRows?.length <= 100000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 0.75 }));
    } else {
      setVizConfig((prev) => ({ ...prev, pointSize: 0.5 }));
    }
  }, [scopeRows]);

  const toggleShowHeatMap = useCallback(() => {
    setVizConfig((prev) => ({ ...prev, showHeatMap: !prev.showHeatMap }));
  }, []);

  const toggleShowClusterOutlines = useCallback(() => {
    setVizConfig((prev) => ({ ...prev, showClusterOutlines: !prev.showClusterOutlines }));
  }, []);

  const updatePointSize = useCallback((value) => {
    setVizConfig((prev) => ({ ...prev, pointSize: value }));
  }, []);

  const updatePointOpacity = useCallback((value) => {
    setVizConfig((prev) => ({ ...prev, pointOpacity: value }));
  }, []);

  // ensure the order of selectedPoints
  // exactly matches the ordering of indexes in shownIndices.
  const selectedPoints = useMemo(() => {
    if (!shownIndices || !scopeRows) return [];
    return shownIndices
      .map((ls_index, i) => {
        // Find the point in scopeRows with matching ls_index
        const point = scopeRows.find((p) => p.ls_index === ls_index);
        return point ? { ...point, index: i } : null;
      })
      .filter((point) => point !== null);
  }, [shownIndices, scopeRows]);

  // console.log({
  //   shownIndices,
  //   selectedPoints: selectedPoints.map((p) => {
  //     return {
  //       index: p.index,
  //       ls_index: p.ls_index,
  //     };
  //   }),
  // });

  return (
    // <div style={{ width, height }} ref={umapRef}>
    <div ref={umapRef} style={{ width: '100%', height: '100%' }}>
      <div className={styles.configToggleContainer}>
        <Button
          className={styles['configToggle']}
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          aria-label="Toggle configuration panel"
          icon={'settings'}
          size="small"
          // color="#333"
        />

        <ConfigurationPanel
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
          title="View Settings"
          vizConfig={vizConfig}
          toggleShowHeatMap={toggleShowHeatMap}
          toggleShowClusterOutlines={toggleShowClusterOutlines}
          updatePointSize={updatePointSize}
          updatePointOpacity={updatePointOpacity}
          isImageDataset={isImageDataset}
          imageMode={imageMode}
          toggleImageMode={toggleImageMode}
          alwaysShowPoints={alwaysShowPoints}
          toggleAlwaysShowPoints={toggleAlwaysShowPoints}
        />
      </div>

      <div className={styles.scatters + ' ' + (isFullScreen ? styles.fullScreen : '')}>
        {scope && (
          <Scatter
            points={drawingPoints}
            width={width}
            height={height}
            onView={handleView}
            onSelect={onSelect}
            onHover={onHover}
            featureIsSelected={featureIsSelected}
            maxZoom={maxZoom}
            isSmallScreen={isSmallScreen}
            // In image mode the visible points come from the PointsOverlay (on
            // top of the atlas); the GPU layer stays for zoom/hover/select only.
            hidePoints={imageMode}
          />
        )}
        {/* green dots for all filtered points beyond the table page */}
        {filterActive && (
          <FilteredPointsOverlay
            scopeRows={scopeRows}
            filteredIndices={filteredIndices}
            shownIndices={shownIndices}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
          />
        )}
        {/* show all the hulls */}
        {vizConfig.showClusterOutlines && hulls.length && (
          <HullPlot
            hulls={hulls}
            // stroke="#E7C7AA"
            // stroke={cluster && cluster.hull ? 'lightgray' : '#E7C7AA'}
            // stroke={isDark ? '#E0EFFF' : '#d4b297'}
            stroke="#d4b297"
            // stroke={'#E0EFFF'}
            fill="none"
            duration={200}
            strokeWidth={0.75}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
          />
        )}
        {hoveredCluster && hoveredHulls?.length > 0 && scope.cluster_labels_lookup && (
          <HullPlot
            hulls={hoveredHulls}
            fill="#8bcf66"
            stroke="#6aa64f"
            strokeWidth={2.5}
            // if there are selected indices already, that means other points will be less visible
            // so we can make the hull a bit more transparent
            opacity={0.2}
            duration={0}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            label={scope.cluster_labels_lookup[hoveredCluster.cluster]}
            k={transform.k}
            maxZoom={maxZoom}
          />
        )}
        {/* Cluster is selected via filter */}
        {showHull &&
          clusterFilter.cluster &&
          clusterFilter.cluster.hull?.length > 0 &&
          !scope.ignore_hulls &&
          scope.cluster_labels_lookup && (
            <HullPlot
              hulls={clusterHulls}
              fill="#D3965E"
              stroke="#C77C37"
              strokeWidth={3}
              opacity={0.25}
              duration={0}
              xDomain={xDomain}
              yDomain={yDomain}
              width={width}
              height={height}
              label={scope.cluster_labels_lookup[clusterFilter.cluster.cluster]}
            />
          )}
        {/* Image map: the atlas sheet (representative image per heatmap cell)
            takes over from the heatmap as you zoom in. */}
        {imageMode && scope?.id && atlasStatus.generated && (
          <AtlasOverlay
            dataset={dataset}
            scopeId={scope.id}
            imageColumn={hoverImageColumn}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            transform={transform}
            enabled={imageMode}
            manifest={atlasStatus}
          />
        )}
        {/* Points drawn on top of the image grid (past the deepest grid, or
            when "always show points" is on) so they can be hovered. */}
        {pointsVisible && (
          <PointsOverlay
            scopeRows={scopeRows}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            enabled={pointsVisible}
            opacity={vizConfig.pointOpacity}
            pointSize={vizConfig.pointSize}
          />
        )}
        <AnnotationPlot
          points={hoverAnnotations}
          stroke="black"
          fill="#8bcf66"
          size="16"
          fixedSize
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
        />
        <AnnotationPlot
          points={selectedAnnotations}
          stroke="black"
          fill="purple"
          size="16"
          fixedSize
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
        />
        {/* Heatmap: the zoomed-out base in image mode (the atlas takes over as
            you zoom), or the manual toggle for non-image scopes. */}
        {(imageMode ? !lod.active : vizConfig.showHeatMap) && tiles?.length > 1 && (
          <TilePlot
            tiles={tiles}
            tileMeta={tileMeta}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            fill="gray"
            // stroke="black"
          />
        )}
        <PointLabel
          selectedPoints={selectedPoints}
          hovered={hovered}
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
          k={transform.k}
          maxZoom={maxZoom}
        />
        {isSmallScreen && (
          <CrossHair xDomain={xDomain} yDomain={yDomain} width={width} height={height} />
        )}
      </div>

      {/* Hover information display */}
      {hovered && (
        <div
          data-tooltip-id="featureTooltip"
          style={{
            position: 'absolute',
            right: 225,
            top: 0,
            pointerEvents: 'none',
          }}
        ></div>
      )}
      {hovered && (
        <Tooltip
          id="featureTooltip"
          isOpen={hovered !== null}
          delayShow={0}
          delayHide={0}
          delayUpdate={0}
          noArrow={true}
          className="tooltip-area"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            width: '400px',
            backgroundColor: '#D3965E',
          }}
        >
          <div className="tooltip-content">
            {hoveredCluster && (
              <span>
                <span className="key">Cluster {hoveredCluster.cluster}: </span>
                <span className="value">{hoveredCluster.label}</span>
              </span>
            )}
            <br></br>
            <span>Index: {hovered.index}</span>
            {hoverImageColumn && hovered.index !== null && hovered.index !== undefined && (
              <HoverThumbnail
                key={hovered.index}
                src={imageUrlFor(dataset.id, hoverImageColumn, hovered.index, 150)}
                alt={`${hoverImageColumn} ${hovered.index}`}
                size={150}
              />
            )}
            <p className="tooltip-text">
              {hovered.loading && !hovered.text ? <em>loading…</em> : hovered.text}
            </p>
          </div>
        </Tooltip>
      )}

      {/* {!isMobileDevice() && (
              <div className="hovered-point">
                  {hoveredCluster && (
                      <span>
                          <span className="key">Cluster {hoveredCluster.cluster}:</span>
                          <span className="value">{hoveredCluster.label}</span>
                      </span>
                  )}
                  {hovered &&
                      Object.keys(hovered).map((key, idx) => {
                          let d = hovered[key];
                if (typeof d === "object" && !Array.isArray(d)) {
                    d = JSON.stringify(d);
                }
                let meta =
                    dataset.column_metadata && dataset.column_metadata[key];
                let value;
                if (meta && meta.image) {
                  value = (
                      <span className="value" key={idx}>
                          <img src={d} alt={key} height={64} />
                      </span>
                  );
              } else if (meta && meta.url) {
                  value = (
                      <span className="value" key={idx}>
                          <a href={d}>url</a>
                      </span>
                  );
              } else if (meta && meta.type == "array") {
                  value = (
                      <span className="value" key={idx}>
                          [{d.length}]
                      </span>
                  );
              } else {
                    value = (
                        <span className="value" key={idx}>
                            {d}
                        </span>
                    );
                }
                return (
                    <span key={key}>
                        <span className="key">{key}:</span>
                        {value}
                    </span>
                );
            })}
              </div>
          )} */}
    </div>
  );
}

export default VisualizationPane;
