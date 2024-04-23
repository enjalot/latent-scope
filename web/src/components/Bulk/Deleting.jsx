import { useState } from 'react';
const apiUrl = import.meta.env.VITE_API_URL

function Deleting({ dataset, scope, indices, onSuccess }) {
  return <div>
    <button onClick={() => {
       fetch(`${apiUrl}/bulk/delete-rows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          dataset_id: dataset.id,
          scope_id: scope.id,
          row_ids: indices,
        }),
      })
      .then(response => response.json())
      .then(data => {
        onSuccess();
      });
    }}>Delete {indices.length} rows</button>
  </div>;
}

export default Deleting;

