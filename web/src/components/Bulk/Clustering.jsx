const apiUrl = import.meta.env.VITE_API_URL;

function Clustering({ dataset, scope, indices, onSuccess }) {
  return (
    <div className="bulk-clustering">
      <select
        className="ls-select"
        onChange={(e) => {
          fetch(`${apiUrl}/bulk/change-cluster`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dataset_id: dataset.id,
              scope_id: scope.id,
              row_ids: indices,
              new_cluster: e.target.value,
            }),
          })
            .then((response) => response.json())
            .then(() => {
              onSuccess();
            });
        }}
        value={-1}
      >
        <option value="-1">Select a cluster</option>
        {scope?.cluster_labels_lookup?.map((cluster, index) => (
          <option key={index} value={cluster.cluster}>
            {cluster.cluster}: {cluster.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default Clustering;
