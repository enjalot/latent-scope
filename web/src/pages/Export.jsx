import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import SubNav from '../components/SubNav';
import { apiService, apiUrl } from '../lib/apiService';
import HFUpload from '../components/HFUpload';

import styles from './Export.module.css';

function niceBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes > 1024) {
    bytes = bytes / 1024;
    i++;
  }
  return `${bytes.toFixed(0)}${units[i]}`;
}

function Export() {
  const [dataset, setDataset] = useState(null);
  const [scopes, setScopes] = useState([]);
  const navigate = useNavigate();
  const { dataset: datasetId, scope: scopeId } = useParams();

  const [hasHFKey, setHasHFKey] = useState(false);

  useEffect(() => {
    apiService.fetchDataset(datasetId).then(setDataset).catch(console.error);
  }, [datasetId, setDataset]);

  const [scope, setScope] = useState(null);
  useEffect(() => {
    apiService.fetchScope(datasetId, scopeId).then(setScope).catch(console.error);
  }, [datasetId, scopeId, setScope]);

  const [datasetFiles, setDatasetFiles] = useState([]);
  useEffect(() => {
    apiService.fetchExportList(datasetId).then(setDatasetFiles).catch(console.error);
  }, [datasetId]);

  useEffect(() => {
    apiService.fetchScopes(datasetId).then(setScopes);
  }, [datasetId]);

  useEffect(() => {
    apiService.fetchSettings().then((settings) => {
      console.log('settings', settings);
      setHasHFKey(settings.api_keys.indexOf('HUGGINGFACE_TOKEN') >= 0);
    });
  }, []);

  const scopeFiles = useMemo(() => {
    return datasetFiles.filter(
      (d) => d[0].indexOf(scopeId) == 0 && d[0].indexOf('transactions') < 0
    );
  }, [datasetFiles, scopeId]);

  const scopeSubFiles = useMemo(() => {
    console.log('datasetfiles', datasetFiles, scope);
    if (!datasetFiles?.length || !scope) return [];
    let files = {
      embeddings: datasetFiles.filter((d) => d[0].indexOf(scope.embedding_id) >= 0),
      umaps: datasetFiles.filter((d) => d[0].indexOf(scope.umap_id) >= 0),
      clusters: datasetFiles.filter((d) => d[0].indexOf(scope.cluster_id) >= 0),
    };
    console.log('files', files);
    return files;
  }, [scope, datasetFiles]);

  const hasLance = useMemo(() => {
    return datasetFiles.find(
      (d) => d[1].indexOf('lancedb') == 0 && d[1].indexOf(scopeId) >= 0 && d[1].indexOf('/data') > 0
    );
  }, [datasetFiles, scopeId]);

  const fileLink = useCallback(
    (d, i) => {
      return (
        <li key={i}>
          <a href={`${apiUrl}/files/${datasetId}/${d[2]}`}>{d[0]}</a>
          <span className={styles['size']}>{niceBytes(d[4])}</span>
          <span className={styles['path']}>{d[3]}</span>
        </li>
      );
    },
    [datasetId]
  );

  const navigateToScope = (e) => {
    navigate(`/datasets/${datasetId}/export/${e.target.value}`);
  };

  return (
    <div className={styles['page']}>
      <SubNav dataset={dataset} scope={scope} scopes={scopes} onScopeChange={navigateToScope} />
      <div className={styles['content']}>
        <div className={styles['header']}>
          <h2>
            Export Data for {dataset?.id} {scopeId}
          </h2>
          <p>
            {hasHFKey ? (
              <div>
                <HFUpload dataset={dataset} scope={scope} />
              </div>
            ) : (
              <div>
                <Link to="/settings">Setup Hugging Face API Key</Link>
              </div>
            )}
          </p>
        </div>
        <div className={styles['scope-files']}>
          <h3>Scope {scopeId}</h3>
          <p className={styles['description']}>
            These files combine the data from each step into a single parquet (x,y from UMAP,
            cluster and label from clustering and labeling) and the metadata into a single JSON.
          </p>
          <ul>{scopeFiles.map(fileLink)}</ul>
        </div>
        {scopeId ? (
          <div className={styles['code-snippets']}>
            <h3>Python code snippets</h3>
            <p className={styles['description']}>Load the data and embeddings in python.</p>
            {/* prettier-ignore */}
            <code>
            import h5py<br/>
            import numpy as np<br/>
            import pandas as pd<br/>
            <br/>
            df = pd.read_parquet({scopeFiles[1]?.[3]})<br/>
            with h5py.File({scopeSubFiles.embeddings?.[0]?.[3]}, 'r') as emb_file:<br/>
            &nbsp;&nbsp;embeddings = np.array(emb_file["embeddings"])<br/>
            </code>

            {hasLance ? (
              <div className={styles['code-snippet']}>
                <p className={styles['description']}>Query using LanceDB</p>
                <code>
                  import lancedb
                  <br />
                  db = lancedb.connect("{hasLance[3].split('/scopes')[0]}")
                  <br />
                  table = db.open_table("{scopeId}")
                  <br />
                  results = table.search(query).metric("cosine").limit(10).to_list()
                </code>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={styles['dataset-files']}>
          <h3>Dataset</h3>
          <ul>{datasetFiles.filter((d) => d[1] == '.').map(fileLink)}</ul>
          <h3>Embeddings</h3>
          <ul>{datasetFiles.filter((d) => d[1] == 'embeddings').map(fileLink)}</ul>
          <h3>Umaps</h3>
          <ul>{datasetFiles.filter((d) => d[1] == 'umaps').map(fileLink)}</ul>
          <h3>Clusters</h3>
          <ul>{datasetFiles.filter((d) => d[1] == 'clusters').map(fileLink)}</ul>
          <h3>Scopes</h3>
          <ul>{datasetFiles.filter((d) => d[1] == 'scopes').map(fileLink)}</ul>
          <h3>tags</h3>
          <ul>{datasetFiles.filter((d) => d[1] == 'tags').map(fileLink)}</ul>
        </div>
      </div>
    </div>
  );
}

export default Export;
