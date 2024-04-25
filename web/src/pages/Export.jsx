import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

import styles from './Export.module.css';

function niceBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"]
  let i = 0;
  while (bytes > 1024) {
    bytes = bytes / 1024;
    i++;
  }
  return `${bytes.toFixed(0)}${units[i]}`;
}

function Export() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams(); 

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(setDataset)
      .catch(console.error);
  }, [datasetId, setDataset]);

  const [scope, setScope] = useState(null);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
      .then(response => response.json())
      .then(data => {
        console.log("scope", data)
        setScope(data)
      })
      .catch(console.error);
  }, [datasetId, scopeId, setScope]);


  const [datasetFiles, setDatasetFiles] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/export/list`)
      .then(response => response.json())
      .then(data => {
        console.log("export list", data)
        setDatasetFiles(data)
      })
      .catch(console.error);
  }, [datasetId]);


  const fileLink = useCallback((d,i) => {
    return <li key={i}>
      <a href={`${apiUrl}/files/${datasetId}/${d[2]}`}>{d[0]}</a>
      <span className={styles["size"]}>{niceBytes(d[4])}</span>
      <span className={styles["path"]}>{d[3]}</span>
      </li>
  }, [datasetId])
  

  return (
    <div className={styles["page"]}>
      <div className={styles["header"]}>
        <h2>Export Data for {dataset?.id} {scopeId}</h2>
        <Link to={`/datasets/${datasetId}/setup/${scopeId}`}>Setup {dataset?.id} {scopeId}</Link>
        {scopeId ? <Link to={`/datasets/${datasetId}/explore/${scopeId}`}>Explore {dataset?.id} {scopeId}</Link> : null }
      </div>
      <div className={styles["scope-files"]}>
        <h3>Scope {scopeId}</h3>
        <p className={styles["description"]}>These files combine the data from each step into a single parquet (x,y from UMAP, cluster and label from clustering and labeling) and the metadata into a single JSON.</p>
        <ul>
          {datasetFiles.filter(d => d[0].indexOf(scopeId) == 0 && d[0].indexOf("transactions") < 0).map(fileLink)}
        </ul>
      </div>
      <div className={styles["dataset-files"]}>
        <h3>Dataset</h3>
        <ul>
          {datasetFiles.filter(d => d[1] == ".").map(fileLink)}
        </ul>
        <h3>Embeddings</h3>
        <ul>
          {datasetFiles.filter(d => d[1] == "embeddings").map(fileLink)}
        </ul>
        <h3>Umaps</h3>
        <ul>
          {datasetFiles.filter(d => d[1] == "umaps").map(fileLink)}
        </ul>
        <h3>Clusters</h3>
        <ul>
          {datasetFiles.filter(d => d[1] == "clusters").map(fileLink)}
        </ul>
        <h3>Scopes</h3>
        <ul>
          {datasetFiles.filter(d => d[1] == "scopes").map(fileLink)}
        </ul>
        <h3>tags</h3>
        <ul>
          {datasetFiles.filter(d => d[1] == "tags").map(fileLink)}
        </ul>
      </div>

    </div>
  );
}

export default Export;
