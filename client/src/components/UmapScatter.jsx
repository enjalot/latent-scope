import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Scatter from './Scatter';

UmapScatter.propTypes = {
  dataset: PropTypes.object.isRequired,
  umap: PropTypes.object,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onScatter: PropTypes.func,
  onSelect: PropTypes.func,
}

function UmapScatter({dataset, umap, width, height, onScatter, onView, onSelect, onHover}) {
  // ====================================================================================================
  // Points for rendering the scatterplot
  // ====================================================================================================
  const [points, setPoints] = useState([]);
  // const [loadingPoints, setLoadingPoints] = useState(false);
  useEffect(() => {
    if(umap) {
      fetch(`http://localhost:5001/datasets/${dataset.id}/umaps/${umap.name}/points`)
        .then(response => response.json())
        .then(data => {
          // console.log("umap points", data)
          setPoints(data.map(d => [d.x, d.y]))
        })
    } else {
      setPoints([])
    }
  }, [dataset, umap])

  return (
    <div>
      <Scatter 
        points={points} 
        width={width} 
        height={height}
        onScatter={onScatter}
        onView={onView} 
        onSelect={onSelect}
        onHover={onHover}
        />
    </div>
  )
}
export default UmapScatter;