<div className="umap-container">
    {/* <div className="umap-container"> */}
    <div className="scatters" style={{ width: scopeWidth, height: scopeHeight }}>
        {points.length ? <>
            {!isIOS() && scope ? <Scatter
                points={drawPoints}
                duration={2000}
                width={scopeWidth}
                height={scopeHeight}
                colorScaleType="categorical"
                onScatter={setScatter}
                onView={handleView}
                onSelect={handleSelected}
                onHover={handleHover}
            /> : <AnnotationPlot
                points={points}
                fill="gray"
                size="8"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
            />}

            {hoveredCluster && hoveredCluster.hull && !scope.ignore_hulls && scope.cluster_labels_lookup ? <HullPlot
                hulls={processHulls([hoveredCluster], points, inputToScopeIndexMap)}
                fill="lightgray"
                duration={0}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}

            {slide && slide.hull && !scope.ignore_hulls && scope.cluster_labels_lookup ? <HullPlot
                hulls={processHulls([slide], points, inputToScopeIndexMap)}
                fill="darkgray"
                strokeWidth={2}
                duration={0}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}

            {hulls.length && !scope.ignore_hulls ? <HullPlot
                hulls={hulls}
                stroke="black"
                fill="none"
                delay={delay}
                duration={200}
                strokeWidth={1}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}

            <AnnotationPlot
                points={intersectedAnnotations}
                stroke="black"
                fill="steelblue"
                size="8"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
            />

            <AnnotationPlot
                points={hoverAnnotations}
                stroke="black"
                fill="orange"
                size="16"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
            />

        </> : null}

        {/* </div> */}
    </div>
    {!isMobileDevice() ? <div className="hovered-point">
        {hoveredCluster ? <span><span className="key">Cluster {hoveredCluster.cluster}:</span><span className="value">{hoveredCluster.label}</span></span> : null}
        {hovered && Object.keys(hovered).map((key, idx) => {
            let d = hovered[key]
            if (typeof d === 'object' && !Array.isArray(d)) {
                d = JSON.stringify(d)
            }
            let meta = dataset.column_metadata && dataset.column_metadata[key]
            let value;
            if (meta && meta.image) {
                value = <span className="value" key={idx}><img src={d} alt={key} height={64} /></span>
            } else if (meta && meta.url) {
                value = <span className="value" key={idx}><a href={d}>url</a></span>
            } else if (meta && meta.type == "array") {
                value = <span className="value" key={idx}>[{d.length}]</span>
            } else {
                value = <span className="value" key={idx}>{d}</span>
            }
            return (
                <span key={key}>
                    <span className="key">{key}:</span>
                    {value}
                </span>
            )
        })}
    </div> : null}
</div>
      </div >