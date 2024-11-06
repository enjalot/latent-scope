// NewEmbedding.jsx
import { useState, useEffect, useCallback, useMemo} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';
import { Button } from 'react-element-forge';

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
  const [clusterLabelId, setClusterLabelId] = useState(null);

  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [scopes, setScopes] = useState([]);

  useEffect(() => {
    if(scope && scope.id) {
      setPreviewLabel(scope.id)
    } else {
      setPreviewLabel(null)
    }
  }, [scope])

  // Fetch initial data
  useEffect(() => {
    if(dataset) {
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchUmaps(dataset?.id).then(umaps => setUmaps(umaps))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
    }
  }, [dataset])

  // Set initial input values based on scope prop
  useEffect(() => {
    if (scope) {
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
        setClusterLabelId(scope.cluster_labels_id)
      }
    }
  }, [scope, embeddings, umaps, clusters]);

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
      cluster_labels_id: clusterLabelId,
      label: data.get('label'),
      description: data.get('description')
    };

    console.log("action", action)
    if(action == "save") {
      payload.scope_id = scope.id
    }
    startScopeJob(payload)

  }, [dataset, scope, cluster, clusterLabelId, umap, embedding]);

  const [isDifferent, setIsDifferent] = useState(false);
  const descriptionIsDifferent = useMemo(() => 
    savedScope?.label !== label || savedScope?.description !== description
  , [savedScope, label, description]);

  useEffect(() => {
    if(!scope) {
      setIsDifferent(true);
    } else {
      if(scope.embedding_id != savedScope?.embedding_id
        || scope.umap_id != savedScope?.umap_id
        || scope.cluster_id != savedScope?.cluster_id
        || scope.cluster_labels_id != savedScope?.cluster_labels_id) {
        setIsDifferent(true);
        console.log("is different", scope, savedScope)
      } else {
        setIsDifferent(false)
      }
    }
  }, [scope, savedScope]);

  return (
    <div className={styles["scope"]}>
      <div className={styles["scope-setup"]}>
        <div className={styles["scope-setup-info"]}>
          Embedding: {embedding?.id} - {embedding?.model_id}<br/>
          Umap: {umap?.id}<br/>
          Cluster: {cluster?.id}<br/>
          Labels: {clusterLabelId}
        </div>

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
            { scope 
            && descriptionIsDifferent ?
              <Button type="submit" disabled={cluster ? false : true } onClick={() => { 
                document.querySelector('input[name="action"]').value = 'description'; 
              }} text="Update label & description"/> 
            : null }
            {savedScope && isDifferent ? <div className={styles["previous-scope"]}>
              <h4>Previous Scope Settings</h4>
              Embedding: {savedScope.embedding_id}<br/>
              Umap: { savedScope.umap_id }<br/>
              Cluster: { savedScope.cluster_id }<br/>
              Labels: { savedScope.cluster_labels_id }<br/>

            </div> : null }

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

            {savedScope && !scopeJob && isDifferent ? <Button type="submit" disabled={cluster ? false : true } 
              onClick={() => { 
                document.querySelector('input[name="action"]').value = 'save'; 
              }} 
              text={`Overwrite ${savedScope.id}`}
            /> : null }
              { isDifferent && !scopeJob ? <Button type="submit" disabled={cluster  ? false : true } 
                onClick={() => { 
                  document.querySelector('input[name="action"]').value = 'new'; 
                }} 
                text="New scope"
              /> : null }
          </form>
        </div>
      </div>

      {scope && scope.id && (
        <div className={styles["setup-scope-preview"]}>
          <div className={styles["preview"]}>
            <div className={styles["scope-actions"]}>
              <div className={styles["action-card"]}>
                <h3>Explore Data</h3>
                <p>Interact with your data in an interactive visualization</p>
                <Link to={`/datasets/${dataset?.id}/explore/${scope?.id}`} className={styles["action-link"]}>
                  Explore {scope.label} ({scope.id})
                </Link>
              </div>

              <div className={styles["action-card"]}>
                <h3>Export Data</h3>
                <p>Download your data with embeddings and cluster assignments</p>
                <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`} className={styles["action-link"]}>
                  Export data ({scope.id})
                </Link>
              </div>

              <div className={styles["action-card"]}>
                <h3>Export Plot</h3>
                <p>Generate publication-ready visualizations</p>
                <Link to={`/datasets/${dataset?.id}/plot/${scope?.id}`} className={styles["action-link"]}>
                  Export plot ({scope.id})
                </Link>
              </div>

              <div className={styles["action-card"]}>
                <h3>Delete Scope</h3>
                <p>Remove this scope. Underlying data will not be deleted.</p>
                <Button 
                  onClick={() => startDeleteScopeJob({dataset: dataset.id, scope_id: scope.id})}
                  icon="trash"
                  color="delete"
                  variant="outline"
                  text="Delete scope"
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