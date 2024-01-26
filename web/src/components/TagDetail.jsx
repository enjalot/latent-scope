import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
const apiUrl = import.meta.env.VITE_API_URL

import DataTable from './DataTable';


function TagDetail() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();
  const { tag: tagId } = useParams();

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => setDataset(data));
  }, [datasetId]);

  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`${apiUrl}/tags?dataset=${datasetId}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [datasetId])

  const tags = useMemo(() => {
    const tags = []
    for (const tag in tagset) {
      tags.push(tag)
    }
    return tags
  }, [tagset])

  const [tagrows, setTagrows] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/tags/rows?dataset=${datasetId}&tag=${tagId}`)
      .then(response => response.json())
      .then(data => setTagrows(data));
  }, [datasetId, tagId])


  if (!dataset) return <div>Loading...</div>;
  const datasetUrl = "/datasets/" + datasetId

  return (
    <div className="dataset--details">
      <h2>Dataset: <a href={datasetUrl}>{datasetId}</a></h2>
      <div className="dataset--details-summary">
        Rows: {dataset.shape[0]}<br/>
        Model: {dataset.model}<br/>
        Tags: {tags.map(t => {
          const href = `/datasets/${datasetId}/tag/${t}`
          return <a className="dataset--tag-link" key={t} href={href}>{t}({tagset[t].length})</a>
        })}<br/>
      </div>
      
      <h1>{tagId}</h1>
      <div className="dataset--taglist">
        <DataTable data={tagrows} tagset={tagset} datasetId={datasetId} onTagset={(data) => setTagset(data)} />
      </div>
    </div>
  );
}

export default TagDetail;