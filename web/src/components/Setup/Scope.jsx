// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import { useNavigate } from 'react-router-dom';
const apiUrl = import.meta.env.VITE_API_URL


import PropTypes from 'prop-types';
Scope.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  scope: PropTypes.object,
  umap: PropTypes.object,
  embedding: PropTypes.string,
  cluster: PropTypes.object,
  clusterLabelModel: PropTypes.string,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

function Scope({ dataset, scope, umap, embedding, cluster, clusterLabelModel, onNew, onChange}) {
  // const[scopes, setScopes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if(dataset)
    fetch(`${apiUrl}/datasets/${dataset.id}/scopes`)
      .then(response => response.json())
      .then(data => {
        const sorted = data.sort((a,b) => a.name.localeCompare(b.name))
        // setScopes(sorted)
        onNew(sorted)
      });
  }, [dataset, onNew]);

  const handleSaveScope = useCallback((event) => {
    event.preventDefault();
    if(!umap || !cluster) return;
    const form = event.target;
    const data = new FormData(form);
    const payload = {
      embeddings: embedding,
      umap: umap.name,
      cluster: cluster.cluster_name,
      cluster_labels: clusterLabelModel,
      label: data.get('label'),
      description: data.get('description')
    };

    const action = data.get('action')
    console.log("action", action)
    if(action == "save") {
      payload.name = scope.name
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
          onChange(data.find(s => s.name == tscope.name))
        });
      navigate(`/datasets/${dataset.id}/setup/${data.name}`);
    })
    .catch(error => {
      console.error('Error saving scope:', error);
    });
  }, [dataset, cluster, clusterLabelModel, umap, embedding , navigate, onNew, onChange]);

  return (
    <div className="setup-scope">
      <div className="dataset--setup-save-box-title">
        Embedding: {embedding}<br/>
        Labels: {clusterLabelModel || "Default"}
      </div>
      <div className="dataset--setup-save-box-boxes">
        { umap ? <div className="box-item">
          {umap.name}
          <img src={umap.url} alt={umap.name} />
        </div> : <div className="empty-box"></div> }
        { cluster ? <div className="box-item">
          {cluster.cluster_name}
          <img src={cluster.url} alt={cluster.name} />
        </div> : <div className="empty-box"></div> }
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
        {scope ? <div className="previous-scope">
          <h4>Previous Scope Settings</h4>
          Embedding: {scope.embeddings}<br/>
          Umap: { scope.umap }<br/>
          Cluster: { scope.cluster }<br/>
          Labels: { scope.cluster_labels || "Default" }<br/>

        </div> : null }
          {scope ? 
            <button type="submit" disabled={cluster ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'save'; 
            }}>Overwrite {scope.name}</button> : null }
            <button type="submit" disabled={cluster ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'new'; 
            }}>New scope</button>
        </form>
        
      </div>
    </div>
  );
}

export default Scope;