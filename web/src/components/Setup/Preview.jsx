import { useEffect, useState, useCallback, useMemo } from 'react';
import { range } from 'd3-array';
import { interpolatePurples } from 'd3-scale-chromatic';

import { Input, Button } from 'react-element-forge';
import { Tooltip } from 'react-tooltip';

import { processHulls } from '../../utils';
import { useSetup } from '../../contexts/SetupContext';
import { apiService } from '../../lib/apiService';
import FilterDataTable from '../FilterDataTable';
import Scatter from '../Scatter';
import HullPlot from '../HullPlot';
import {
  mapSelectionColorsLight,
  mapSelectionDomain,
  mapSelectionKey,
  mapSelectionOpacity,
  mapPointSizeRange,
} from '../../lib/colors';

import styles from './Preview.module.scss';

function Preview({ embedding, umap, cluster, labelId } = {}) {
  const { datasetId, dataset, scope, currentStep, stepIds } = useSetup();

  const length = dataset?.length || 100;
  // Search related state
  // ------------------------------------------------------------
  const [dataIndices, setDataIndices] = useState(range(0, Math.min(length, 100)));
  useEffect(() => {
    setDataIndices(range(0, Math.min(length, 100)));
  }, [dataset]);

  const [distances, setDistances] = useState([]);
  const [clusterMap, setClusterMap] = useState({});

  const [searchText, setSearchText] = useState('');
  const [lastSearchText, setLastSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);

  const [deletedIndices, setDeletedIndices] = useState([]);

  const searchQuery = useCallback(() => {
    if (searchText) {
      setLastSearchText(searchText);
      clearSelection();
      setSearchLoading(true);
      apiService.searchNearestNeighbors(datasetId, embedding, searchText).then((data) => {
        console.log('search', data);
        setDataIndices(data.indices.slice(0, 10));
        setDistances(data.distances);
        setSearchLoading(false);
        if (drawPoints.length) {
          let dp = drawPoints.map((d) => {
            return [d[0], d[1], mapSelectionKey.notSelected];
          });
          data.indices.slice(0, 10).forEach((index, i) => {
            dp[index][2] = mapSelectionKey.selected;
            console.log('dp', dp[index]);
          });
          setDrawPoints(dp);
        }
      });
    }
  }, [searchText, embedding, datasetId, drawPoints]);

  useEffect(() => {
    searchQuery();
  }, [embedding]); // don't want this to update on searchText change

  const clearSearch = useCallback(
    (clearDrawPoints = true) => {
      setSearchText('');
      setDataIndices(range(0, 100));
      setDistances([]);
      if (clearDrawPoints) {
        setDrawPoints(drawPoints.map((d) => [d[0], d[1], mapSelectionKey.normal]));
      }
    },
    [setDataIndices, setDistances, setDrawPoints, drawPoints]
  );

  // Calculate the width and height based on window size (within the frame)
  // ------------------------------------------------------------
  const [height, setHeight] = useState(300);
  const [width, setWidth] = useState(300);
  const heightOffset = 200; // 90px for the header, 50px for search 42px for the row info
  const [viewMode, setViewMode] = useState('both');

  const umapHeight = useMemo(() => {
    if (height <= 700) {
      return viewMode === 'table' ? 0 : height;
    }
    return height / 2;
  }, [height, viewMode]);

  const tableHeight = useMemo(() => {
    if (!umap) return height;
    if (height <= 700) {
      return viewMode === 'umap' ? 0 : height - 56;
    }
    return height / 2 - 6;
  }, [umap, height, viewMode]);

  // const heightPx = useMemo(() => `${height}px`, [height])
  // const widthPx = useMemo(() => `${width}px`, [width])

  useEffect(() => {
    const updateDimensions = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const previewElement = document.querySelector(`.${styles['preview']}`);
      if (previewElement) {
        const previewRect = previewElement.getBoundingClientRect();
        const newHeight = windowHeight - previewRect.top - heightOffset;
        const newWidth = windowWidth - previewRect.left - 36;
        console.log('newHeight', newHeight, 'newWidth', newWidth);
        if (newHeight > 700) {
          setViewMode('both');
        } else if (umap) {
          setViewMode('umap');
        } else {
          setViewMode('table');
        }
        setHeight(newHeight);
        setWidth(newWidth);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    setTimeout(() => {
      updateDimensions();
    }, 100);

    return () => window.removeEventListener('resize', updateDimensions);
  }, [setViewMode, setHeight, setWidth, umap]);

  useEffect(() => {
    console.log('SCOPE', scope);
  }, [scope]);

  // Title for the preview based on the current step
  // ------------------------------------------------------------
  const stepTitle = useMemo(() => {
    if (currentStep == 1) {
      return embedding?.id;
    }
    if (currentStep == 2) {
      return umap?.id;
    }
    if (currentStep == 3) {
      return cluster?.id;
    }
    return stepIds[currentStep - 1];
  }, [currentStep, stepIds, embedding, umap, cluster]);

  // Scatter plot related state
  // ------------------------------------------------------------
  const [scatter, setScatter] = useState(null);
  // We keep track of the x and y domain from the scatter plot so we can overlay stuff on top of it
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);

  // grab the x,y coordinates from the umap
  useEffect(() => {
    if (umap) {
      apiService.fetchUmapPoints(datasetId, umap.id).then((data) => {
        let pts = data.map((d) => [d.x, d.y, mapSelectionKey.normal]);
        setDrawPoints(pts);
      });
    }
  }, [datasetId, umap]);

  // Update the x and y domain when the view changes
  const handleView = useCallback(
    (xDomain, yDomain) => {
      setXDomain(xDomain);
      setYDomain(yDomain);
    },
    [setXDomain, setYDomain]
  );

  const [selectedIndices, setSelectedIndices] = useState([]);

  const clearSelection = useCallback(() => {
    setSelectedIndices([]);
    setDataIndices(range(0, 100));
    setDrawPoints(drawPoints.map((d) => [d[0], d[1], mapSelectionKey.normal]));
  }, [setSelectedIndices, setDataIndices, setDrawPoints, drawPoints]);

  // Update the selected points when the user clicks on them
  const handleSelected = useCallback(
    (selected) => {
      setSelectedIndices(selected);
      // TODO: figure out how to reset the color without clearing the selected points
      // the problem is, we use regl-scatter internal state to vis the selected points
      // but if we update the drawPoints it will clear state
      clearSearch(false); // don't clear the draw points to avoid rerender
      if (selected.length) {
        setDataIndices(selected);
      } else {
        clearSelection();
      }
    },
    [setSelectedIndices, clearSearch, setDataIndices, clearSelection]
  );

  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleHovered = useCallback(
    (index) => {
      setHoveredIndex(index);
    },
    [setHoveredIndex]
  );

  // Get the data associated with the hovered point
  // Also calculate the position of the tooltip on the map
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      apiService.fetchDataFromIndices(datasetId, [hoveredIndex]).then((results) => {
        let h = results[0];
        if (dataIndices?.length && distances?.length) {
          let searchIndex = dataIndices.indexOf(hoveredIndex);
          if (searchIndex >= 0) {
            h.ls_search_index = searchIndex;
            h.ls_distance = distances[hoveredIndex];
          }
        }
        setHovered(h);
      });
      const point = drawPoints[hoveredIndex];
      if (point && xDomain && yDomain) {
        let px = point[0];
        if (px < xDomain[0]) px = xDomain[0];
        if (px > xDomain[1]) px = xDomain[1];
        let py = point[1];
        if (py < yDomain[0]) py = yDomain[0];
        if (py > yDomain[1]) py = yDomain[1];
        const xPos = ((px - xDomain[0]) / (xDomain[1] - xDomain[0])) * width + 6.5;
        let umapHeightOffset = heightOffset / 2 - 31; // remove the row info height from the calculation and some padding
        const yPos =
          ((py - yDomain[1]) / (yDomain[0] - yDomain[1])) * umapHeight + umapHeightOffset;
        setTooltipPosition({
          x: xPos,
          y: yPos,
        });
      }
    } else {
      setHovered(null);
    }
  }, [
    datasetId,
    hoveredIndex,
    setHovered,
    drawPoints,
    xDomain,
    yDomain,
    width,
    umapHeight,
    dataIndices,
    distances,
  ]);

  // Cluster related state
  // ------------------------------------------------------------
  const [clusterLabelData, setClusterLabelData] = useState([]);
  const [clusterLabels, setClusterLabels] = useState([]);
  const [clusterIndices, setClusterIndices] = useState([]);
  const [hulls, setHulls] = useState([]);
  useEffect(() => {
    if (cluster && drawPoints.length) {
      apiService.fetchClusterLabels(datasetId, cluster.id, labelId).then((data) => {
        // console.log("cluster labels", data)
        setClusterLabelData(data);
        setHulls(processHulls(data, drawPoints));
        let ci = [];
        let cl = [];
        let cm = {};
        data.forEach((d) => {
          d.indices.forEach((i) => {
            ci[i] = d.index;
            cl[i] = d.label;
            cm[i] = { cluster: d.index, label: d.label };
          });
        });
        setClusterIndices(ci);
        setClusterLabels(cl);
        setClusterMap(cm);
      });
    }
  }, [datasetId, cluster, drawPoints, labelId]);

  const [pointSize, setPointSize] = useState(0.25);
  useEffect(() => {
    if (drawPoints?.length <= 1000) {
      setPointSize(2);
    } else if (drawPoints?.length <= 10000) {
      setPointSize(1);
    } else if (drawPoints?.length <= 100000) {
      setPointSize(0.5);
    } else {
      setPointSize(0.25);
    }
  }, [drawPoints]);

  const pointSizeRange = useMemo(() => {
    return mapPointSizeRange.map((d) => d * pointSize);
  }, [pointSize]);

  const [page, setPage] = useState(0);

  return (
    <div className={styles['preview']}>
      {/* <div className={styles["preview-header"]}>
      <h3>Preview: {stepTitle}</h3>
    </div> */}
      <div className={styles['search-box']}>
        <Input
          className={styles['search-input']}
          value={searchText}
          placeholder={`Search${embedding ? ' with ' + embedding.id + ` (${embedding.model_id?.replace('___', '/')})` : ''}`}
          disabled={!embedding}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key == 'Enter' && !searchLoading) {
              searchQuery();
            }
          }}
        ></Input>
        <div className={styles['search-button-container']}>
          <Button
            color="secondary"
            disabled={searchLoading || !searchText}
            className={styles['search-button']}
            onClick={() => {
              if (searchText && searchText == lastSearchText) {
                clearSearch();
              } else {
                searchQuery();
              }
            }}
            icon={
              searchLoading
                ? 'pie-chart'
                : searchText && searchText == lastSearchText
                  ? 'x'
                  : 'search'
            }
            // text={searchLoading ? "Searching..." : "Search"}
          ></Button>
        </div>
      </div>

      {drawPoints.length && umapHeight > 0 ? (
        <div className={styles['scatter-container']} style={{ width: width, height: umapHeight }}>
          <Scatter
            points={drawPoints}
            width={width}
            height={umapHeight}
            duration={1000}
            colorScaleType="categorical"
            colorRange={mapSelectionColorsLight}
            colorDomain={mapSelectionDomain}
            opacityRange={mapSelectionOpacity}
            pointSizeRange={pointSizeRange}
            opacityBy="valueA"
            onScatter={setScatter}
            onView={handleView}
            onSelect={handleSelected}
            onHover={handleHovered}
          />
          {hulls.length ? (
            <HullPlot
              hulls={hulls}
              stroke="black"
              fill="none"
              delay={0}
              duration={200}
              strokeWidth={1}
              xDomain={xDomain}
              yDomain={yDomain}
              width={width}
              height={umapHeight}
            />
          ) : null}
        </div>
      ) : null}

      {viewMode == 'table' ||
        (viewMode == 'both' && (
          <div className={styles['row-information']}>
            {selectedIndices.length ? (
              <div>
                <span>
                  Selected {selectedIndices?.length} of {dataset?.length} rows
                </span>
                <Button color="secondary" icon="x" onClick={() => clearSelection()}></Button>
                {/* <Button color="delete" variant="outline" icon="trash" onClick={() => console.log("TODO: implement delete modal")} text="?"></Button> */}
              </div>
            ) : (
              <span>
                Showing {dataIndices?.length} of {dataset?.length} rows
              </span>
            )}
          </div>
        ))}

      {tableHeight > 0 && viewMode !== 'umap' && dataset ? (
        <div className={styles['table-container']} style={{ height: tableHeight }}>
          <FilterDataTable
            dataset={dataset}
            filteredIndices={dataIndices}
            defaultIndices={dataIndices}
            deletedIndices={deletedIndices}
            distances={distances}
            clusterMap={clusterMap}
            clusterLabels={clusterLabels}
            height={tableHeight}
            showNavigation={false}
            onHover={handleHovered}
            page={page}
            setPage={setPage}
          />
        </div>
      ) : null}

      {height <= 700 && umap && (
        <Button
          color="secondary"
          className={styles['view-toggle']}
          onClick={() => setViewMode(viewMode === 'umap' ? 'table' : 'umap')}
          text={`Show ${viewMode === 'umap' ? 'Table' : 'UMAP'}`}
        />
      )}

      {umap && viewMode !== 'table' && (
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
      {umap && viewMode !== 'table' && (
        <Tooltip
          id="featureTooltip"
          isOpen={hoveredIndex !== null}
          delayShow={0}
          delayHide={0}
          delayUpdate={0}
          style={{
            position: 'absolute',
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            pointerEvents: 'none',
            maxWidth: '400px',
            backgroundColor: hovered?.ls_search_index >= 0 ? '#111' : '#666',
          }}
        >
          {hovered && embedding && (
            <div className={styles['tooltip-content']}>
              {hovered.ls_search_index >= 0 ? (
                <span>
                  Search: #{hovered.ls_search_index + 1}
                  <br />
                </span>
              ) : null}
              {clusterMap[hoveredIndex]?.cluster >= 0 ? (
                <span>
                  {clusterMap[hoveredIndex].label}
                  <br />
                </span>
              ) : null}
              <span>
                {hoveredIndex}: {hovered[embedding.text_column]}
              </span>
            </div>
          )}
        </Tooltip>
      )}
    </div>
  );
}

export default Preview;
