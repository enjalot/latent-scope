import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import Scatter from "../Scatter";
import AnnotationPlot from "../AnnotationPlot";
import HullPlot from "../HullPlot";
import { Tooltip } from "react-tooltip";
import { processHulls } from "../../utils";
import { mapSelectionColorsLight, mapSelectionDomain, mapSelectionOpacity, mapPointSizeRange, mapSelectionKey } from "../../lib/colors";

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

function VisualizationPane({
    scopeRows,
    hoverAnnotations,
    intersectedIndices,
    hoveredCluster,
    slide,
    scope,
    onScatter,
    onSelect,
    onHover,
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
      [setXDomain, setYDomain],
  );

    const [size, setSize] = useState([500, 500]);
    const umapRef = useRef(null);
    const [umapOffset, setUmapOffset] = useState(0);


    // let's fill the container and update the width and height if window resizes
    useEffect(() => {
        function updateSize() {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const width = rect.width
            let swidth = width > 500 ? 500 : width - 50;
            setSize([swidth, swidth]);
            const { top } = umapRef.current.getBoundingClientRect();
            setUmapOffset(rect.top + top);
            // console.log("UMAP OFFSET", rect.top + top)
        }
      window.addEventListener("resize", updateSize);
      updateSize();
      return () => window.removeEventListener("resize", updateSize);
  }, []);

    const [width, height] = size;

    const drawingPoints = useMemo(() => {
        return scopeRows.map((p, i) => {
            // if (deletedIndices?.includes(i)) {
            if(p.deleted){
                return [-10, -10, mapSelectionKey.hidden]
            } else if (intersectedIndices?.includes(i)) {
                return [p.x, p.y, mapSelectionKey.selected]
            } else if(intersectedIndices?.length) {
                return [p.x, p.y, mapSelectionKey.notSelected]
            } else {
                return [p.x, p.y, mapSelectionKey.normal]
            }
        })
    }, [scopeRows, intersectedIndices])

    const points = useMemo(() => {
        return scopeRows.filter((p) => !p.deleted).map((p) => {
            return [p.x, p.y]
        })
    }, [scopeRows])

    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    useEffect(() => {
        if(hovered) {
            // console.log("hovered", hovered, scopeRows[hovered.index])
            const point = scopeRows[hovered.index]
            if (point && xDomain && yDomain) {
                let px = point.x
                if(px < xDomain[0]) px = xDomain[0]
                if(px > xDomain[1]) px = xDomain[1]
                let py = point.y
                if(py < yDomain[0]) py = yDomain[0]
                if(py > yDomain[1]) py = yDomain[1]
                const xPos = ((px - xDomain[0]) / (xDomain[1] - xDomain[0])) * width + 19;
                const yPos = ((py - yDomain[1]) / (yDomain[0] - yDomain[1])) * (size[1]) + umapOffset - 28
                // console.log("xPos", xPos, "yPos", yPos)
                setTooltipPosition({ 
                  x: xPos,
                  y: yPos
                });
              }
        }
    }, [hovered, scopeRows, xDomain, yDomain, width, size, umapOffset])

    // derive the hulls from the scope rows, and filter deleted points via an accessor
    const clusterHulls = useMemo(() => {
        if(!slide || !scopeRows) return []
        return processHulls([slide], scopeRows, d => d.deleted ? null : [d.x, d.y])
    }, [slide, scopeRows])

    const hoveredHulls = useMemo(() => {
        if(!hoveredCluster || !scopeRows) return []
        return processHulls([hoveredCluster], scopeRows, d => d.deleted ? null : [d?.x, d?.y])
    }, [hoveredCluster, scopeRows])

    return (
        <div className="umap-container" ref={umapRef}>
            <div className="scatters" style={{ width, height }}>
                {!isIOS() && scope ? (
                    <Scatter
                        points={drawingPoints}
                        duration={2000}
                        width={width}
                        height={height}
                        colorScaleType="categorical"
                        colorRange={mapSelectionColorsLight}
                        colorDomain={mapSelectionDomain}
                        opacityRange={mapSelectionOpacity}
                        pointSizeRange={mapPointSizeRange}
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

              {hoveredCluster &&
                  hoveredCluster.hull &&
                  !scope.ignore_hulls &&
                  scope.cluster_labels_lookup && (
                      <HullPlot
                        hulls={hoveredHulls}
                        fill="lightgray"
                        stroke="gray"
                        strokeWidth={2}
                        opacity={0.25}
                        duration={0}
                        xDomain={xDomain}
                        yDomain={yDomain}
                        width={width}
                        height={height}
                      />
                  )}

              {slide &&
                  slide.hull &&
                  !scope.ignore_hulls &&
                  scope.cluster_labels_lookup && (
                      <HullPlot
                        hulls={clusterHulls}
                        fill="darkgray"
                        stroke="gray"
                        strokeWidth={2}
                        opacity={0.35}
                        duration={0}
                        xDomain={xDomain}
                        yDomain={yDomain}
                        width={width}
                        height={height}
                      />
                  )}

              {/* show all the hulls */}
              {/* {hulls.length && !scope.ignore_hulls && (
                  <HullPlot
                      hulls={hulls}
                        stroke="#9d9d9d"
                      fill="none"
                      duration={200}
                      strokeWidth={1}
                      xDomain={xDomain}
                      yDomain={yDomain}
                      width={width}
                      height={height}
                  />
              )} */}

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
          </div>

          {/* Hover information display */}
          {hovered&& <div
            data-tooltip-id="featureTooltip"
            style={{
                position: 'absolute',
                left: tooltipPosition.x,
                top: tooltipPosition.y,
                pointerEvents: 'none',
            }}
            ></div> }
            {hovered && <Tooltip id="featureTooltip" 
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
                    maxWidth: "400px",
                    backgroundColor: hovered?.ls_search_index >= 0 ? "#111" : "#666"
                }}
            >
                <div className="tooltip-content">
                    {/* {hovered.ls_search_index >= 0 ? <span>Search: #{hovered.ls_search_index + 1}<br/></span> : null} */}
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
            </Tooltip> }

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
    hulls: PropTypes.array.isRequired,
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
