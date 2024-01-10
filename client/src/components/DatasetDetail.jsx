import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetDetail.css';
import DatasetUmaps from './DatasetUmaps';
import DataTable from './DataTable';


function DatasetDetail() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset meta", data)
        setDataset(data)
      });
  }, [datasetId]);

  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`http://localhost:5001/tags?dataset=${datasetId}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [datasetId])
  const tags = useMemo(() => {
    const tags = []
    for (const tag in tagset) {
      tags.push(tag)
    }
    console.log("tagset", tagset)
    return tags
  }, [tagset])

  const [distances, setDistances] = useState([]);
  const [indices, setIndices] = useState([]);
  const searchQuery = (query) => {
    fetch(`http://localhost:5001/nn?dataset=${datasetId}&query=${query}`)
      .then(response => response.json())
      .then(data => {
        console.log("search", data)
        setDistances(data.distances);
        setIndices(data.indices);
      });
  };

  const [neighbors, setNeighbors] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/indexed?dataset=${datasetId}&indices=${JSON.stringify(indices)}`)
      .then(response => response.json())
      .then(data => {
        if(!dataset) return;
        console.log("neighbors", data)
        const text_column = dataset["embeddings.json"].text_column
        let ns = data.map((row, index) => {
          return {
            index: indices[index],
            text: row[text_column],
            score: row.score, // TODO: this is custom to one dataset
            distance: distances[index],
            date: row.date,
          }
        })
        ns.sort((a, b) => b.score - a.score)
        setNeighbors(ns)
      })
  }, [indices, datasetId, dataset, distances])

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--details">
      <h1>Dataset: {datasetId}</h1>
      <div className="dataset--details-summary">
        Rows: {dataset["embeddings.json"].shape[0]}<br/>
        Model: {dataset["embeddings.json"].model}<br/>
        Tags: {tags.map(t => {
          const href = `/datasets/${datasetId}/tag/${t}`
          return <a className="dataset--tag-link" key={t} href={href}>{t}({tagset[t].length})</a>
        })}
        <form onSubmit={(e) => {
          e.preventDefault();
          const newTag = e.target.elements.newTag.value;
          fetch(`http://localhost:5001/tags/new?dataset=${datasetId}&tag=${newTag}`)
            .then(response => response.json())
            .then(data => {
              console.log("new tag", data)
              setTagset(data);
            });
        }}>
          <input type="text" id="newTag" />
          <button type="submit">New Tag</button>
        </form>
        <br/>
      </div>
      
      <div className="dataset--neighbors">
        <form onSubmit={(e) => {
          e.preventDefault();
          searchQuery(e.target.elements.searchBox.value);
        }}>
          <input type="text" id="searchBox" />
          <button type="submit">Similarity Search</button>
        </form>

        <DataTable data={neighbors} tagset={tagset} datasetId={datasetId} onTagset={(data) => setTagset(data)} />

      </div>


      <hr></hr>
      <h2> UMAP experiments</h2>
      <DatasetUmaps dataset={dataset} datasetId={datasetId} />
      
    </div>
  );
}

export default DatasetDetail;
