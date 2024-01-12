import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetDetail.css';
import DatasetUmaps from './DatasetUmaps';
import DataTable from './DataTable';
import Scatter from './Scatter';

import { instantiate } from '../lib/DuckDB'


// TODO: decide how to deal with sizing
const scopeWidth = 640
const scopeHeight = 640


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

  const [points, setPoints] = useState([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  useEffect(() => {
    if(dataset?.active_umap) {
      fetch(`http://localhost:5001/files/${dataset.id}/umaps/${dataset.active_umap}.parquet`)
        .then(response => response.arrayBuffer())
        .then(async buffer => {
          setLoadingPoints(true)
          const db = await instantiate()
          const uint8 = new Uint8Array(buffer)
          const name = dataset.active_umap
          await db.registerFileBuffer(name, uint8);
          const conn = await db.connect();
          await conn.query(
            `CREATE VIEW '${name}' AS SELECT * FROM parquet_scan('${name}')`
          );
          const results = await conn.query(`SELECT * FROM '${name}'`);
          // await conn.close();
          // let rows = results.toArray().map(Object.fromEntries);
          // rows.columns = results.schema.fields.map((d) => d.name);
          let rows = results.toArray().map(d => [d.x, d.y])
          setPoints(rows);
          setLoadingPoints(false)
        })
        .catch(err => console.log(err))
    }
  }, [dataset]);

  const [neighbors, setNeighbors] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/indexed?dataset=${datasetId}&indices=${JSON.stringify(indices)}`)
      .then(response => response.json())
      .then(data => {
        if(!dataset) return;
        console.log("neighbors", data)
        const text_column = dataset.text_column
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

  const handleActivateUmap = useCallback((umap) => {
    fetch(`http://localhost:5001/datasets/${datasetId}/umaps/activate?umap=${umap.name}`)
      .then(response => response.json())
      .then(data => {
        console.log("activated umap", umap, data)
        setDataset(data);
      });
  })

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--details">
      <h1>Dataset: {datasetId}</h1>
      <div className="dataset--details-summary">
        Rows: {dataset.shape[0]}<br/>
        Embedding Model: {dataset.model}<br/>
        Active UMAP: {dataset.active_umap}<br/>
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

      <div className="dataset--scatter">
        <canvas style={{ position: 'absolute', pointerEvents: 'none' }} width={scopeWidth} height={scopeHeight} />
        <Scatter points={points} loading={loadingPoints} width={scopeWidth} height={scopeHeight} />
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
      <DatasetUmaps dataset={dataset} datasetId={datasetId} onActivateUmap={handleActivateUmap} />
      
    </div>
  );
}

export default DatasetDetail;
