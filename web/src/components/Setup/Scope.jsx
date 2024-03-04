// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import { Link, useNavigate } from 'react-router-dom';
const apiUrl = import.meta.env.VITE_API_URL


import PropTypes from 'prop-types';
Scope.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  scope: PropTypes.object,
  umap: PropTypes.object,
  embedding: PropTypes.object,
  cluster: PropTypes.object,
  clusterLabelId: PropTypes.string,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

function Scope({ dataset, scope, umap, embedding, cluster, clusterLabelId, onNew, onChange}) {
  // const[scopes, setScopes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if(dataset) {
      console.log("fetching scopes")
    fetch(`${apiUrl}/datasets/${dataset.id}/scopes`)
      .then(response => response.json())
      .then(data => {
        const sorted = data.sort((a,b) => a.id.localeCompare(b.id))
        // setScopes(sorted)
        onNew(sorted)
      });
    }
  }, [dataset]);


  const handleSaveScope = useCallback((event) => {
    event.preventDefault();
    if(!umap || !cluster) return;
    const form = event.target;
    const data = new FormData(form);
    const payload = {
      embedding_id: embedding.id,
      umap_id: umap.id,
      cluster_id: cluster.id,
      cluster_labels_id: clusterLabelId,
      label: data.get('label'),
      description: data.get('description')
    };

    const action = data.get('action')
    console.log("action", action)
    if(action == "save") {
      payload.id = scope.id
    }

    fetch(`${apiUrl}/datasets/${dataset.id}/scopes/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
      const tscope = data
      fetch(`${apiUrl}/datasets/${dataset.id}/scopes`)
        .then(response => response.json())
        .then(data => {
          // setScopes(data)
          onNew(data)
          onChange(data.find(s => s.id == tscope.id))
        });
      navigate(`/datasets/${dataset.id}/setup/${data.id}`);
    })
    .catch(error => {
      console.error('Error saving scope:', error);
    });
  }, [dataset, scope, cluster, clusterLabelId, umap, embedding , navigate, onChange, onNew]);

  const [isDifferent, setIsDifferent] = useState(false);
  useEffect(() => {
    if(!scope) {
      setIsDifferent(true);
    } else {
      if(scope.embedding_id != embedding?.id
        || scope.umap_id != umap?.id
        || scope.cluster_id != cluster?.id
        || scope.cluster_labels_id != clusterLabelId) {
        setIsDifferent(true);
      } else {
        setIsDifferent(false)
      }
    }
  }, [scope, cluster, umap, embedding, clusterLabelId]);

  return (
    <div className="setup-scope">
      <div className="dataset--setup-save-box-title">
        Embedding: {embedding?.id} - {embedding?.model_id}<br/>
        Umap: {umap?.id}<br/>
        Cluster: {cluster?.id}<br/>
        Labels: {clusterLabelId }
      </div>
      <div className="dataset--setup-save-box-boxes">
        { cluster ? <div className="box-item">
          {/* {cluster.id} */}
          <img src={cluster.url} alt={cluster.id} />
        </div> : 
          umap ? <div className="box-item">
            {/* {umap.id} */}
            <img src={umap.url} alt={umap.id} />
          </div> : <div className="empty-box"></div> 
        }
      </div>
      <div className="dataset--setup-save-box-nav">
        <form onSubmit={handleSaveScope}>
          <label>
            Label:
            <input type="text" name="label" defaultValue={scope ? scope.label: ""}/>
          </label>
          <label>
            Description:
            <input type="text" name="description" defaultValue={scope ? scope.description: ""}/>
          </label>
          <input type="hidden" name="action" value="" />
        {scope && isDifferent ? <div className="previous-scope">
          <h4>Previous Scope Settings</h4>
          Embedding: {scope.embedding_id}<br/>
          Umap: { scope.umap_id }<br/>
          Cluster: { scope.cluster_id }<br/>
          Labels: { scope.cluster_labels_id }<br/>

        </div> : null }
          {scope && isDifferent ? 
            <button type="submit" disabled={cluster ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'save'; 
            }}>Overwrite {scope.name}</button> : null }
            { isDifferent ? <button type="submit" disabled={cluster ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'new'; 
            }}>New scope</button> : null }
        </form>
        { scope ? <Link to={`/datasets/${dataset?.id}/explore/${scope?.id}`}> Explore {scope.label} ({scope.id}) <br/></Link> : null }
        
      </div>
    </div>
  );
}

export default Scope;