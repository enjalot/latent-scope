// NewEmbedding.jsx
import { useState, useEffect, useCallback, useMemo} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';
import { Button } from 'react-element-forge';
import { compareVersions } from 'compare-versions';
import { apiService, apiUrl } from '../../lib/apiService';
import { useSetup } from '../../contexts/SetupContext';

import styles from './Scope.module.scss';


function Scope() {
  const { dataset, scope, savedScope, setPreviewLabel } = useSetup();

  const navigate = useNavigate();

  const [scopeJob, setScopeJob] = useState(null);
  const { startJob: startScopeJob} = useStartJobPolling(dataset, setScopeJob, `${apiUrl}/jobs/scope`);
  const { startJob: startDeleteScopeJob} = useStartJobPolling(dataset, setScopeJob, `${apiUrl}/jobs/delete/scope`);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');

  const [embedding, setEmbedding] = useState(null);
  const [umap, setUmap] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [clusterLabelSet, setClusterLabelSet] = useState(null);

  const [savedEmbedding, setSavedEmbedding] = useState(null);
  const [savedUmap, setSavedUmap] = useState(null);
  const [savedCluster, setSavedCluster] = useState(null);
  const [savedClusterLabelSet, setSavedClusterLabelSet] = useState(null);

  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [clusterLabelSets, setClusterLabelSets] = useState([]);
  const [scopes, setScopes] = useState([]);

  useEffect(() => {
    if(scope && scope.id) {
      setPreviewLabel(scope.id)
    } else {
      setPreviewLabel(null)
    }
  }, [scope, setPreviewLabel])

  const [lsVersion, setLsVersion] = useState(null);
  // Fetch initial data
  useEffect(() => {
    if(dataset) {
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchUmaps(dataset?.id).then(umaps => setUmaps(umaps))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
      apiService.fetchVersion().then(setLsVersion)
    }
  }, [dataset])

  useEffect(() => {   
    if(dataset && scope?.cluster_id) {
      apiService.fetchClusterLabelsAvailable(dataset?.id, scope?.cluster_id).then(cls => setClusterLabelSets(cls))
    }
  }, [dataset,scope])

  // Set initial input values based on scope prop
  useEffect(() => {
    if (scope) {
      console.log("setting SCOPE", scope)
      setLabel(scope.label);
      setDescription(scope.description);
      if(scope.embedding_id) {
        const emb = embeddings.find(e => e.id == scope.embedding_id)
        setEmbedding(emb)
      }
      if(scope.umap_id) {
        const um = umaps.find(u => u.id == scope.umap_id)
        setUmap(um)
      }
      if(scope.cluster_id) {
        const cl = clusters.find(c => c.id == scope.cluster_id)
        setCluster(cl)
      }
      if(scope.cluster_labels_id) {
        const cls = clusterLabelSets.find(c => c.id == scope.cluster_labels_id)
        console.log("cls", cls, clusterLabelSets)
        setClusterLabelSet(cls || { id: scope.cluster_labels_id, model_id: "N/A" })
      }
    }
  }, [scope, embeddings, umaps, clusters, clusterLabelSets]);
  useEffect(() => {
    if (savedScope) {
      if(savedScope.embedding_id) {
        const emb = embeddings.find(e => e.id == savedScope.embedding_id)
        setSavedEmbedding(emb)
      }
      if(savedScope.umap_id) {
        const um = umaps.find(u => u.id == savedScope.umap_id)
        setSavedUmap(um)
      }
      if(savedScope.cluster_id) {
        const cl = clusters.find(c => c.id == savedScope.cluster_id)
        setSavedCluster(cl)
      }
      if(savedScope.cluster_labels_id) {
        const cls = clusterLabelSets.find(c => c.id == savedScope.cluster_labels_id)
        console.log("saved cls", cls, clusterLabelSets)
        setSavedClusterLabelSet(cls)
      }
    }
  }, [savedScope, embeddings, umaps, clusters, clusterLabelSets]);

  useEffect(() => {
    if(dataset) {
      console.log("fetching scopes")
      apiService.fetchScopes(dataset.id).then(scopes => {
        setScopes(scopes)
      })
    }
  }, [dataset]);



  useEffect(() => {
    if(scopeJob?.status == "completed") {
      console.log("completed", scopeJob)
      // fetchScopes(dataset.id, onNew)
      // fetchScopes(dataset.id, (scopes) => {
      //   setScopeJob(null)
      //   onNew(scopes)
      //   onChange(scopes.find(d => d.id == scopeJob.run_id))
      //   navigate(`/datasets/${dataset.id}/setup/${scopeJob.run_id}`);
      // })
    }
  }, [scopeJob, dataset]);


  const handleSaveScope = useCallback((event) => {
    event.preventDefault();
    if(!umap || !cluster) return;
    const form = event.target;
    const data = new FormData(form);
    const action = data.get('action')

    if(action == "description") {
      console.log("update the description")
      apiService.updateScopeLabelDescription(dataset.id, scope.id, data.get('label'), data.get('description')).then(data => {
        console.log("updated description", data)
        apiService.fetchScopes(dataset.id).then(scopes => {
          setScopes(scopes)
        })
      }).catch(error => {
        console.error('Error updating description:', error);
      });
      return;
    }

    const payload = {
      embedding_id: embedding.id,
      umap_id: umap.id,
      cluster_id: cluster.id,
      cluster_labels_id: clusterLabelSet.id,
      label: data.get('label'),
      description: data.get('description')
    };
    if(scope.sae_id) {
      payload.sae_id = scope.sae_id
    }

    console.log("action", action)
    if(action == "save") {
      payload.scope_id = scope.id
    }
    startScopeJob(payload)

  }, [dataset, scope, cluster, clusterLabelSet, umap, embedding, startScopeJob]);

  const [isDifferent, setIsDifferent] = useState(false);
  const descriptionIsDifferent = useMemo(() => 
    savedScope?.label !== label || savedScope?.description !== description
  , [savedScope, label, description]);

  const [newVersion, setNewVersion] = useState(false);
  useEffect(() => {
    console.log("VERSIONS", lsVersion, savedScope?.ls_version, scope?.ls_version)
    if(lsVersion && savedScope?.ls_version && compareVersions(savedScope?.ls_version, lsVersion) < 0) {
      setNewVersion(true)
    }
  }, [lsVersion, savedScope])

  useEffect(() => {
    if(!scope) {
      setIsDifferent(true);
    } else {
      if(scope.embedding_id != savedScope?.embedding_id
        || scope.umap_id != savedScope?.umap_id
        || scope.cluster_id != savedScope?.cluster_id
        || scope.cluster_labels_id != savedScope?.cluster_labels_id
        || scope.sae_id != savedScope?.sae_id
      ) {
        setIsDifferent(true);
      } else {
        setIsDifferent(false)
      }
    }
  }, [scope, savedScope]);

  return (
    <div className={styles["scope"]}>
      <div className={styles["scope-setup"]}>
        <div className={styles["scope-form"]}>
          <form onSubmit={handleSaveScope} >
            <label>
              <span className={styles["scope-form-label"]}>Label:</span>
              <input type="text" name="label" defaultValue={scope ? scope.label: ""} onChange={(e) => setLabel(e.target.value)}/>
            </label>
            <label>
              <span className={styles["scope-form-label"]}>Description:</span>
              <input type="text" name="description" defaultValue={scope ? scope.description: ""} onChange={(e) => setDescription(e.target.value)}/>
            </label>
            <input type="hidden" name="action" value="" />

            { savedScope && scope && descriptionIsDifferent && !isDifferent ?
              <Button type="submit" disabled={cluster ? false : true } onClick={() => { 
                document.querySelector('input[name="action"]').value = 'description'; 
              }} text="Update label & description"/> 
            : null }

            

            <JobProgress job={scopeJob} clearJob={()=> {
                setScopeJob(null)
                if(scopeJob?.status == "completed") {
                  apiService.fetchScopes(dataset.id).then(scopes => {
                    console.log("fetched and setting")
                    setScopes(scopes)
                    if(scopeJob.job_name == "rm") {
                      navigate(`/datasets/${dataset.id}/setup`)
                    } else {
                      navigate(`/datasets/${dataset.id}/setup/${scopeJob.run_id}`);
                    }
                  })
                }
            }} />

            {(savedScope && !scopeJob && isDifferent) || newVersion ? 
              <Button type="submit" disabled={cluster ? false : true } 
                onClick={() => { 
                  document.querySelector('input[name="action"]').value = 'save'; 
                }} 
                text={`Overwrite ${savedScope.id}`}
              /> : null }
              { isDifferent && !scopeJob ? 
                <Button type="submit" disabled={cluster  ? false : true } 
                  onClick={() => { 
                    document.querySelector('input[name="action"]').value = 'new'; 
                }} 
                text="New scope"
              /> : null }
            
          </form>
        
        <div className={styles["scope-setup-info"]}>
           <h4>Scope Settings</h4>
          <span className={styles["scope-form-label"]}>Embedding: </span><span className={styles["scope-form-value"]}>{embedding?.id} - {embedding?.model_id}</span><br/>
          <span className={styles["scope-form-label"]}>Umap: </span><span className={styles["scope-form-value"]}>{umap?.id}</span><br/>
          <span className={styles["scope-form-label"]}>Cluster: </span><span className={styles["scope-form-value"]}>{cluster?.id} - {cluster?.n_clusters}</span><br/>
          <span className={styles["scope-form-label"]}>Labels: </span><span className={styles["scope-form-value"]}>{clusterLabelSet?.id} - {clusterLabelSet?.model_id}</span><br/>
          <span className={styles["scope-form-label"]}>Version: </span><span className={styles["scope-form-value"]}>{lsVersion}</span><br/>
        </div>
        {savedScope && isDifferent || newVersion ? <div className={styles["previous-scope"]}>
          <h4>Previous Scope Settings</h4>
          <span className={savedScope.embedding_id !== embedding?.id ? styles["different"] : ""}>
            <span className={styles["scope-form-label"]}>Embedding: </span><span className={styles["scope-form-value"]}>{savedScope.embedding_id} - {savedEmbedding?.model_id}</span><br/>
          </span>
          <span className={savedScope.umap_id !== umap?.id ? styles["different"] : ""}>
            <span className={styles["scope-form-label"]}>Umap: </span><span className={styles["scope-form-value"]}>{ savedScope.umap_id }</span><br/>
          </span>
          <span className={savedScope.cluster_id !== cluster?.id ? styles["different"] : ""}>
            <span className={styles["scope-form-label"]}>Cluster: </span><span className={styles["scope-form-value"]}>{ savedScope.cluster_id } - {savedCluster?.n_clusters}</span><br/>
          </span>
          <span className={savedScope.cluster_labels_id !== clusterLabelSet?.id ? styles["different"] : ""}>
            <span className={styles["scope-form-label"]}>Labels: </span><span className={styles["scope-form-value"]}>{ savedScope.cluster_labels_id } - { savedClusterLabelSet?.model_id }</span><br/>
          </span>
          <span className={savedScope.ls_version !== lsVersion ? styles["different"] : ""}>
              <span className={styles["scope-form-label"]}>Version: </span><span className={styles["scope-form-value"]}>{savedScope.ls_version}</span><br/>
          </span>
        </div> : null }

        <div className={styles["scope-setup-img"]}>
          { cluster ? <div className={styles["box-item"]}>
            {/* {cluster.id} */}
            <img src={cluster.url} alt={cluster.id} />
          </div> : 
            umap ? <div className={styles["box-item"]}>
              {/* {umap.id} */}
              <img src={umap.url} alt={umap.id} />
            </div> : <div className={styles["empty-box"]}></div> 
          }
        </div>


        
        </div>
      </div>

      {scope && scope.id && (
        <div className={styles["setup-scope-preview"]}>
          <div className={styles["preview"]}>
            <div className={styles["scope-actions"]}>
              <div className={styles["action-card"]}>
                <h3><Link to={`/datasets/${dataset?.id}/explore/${scope?.id}`} className={styles["action-link"]}>
                  Explore {scope.label} ({scope.id})
                </Link></h3>
                <p>Explore, filter and search your data in an interactive visualization interface.</p>
                
              </div>

              <div className={styles["action-card"]}>
                <h3><Link to={`/datasets/${dataset?.id}/export/${scope?.id}`} className={styles["action-link"]}>
                  Export data ({scope.id})
                </Link></h3>
                <p>Download your data in various formats.</p>
                
              </div>

              <div className={styles["action-card"]}>
                <h3><Link to={`/datasets/${dataset?.id}/plot/${scope?.id}`} className={styles["action-link"]}>
                  Export plot ({scope.id})
                </Link></h3>
                <p>Generate publication-ready visualizations.</p>
                
              </div>

              <div className={styles["action-card"]}>
                <h3>Delete Scope</h3>
                <p>Remove this scope. Underlying data will not be deleted.</p>
                <Button 
                  onClick={() => startDeleteScopeJob({dataset: dataset.id, scope_id: scope.id})}
                  icon="trash"
                  color="delete"
                  variant="outline"
                  text={`Delete ${scope.id}`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Scope;