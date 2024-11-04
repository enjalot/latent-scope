import PropTypes from 'prop-types';
import Scatter from '../Scatter';
import AnnotationPlot from '../AnnotationPlot';
import HullPlot from '../HullPlot';

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function VisualizationPane({
    points,
    drawPoints,
    hulls,
    selectedIndices,
    hoveredIndex,
    hoverAnnotations,
    intersectedAnnotations,
    hoveredCluster,
    slide,
    scope,
    xDomain = [-1, 1],
    yDomain = [-1, 1],
    width,
    height,
    inputToScopeIndexMap,
    onScatter,
    onView,
    onSelect,
    onHover,
    hovered,
    dataset
}) {
    if (!points.length) return null;

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
                        onView={onView}
                        onSelect={onSelect}
                        onHover={onHover}
                    />
                ) : (
                    <AnnotationPlot
                        points={points}
                        fill="gray"
                        size="8"
                        xDomain={xDomain}
                        yDomain={yDomain}
                        width={width}
                        height={height}
                    />
                )}

                {hoveredCluster && hoveredCluster.hull && !scope.ignore_hulls && scope.cluster_labels_lookup && (
                    <HullPlot
                        hulls={[hoveredCluster].map(cluster => ({
                            ...cluster,
                            hull: cluster.hull.map(i => points[inputToScopeIndexMap[i]])
                        }))}
                        fill="lightgray"
                        duration={0}
                        xDomain={xDomain}
                        yDomain={yDomain}
                        width={width}
                        height={height}
                    />
                )}

                {slide && slide.hull && !scope.ignore_hulls && scope.cluster_labels_lookup && (
                    <HullPlot
                        hulls={[slide].map(cluster => ({
                            ...cluster,
                            hull: cluster.hull.map(i => points[inputToScopeIndexMap[i]])
                        }))}
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
            <div className="hovered-point">
                {hoveredCluster && (
                    <span>
                        <span className="key">Cluster {hoveredCluster.cluster}:</span>
                        <span className="value">{hoveredCluster.label}</span>
                    </span>
                )}
                {hovered && Object.keys(hovered).map((key, idx) => {
                    let d = hovered[key];
                    if (typeof d === 'object' && !Array.isArray(d)) {
                        d = JSON.stringify(d);
                    }
                    let meta = dataset.column_metadata && dataset.column_metadata[key];
                    let value;
                    if (meta && meta.image) {
                        value = <span className="value" key={idx}><img src={d} alt={key} height={64} /></span>;
                    } else if (meta && meta.url) {
                        value = <span className="value" key={idx}><a href={d}>url</a></span>;
                    } else if (meta && meta.type == "array") {
                        value = <span className="value" key={idx}>[{d.length}]</span>;
                    } else {
                        value = <span className="value" key={idx}>{d}</span>;
                    }
                    return (
                        <span key={key}>
                            <span className="key">{key}:</span>
                            {value}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

VisualizationPane.propTypes = {
    points: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
    drawPoints: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
    hulls: PropTypes.array.isRequired,
    selectedIndices: PropTypes.array.isRequired,
    hoveredIndex: PropTypes.number,
    hoverAnnotations: PropTypes.array.isRequired,
    intersectedAnnotations: PropTypes.array.isRequired,
    hoveredCluster: PropTypes.object,
    slide: PropTypes.object,
    scope: PropTypes.object,
    xDomain: PropTypes.arrayOf(PropTypes.number).isRequired,
    yDomain: PropTypes.arrayOf(PropTypes.number).isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    inputToScopeIndexMap: PropTypes.object.isRequired,
    onScatter: PropTypes.func.isRequired,
    onView: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    onHover: PropTypes.func.isRequired,
    hovered: PropTypes.object,
    dataset: PropTypes.object.isRequired
};

export default VisualizationPane;