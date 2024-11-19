import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { groups } from 'd3-array';
import PropTypes from 'prop-types';
import Scatter from '../Scatter';
import AnnotationPlot from '../AnnotationPlot';
import HullPlot from '../HullPlot';
import TilePlot from '../TilePlot';
import { Tooltip } from 'react-tooltip';
import { processHulls } from '../../utils';
import {
  mapSelectionColorsLight,
  mapSelectionDomain,
  mapSelectionOpacity,
  mapPointSizeRange,
  mapSelectionKey,
} from '../../lib/colors';
import styles from './VisualizationPane.module.scss';
import ConfigurationPanel from './ConfigurationPanel';
import { Icon, Button } from 'react-element-forge';

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

function VisualizationPane({
  scopeRows,
  clusterLabels,
  hoverAnnotations,
  intersectedIndices,
  hoveredCluster,
  slide,
  scope,
  onScatter,
  onSelect,
  onHover,
  hoveredIndex,
  hovered,
  containerRef,
}) {
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const handleView = useCallback(
    (xDomain, yDomain) => {
      setXDomain(xDomain);
      setYDomain(yDomain);
    },
    [setXDomain, setYDomain]
  );

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [size, setSize] = useState([500, 500]);
  const umapRef = useRef(null);
  const [umapOffset, setUmapOffset] = useState(0);

  // let's fill the container and update the width and height if window resizes
  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) return;

      if (isFullScreen) {
        // Use window dimensions in fullscreen mode
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        setSize([windowWidth - 50, windowHeight - 100]);
        setUmapOffset(80); // TODO: why is this the
      } else {
        const rect = containerRef.current.getBoundingClientRect();
        const urect = umapRef.current.getBoundingClientRect();
        const width = rect.width;
        let swidth = width > 500 ? 500 : width - 50;
        setSize([swidth, rect.height - urect.top + 30]);
        setUmapOffset(urect.top + 40); // 40 is the height of the top header
      }

      // console.log("UMAP OFFSET", rect.top + top)
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, [isFullScreen]);

  const [width, height] = size;

  const drawingPoints = useMemo(() => {
    return scopeRows.map((p, i) => {
      if (hoveredIndex !== null) {
        if (hoveredIndex === i) {
          return [p.x, p.y, mapSelectionKey.hovered];
        } else {
          return [p.x, p.y, mapSelectionKey.notSelected];
        }
      }

      // if (deletedIndices?.includes(i)) {
      if (p.deleted) {
        return [-10, -10, mapSelectionKey.hidden];
      } else if (intersectedIndices?.includes(i)) {
        return [p.x, p.y, mapSelectionKey.selected];
      } else if (intersectedIndices?.length) {
        return [p.x, p.y, mapSelectionKey.notSelected];
      } else {
        return [p.x, p.y, mapSelectionKey.normal];
      }
    });
  }, [scopeRows, intersectedIndices, hoveredIndex]);

  const points = useMemo(() => {
    return scopeRows
      .filter((p) => !p.deleted)
      .map((p) => {
        return [p.x, p.y];
      });
  }, [scopeRows]);

  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (hovered) {
      // console.log("hovered", hovered, scopeRows[hovered.index])
      const point = scopeRows[hovered.index];
      if (point && xDomain && yDomain) {
        let px = point.x;
        if (px < xDomain[0]) px = xDomain[0];
        if (px > xDomain[1]) px = xDomain[1];
        let py = point.y;
        if (py < yDomain[0]) py = yDomain[0];
        if (py > yDomain[1]) py = yDomain[1];
        const xPos = ((px - xDomain[0]) / (xDomain[1] - xDomain[0])) * width + 19;
        const yPos = ((py - yDomain[1]) / (yDomain[0] - yDomain[1])) * size[1] + umapOffset - 28;
        // console.log("xPos", xPos, "yPos", yPos)
        setTooltipPosition({
          x: xPos,
          y: yPos,
        });
      }
    }
  }, [hovered, scopeRows, xDomain, yDomain, width, size, umapOffset]);

  const hulls = useMemo(() => {
    return processHulls(clusterLabels, scopeRows, (d) => (d.deleted ? null : [d.x, d.y]));
  }, [scopeRows, clusterLabels]);

  // derive the hulls from the slide, and filter deleted points via an accessor
  const clusterHulls = useMemo(() => {
    if (!slide || !scopeRows) return [];
    return processHulls([slide], scopeRows, (d) => (d.deleted ? null : [d.x, d.y]));
  }, [slide, scopeRows]);

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
    console.log('scopeRows', scopeRows);
    if (scopeRows?.length <= 1000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 2 }));
    } else if (scopeRows?.length <= 10000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 1 }));
    } else if (scopeRows?.length <= 100000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 0.5 }));
    } else {
      setVizConfig((prev) => ({ ...prev, pointSize: 0.25 }));
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

  const pointSizeRange = useMemo(() => {
    return mapPointSizeRange.map((d) => d * vizConfig.pointSize);
  }, [vizConfig.pointSize]);
  const pointOpacityRange = useMemo(() => {
    return mapSelectionOpacity.map((d) => d * vizConfig.pointOpacity);
  }, [vizConfig.pointOpacity]);

  return (
    <div className="umap-container" ref={umapRef}>
      <div className={styles.configToggleContainer}>
        <Button
          className={styles['configToggle']}
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          aria-label="Toggle configuration panel"
          icon={isPanelOpen ? 'x' : 'settings'}
          size="small"
          // color="#333"
        />
        <Button
          className={styles['fullscreenToggle']}
          onClick={() => setIsFullScreen(!isFullScreen)}
          aria-label="Toggle full screen"
          icon={isFullScreen ? 'minimize' : 'maximize'}
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
        />
      </div>

      <div
        className={styles.scatters + ' ' + (isFullScreen ? styles.fullScreen : '')}
        style={{ width, height }}
      >
        {!isIOS() && scope ? (
          <Scatter
            points={drawingPoints}
            duration={2000}
            width={width}
            height={height}
            colorScaleType="categorical"
            colorRange={mapSelectionColorsLight}
            colorDomain={mapSelectionDomain}
            opacityRange={pointOpacityRange}
            pointSizeRange={pointSizeRange}
            opacityBy="valueA"
            onScatter={onScatter}
            onView={handleView}
            onSelect={onSelect}
            onHover={onHover}
          />
        ) : (
          <AnnotationPlot
            points={points}
            fill="gray"
            height={height}
            width={width}
            size="8"
            xDomain={xDomain}
            yDomain={yDomain}
          />
        )}

        {/* show all the hulls */}
        {/* {vizConfig.showClusterOutlines && hulls.length && (
          <HullPlot
            hulls={hulls}
            // stroke="#8d7d7d"
            stroke="#d4b297"
            fill="none"
            duration={200}
            strokeWidth={0.35}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
          />
        )} */}

        {/* {hoveredCluster && hoveredCluster.hull && scope.cluster_labels_lookup && (
          <HullPlot
            hulls={hoveredHulls}
            // fill="lightgray"
            fill="#d28440"
            stroke="#CC5500"
            strokeWidth={2.5}
            // if there are selected indices already, that means other points will be less visible
            // so we can make the hull a bit more transparent
            opacity={intersectedIndices?.length ? 0.15 : 0.5}
            duration={0}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
          />
        )} */}

        {slide && slide.hull && !scope.ignore_hulls && scope.cluster_labels_lookup && (
          <HullPlot
            hulls={clusterHulls}
            // fill="darkgray"
            // stroke="gray"
            fill="#d28440"
            stroke="#CC5500"
            strokeWidth={0.5}
            opacity={0.35}
            duration={0}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
          />
        )}

        <AnnotationPlot
          points={hoverAnnotations}
          stroke="black"
          fill="orange"
          size="16"
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
        />

        {vizConfig.showHeatMap && tiles?.length > 1 && (
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
      </div>

      {/* Hover information display */}
      {/* {hovered && (
        <div
          data-tooltip-id="featureTooltip"
          style={{
            position: 'absolute',
            left: tooltipPosition.x,
            top: tooltipPosition.y,
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
          className="tooltip-area"
          style={{
            position: 'absolute',
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            pointerEvents: 'none',
            maxWidth: '400px',
            backgroundColor: hovered?.ls_search_index >= 0 ? '#111' : '#666',
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
            <p className="tooltip-text">{hovered[scope?.embedding?.text_column]}</p>
          </div>
        </Tooltip>
      )} */}

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

VisualizationPane.propTypes = {
  scopeRows: PropTypes.array.isRequired,
  hoverAnnotations: PropTypes.array.isRequired,
  hoveredCluster: PropTypes.object,
  slide: PropTypes.object,
  scope: PropTypes.object,
  onScatter: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onHover: PropTypes.func.isRequired,
  hovered: PropTypes.object,
  dataset: PropTypes.object.isRequired,
  containerRef: PropTypes.object.isRequired,
};

export default VisualizationPane;
