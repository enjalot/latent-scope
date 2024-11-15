import React from 'react';

export default function ClusterFilter({
    clusterLabels,
    slide,
    slideAnnotations,
    setSlide,
    clusterLabel,
    setClusterLabel,
    handleLabelUpdate,
    newClusterLabel,
    setNewClusterLabel,
    handleNewCluster
}) {
  const handleSlideChange = (e) => {
    if (e.target.value === '-1') {
      setSlide(null);
      return;
    }
    const cl = clusterLabels.find((cluster) => cluster.cluster === +e.target.value);
    if (cl) setSlide(cl);
  };

  return (
    <div className={`clusters-select filter-row ${slideAnnotations.length ? 'active' : ''}`}>
      <div className="filter-cell left">
        <select onChange={handleSlideChange} value={slide?.cluster >= 0 ? slide.cluster : -1}>
          <option value="-1">Filter by cluster</option>
          {clusterLabels?.map((cluster, index) => (
            <option key={index} value={cluster.cluster}>
              {cluster.cluster}: {cluster.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-cell middle">
        {slideAnnotations.length ? (
          <span>
            {slideAnnotations.length} rows
            <button className="deselect" onClick={() => setSlide(null)}>
              X
            </button>
          </span>
        ) : null}
      </div>
      {/* <div className="filter-cell right">
                {slide ? (
                    <form onSubmit={handleUpdateLabelSubmit}>
                        <input
                            className="update-cluster-label"
                            type="text"
                            id="update-label"
                            value={clusterLabel}
                            onChange={(e) => setClusterLabel(e.target.value)}
                        />
                        <button type="submit">✍️</button>
                    </form>
                ) : (
                    <form onSubmit={handleNewLabelSubmit}>
                        <input
                            type="text"
                            id="new-label"
                            name="new-label"
                            className="new-cluster-label"
                            value={newClusterLabel}
                            onChange={(e) => setNewClusterLabel(e.target.value)}
                            placeholder="New Cluster"
                        />
                        <button type="submit">➕️ Cluster</button>
                    </form>
                )}
            </div> */}
    </div>
  );
}