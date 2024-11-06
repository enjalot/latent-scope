import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';

import { isMobileDevice } from '../../utils';

const readonly = import.meta.env.MODE == "read_only"

function DatasetHeader({
  dataset,
  scope,
  scopes,
  onScopeChange,
}) {
  if (!dataset) return null;

  return (
    <div className="summary">
      <div className="scope-card">
        <div className='heading'>
          <select
            className="scope-selector"
            onChange={(e) => onScopeChange(e.target.value)}
            value={scope?.id}
          >
            {scopes.map((scopeOption) => (
              <option key={scopeOption.id} value={scopeOption.id}>
                {scopeOption.label} ({scopeOption.id})
              </option>
            ))}
          </select>

          {!readonly && (
            <>
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure</Link>
              <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}>Export</Link>
            </>
          )}
        </div>

        {isMobileDevice() && <i>Use a desktop browser for full interactivity!</i>}

        {scope?.ls_version ? (
          <span>
            <span>{scope?.description}</span>
            <br />
            <span>{scope?.embedding?.model_id}</span>
            <br />
            <span>{scope?.cluster_labels_lookup?.length} clusters</span>
          </span>
        ) : (
          <div className="scope-version-warning">
            <span className="warning-header">Outdated Scope!</span>
            <span> please "Overwrite" the scope in the last step on the <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to update.</span>
          </div>
        )}
      </div>

      <div className="dataset-card">
        <span>
          <b>{dataset.id}</b> {scope?.rows}/{dataset?.length} rows
        </span>
      </div>
    </div>
  );
}

DatasetHeader.propTypes = {
  dataset: PropTypes.object,
  scope: PropTypes.object,
  scopes: PropTypes.array.isRequired,
  onScopeChange: PropTypes.func.isRequired,
  isMobileDevice: PropTypes.bool
};

export default DatasetHeader; 