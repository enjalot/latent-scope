import { Button } from 'react-element-forge';

const apiUrl = import.meta.env.VITE_API_URL;

function Deleting({ dataset, scope, indices, onSuccess }) {
  return (
    <div className="bulk-deleting">
      <Button
        color="delete"
        size="small"
        icon="trash"
        text={`Delete ${indices.length} rows`}
        onClick={() => {
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
            .then((response) => response.json())
            .then(() => {
              onSuccess();
            });
        }}
      />
    </div>
  );
}

export default Deleting;
