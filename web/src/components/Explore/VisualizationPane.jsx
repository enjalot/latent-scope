import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Scatter from "../Scatter";
import AnnotationPlot from "../AnnotationPlot";
import HullPlot from "../HullPlot";
import { processHulls, isMobileDevice } from "../../utils";

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

function VisualizationPane({
    points,
    drawPoints,
    hulls,
    hoverAnnotations,
    intersectedAnnotations,
    hoveredCluster,
    slide,
    scope,
    inputToScopeIndexMap,
    onScatter,
    onSelect,
    onHover,
    hovered,
    dataset,
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

    // let's fill the container and update the width and height if window resizes
    useEffect(() => {
        function updateSize() {
            if (!containerRef.current) return;
            const { width } = containerRef.current.getBoundingClientRect();
            let swidth = width > 500 ? 500 : width - 50;
            setSize([swidth, swidth]);
        }
      window.addEventListener("resize", updateSize);
      updateSize();
      return () => window.removeEventListener("resize", updateSize);
  }, []);

    const [width, height] = size;

    return (
        <div className="umap-container">
            <div className="scatters" style={{ width, height }}>
                {!isIOS() && scope ? (
                    <Scatter
                        points={drawPoints}
                        duration={2000}
                        width={width}
                        height={height}
                        colorScaleType="categorical"
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
                          hulls={processHulls(
                              [hoveredCluster],
                              points,
                              inputToScopeIndexMap,
                          )}
                          fill="lightgray"
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
                          hulls={processHulls([slide], points, inputToScopeIndexMap)}
                          fill="darkgray"
                          strokeWidth={2}
                          duration={0}
                          xDomain={xDomain}
                          yDomain={yDomain}
                          width={width}
                          height={height}
                      />
                  )}

              {hulls.length && !scope.ignore_hulls && (
                  <HullPlot
                      hulls={hulls}
                      stroke="black"
                      fill="none"
                      duration={200}
                      strokeWidth={1}
                      xDomain={xDomain}
                      yDomain={yDomain}
                      width={width}
                      height={height}
                  />
              )}

              <AnnotationPlot
                  points={intersectedAnnotations}
                  stroke="black"
                  fill="steelblue"
                  size="8"
                  xDomain={xDomain}
                  yDomain={yDomain}
                  width={width}
                  height={height}
              />

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
          {!isMobileDevice() && (
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
          )}
      </div>
  );
}

VisualizationPane.propTypes = {
    points: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
    drawPoints: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
    hulls: PropTypes.array.isRequired,
    hoverAnnotations: PropTypes.array.isRequired,
    intersectedAnnotations: PropTypes.array.isRequired,
    hoveredCluster: PropTypes.object,
    slide: PropTypes.object,
    scope: PropTypes.object,
    inputToScopeIndexMap: PropTypes.object.isRequired,
    onScatter: PropTypes.func.isRequired,
    onView: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    onHover: PropTypes.func.isRequired,
    hovered: PropTypes.object,
    dataset: PropTypes.object.isRequired,
    containerRef: PropTypes.object.isRequired,
};

export default VisualizationPane;
