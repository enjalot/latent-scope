// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'react-tooltip'
import { Button, Switch } from 'react-element-forge'

import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
import { useSetup } from '../../contexts/SetupContext';
import { apiService, apiUrl } from '../../lib/apiService';

import Preview from './Preview';

import styles from './Umap.module.scss';

function Umap({}) {
  const { dataset, scope, savedScope, updateScope, goToNextStep, setPreviewLabel } = useSetup();

  const [umapJob, setUmapJob] = useState(null);
  const { startJob: startUmapJob } = useStartJobPolling(dataset, setUmapJob, `${apiUrl}/jobs/umap`);
  const { startJob: deleteUmapJob } = useStartJobPolling(dataset, setUmapJob, `${apiUrl}/jobs/delete/umap`);

  const [init, setInit] = useState("")

  const [umap, setUmap] = useState(null);
  const [embedding, setEmbedding] = useState(null);
  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);

  useEffect(() => {
    setPreviewLabel(umap?.id)
  }, [umap, setPreviewLabel])

  useEffect(() => {
    if(scope?.embedding_id) {
      console.log("scope changed", scope)
      const emb = embeddings.find(e => e.id == scope.embedding_id)
      setEmbedding(emb)
    } else {
      setEmbedding(embeddings?.[0])
    }
    if(scope?.umap_id) {
      const um = umaps.find(u => u.id == scope.umap_id)
      setUmap(um)
    } else {
      setUmap(umaps.filter(d => d.embedding_id == scope?.embedding_id)[0])
    }
    console.log("umaps", umaps)
  }, [scope, embeddings, umaps])

  useEffect(() => {
    if(dataset){
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchUmaps(dataset?.id).then(ums => setUmaps(ums))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
    }
  }, [dataset, setEmbeddings, setUmaps, setClusters])


  useEffect(() => {
    if(umapJob?.status == "completed") {
      apiService.fetchUmaps(dataset?.id)
      .then(umps => {
        setUmaps(umps)
        let ump;
        if(umapJob.job_name == "umap"){
          ump = umps.find(d => d.id == umapJob.run_id)
        } else if(umapJob.job_name == "rm") {
          ump = umps.filter(d => d.embedding_id == embedding?.id)[0]
        }
        // onNew(umps, ump)
        setUmap(ump)
      })
    }
  }, [umapJob, dataset, embedding, setUmaps]);


  const handleChangeInit = useCallback((e) => {
    setInit(e.target.value)
  }, [setInit])

  const [save, setSave] = useState(false)

  const handleNewUmap = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const neighbors = data.get('neighbors')
    const min_dist = data.get('min_dist')
    const align = Array.from(document.querySelectorAll('input[name="umapAlign"]:checked'))
      .map(input => input.value)
      .sort((a,b) => a.localeCompare(b))
      .join(",")

    // can't save an aligned umap for now
    let s = save ? "True" : "";
    if(align.length > 0) {
      s = "";
    }
    startUmapJob({embedding_id: embedding?.id, neighbors, min_dist, init, align, save: s})
  }, [startUmapJob, embedding, init, save])

  const [showAlign, setShowAlign] = useState(false);

  const toggleShowAlign = useCallback(() => {
    setShowAlign(!showAlign);
  }, [showAlign, setShowAlign]);

  const toggleSave = useCallback(() => {
    setSave(!save);
  }, [save, setSave]);

  const handleNextStep = useCallback(() => {
    if(savedScope?.umap_id == umap?.id) {
      updateScope({...savedScope})
    } else {
      updateScope({umap_id: umap?.id, cluster_id: null, cluster_labels_id: null, id: null})
    }
    goToNextStep()
  }, [updateScope, goToNextStep, umap, savedScope])

  return (
      <div className={styles["umap"]}>
        <div className={styles["umap-setup"]}>
          <div className={styles["umap-form"]}>
            <div>Project high-dimensional embeddings to 2D using <a href="https://umap-learn.readthedocs.io/en/latest/index.html">UMAP</a></div>
            <form onSubmit={handleNewUmap}>
              <label>
                <span className={styles["umap-form-label"]}>Neighbors: </span>
                <input type="number" name="neighbors" defaultValue="25"disabled={!!umapJob} />
                <span className="tooltip" data-tooltip-id="neighbors">🤔</span>
                <Tooltip id="neighbors" place="top" effect="solid" className={styles["tooltip"]}>
                  The number of neighbors to use in the UMAP algorithm. 
                  More neighbors will result in a more global view of the data, 
                  while fewer neighbors will result in a more local view of the data. More neighbors is also more computationally expensive.
                </Tooltip>
              </label>
              <label>
                <span className={styles["umap-form-label"]}>Min Dist: </span>
                <input type="text" name="min_dist" defaultValue="0.1" disabled={!!umapJob} />
                <span className="tooltip" data-tooltip-id="min-dist">🤔</span>
                <Tooltip id="min-dist" place="top" effect="solid" className={styles["tooltip"]}>
                  Min dist is a measure of how close points must be in the original space to be considered neighbors in the low-dimensional space. 
                  A smaller value will result in a more clustered UMAP, while a larger value will result in a more spread out UMAP.
                </Tooltip>
              </label>
          
          <div className={styles["umap-form-align"]}>
            <Switch onChange={toggleShowAlign} color="secondary" label="Align UMAP"/>
            <span className="tooltip" data-tooltip-id="align-umap">🤔</span>
            <Tooltip id="align-umap" place="top" effect="solid" className={styles["tooltip"]}>
              You can select other embeddings to align this UMAP with. This allows for a more direct comparison between UMAPs of different embeddings.
            </Tooltip>
          </div>

          {showAlign && <div className={styles["umaps-align"]}>
            <span className={styles["umaps-align-info"]}>
              Choose 1 or more embeddings to align alongside {embedding?.id}. 
              An <a href="https://umap-learn.readthedocs.io/en/latest/aligned_umap_basic_usage.html">Aligned UMAP</a> will be generated for each embedding selected.
              It is computationally more expensive to align, as each embedding needs to be mapped.
            </span>
            {embeddings.map((emb, index) => {
              if(emb.id == embedding?.id) return null
              return (<label key={index}>
                <input type="checkbox" id={`umap-align-${emb.id}`} name="umapAlign" value={emb.id} />
                {emb.id} - {emb.model_id} [{emb.dimensions}]
              </label>
            )}
            )} 
          </div>}

          {!showAlign && <div className={styles["umap-form-save"]}>
            <Switch onChange={toggleSave} color="secondary" label="Save UMAP"/>
            <span className="tooltip" data-tooltip-id="save-umap">🤔</span>
            <Tooltip id="save-umap" place="top" effect="solid" className={styles["tooltip"]}>
              Saving a UMAP model will allow you to project new data (from the same embedding model) onto it later. 
              Saving a UMAP model takes up quite a bit of disk space (proportional the the data used to make it).
            </Tooltip>
          </div>}


          <Button type="submit" color={umap? "secondary" : "primary"} disabled={!!umapJob} text="New UMAP"></Button>

          <JobProgress job={umapJob} clearJob={()=> setUmapJob(null)}/>
        </form>
        </div>
        {/* The list of available UMAPS */}
        <div className={styles["umap-list"]}>
          {umaps.filter(d => d.embedding_id == embedding?.id).map((um, index) => (
            <div className={`${styles["item"]}` + (um.id === umap?.id ? " " + styles["selected"] : "")} key={index}>
              <label htmlFor={`umap${index}`}>
              <input type="radio" 
                id={`umap${index}`} 
                name="umap" 
                value={um} checked={um.id === umap?.id} 
                onChange={() => setUmap(um)} />
              <span>{um.id} {savedScope?.umap_id == um.id ? <span className="tooltip" data-tooltip-id="saved">💾</span> : null}</span>
              <div className={styles["item-info"]}>
                <span>Neighbors: {um.neighbors}</span>
                <span>Min Dist: {um.min_dist}</span>
                {clusters.filter(d => d.umap_id == um.id).length > 0 ? <span>Clusters: {clusters.filter(d => d.umap_id == um.id).length}</span> : null}
              </div>
              </label>

              <img src={um.url} alt={um.id} />

              { um.align ? <div>
                <Link to={`/datasets/${dataset?.id}/compare`}>↗ Compare Aligned UMAPs </Link> 
                <span className="tooltip" data-tooltip-id="compare-umaps">🤔</span>
                <div className={styles["umap-align-list"]}>
                  {umaps.filter(d => d.align_id == um.id && d.id != um.id).map(d => {
                    return <img key={d.id} src={d.url} alt={d.id} />
                  })}
                </div>
                <Tooltip id="compare-umaps" place="top" effect="solid">
                  An interface for comparing Aligned UMAPS.
                </Tooltip>
              </div> : null }

              <Button className={styles["delete"]} color="secondary" onClick={() => deleteUmapJob({umap_id: um.id}) } disabled={umapJob && umapJob.status !== "completed"} text="🗑️"/>
            </div>
          ))}
        </div>

        
        <br></br>
      </div>
      <div className={styles["umap-preview"]}>
        <div className={styles["preview"]}>
          <Preview embedding={embedding} umap={umap} />
        </div>
        <div className={styles["navigate"]}>
          <Button disabled={!umap}
            onClick={handleNextStep}
            text={umap ? `Proceed with ${umap?.id}` : "Select a UMAP"}
            >
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Umap;