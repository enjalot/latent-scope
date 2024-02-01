import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Scatter from './Scatter';
const apiUrl = import.meta.env.VITE_API_URL

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
      fetch(`${apiUrl}/datasets/${dataset.id}/umaps/${umap.id}/points`)
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
    <div style={{ width: `${width}px`, height: `${height}px`}}>
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