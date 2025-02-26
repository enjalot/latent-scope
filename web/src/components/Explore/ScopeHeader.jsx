import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { compareVersions } from 'compare-versions';

import { apiService } from '../../lib/apiService';
import { isMobileDevice } from '../../utils';

const readonly = import.meta.env.MODE == 'read_only';

function DatasetHeader({ dataset, scope, scopes, onScopeChange, tags, deletedIndices }) {
  if (!dataset) return null;

  const [lsVersion, setLsVersion] = useState(null);

  useEffect(() => {
    apiService.fetchVersion().then(setLsVersion);
  }, []);

  return (
    <div className="summary">
      <div className="scope-card">
        {/* <div className="heading">
          <span>{dataset?.id} &gt; </span>
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

          {/* {!readonly && (
            <>
              <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure</Link>
              <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}>Export</Link>
              </div>
            </>
          )}
        </div> */}

        {isMobileDevice() && <i>Use a desktop browser for full interactivity!</i>}

        {lsVersion && compareVersions(scope?.ls_version, lsVersion) < 0 ? (
          <div className="scope-version-warning">
            <span className="warning-header">Outdated Scope</span>
            <span>
              {' '}
              This scope was created with Latent Scope version <code>{scope.ls_version}</code>,
              while you are running Latent Scope <code>{lsVersion}</code>
            </span>
            <span>
              {' '}
              please "Overwrite" the scope in the last step on the{' '}
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to
              update.
            </span>
          </div>
        ) : !scope?.ls_version ? (
          <div className="scope-version-warning">
            <span className="warning-header">Outdated Scope!</span>
            <span>
              {' '}
              please "Overwrite" the scope in the last step on the{' '}
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to
              update.
            </span>
          </div>
        ) : null}
        <span>
          <span className="metadata-label">Dataset</span> {dataset?.id}
        </span>
        <span>
          <span className="metadata-label">Scope</span> {scope?.id}
        </span>
        <span>
          <span className="metadata-label">Description</span> {scope?.description}
        </span>
        <span>
          <span className="metadata-label">Embedding</span> {scope?.embedding?.model_id}
        </span>
        <span>
          <span className="metadata-label">Version</span> {scope?.ls_version}
        </span>
        <span>
          {dataset?.length - deletedIndices?.length}/{dataset?.length} rows
          {deletedIndices?.length > 0 && (
            <span className="metadata-label"> ({deletedIndices?.length} deleted)</span>
          )}
        </span>
        <span>
          <span>{scope?.cluster_labels_lookup?.length} clusters</span>
        </span>
        {/* <span>
          <span>{tags.length} tags</span>
        </span> */}
      </div>

      {/* <div className="dataset-card">
        <span>
          <b>{dataset.id}</b> {scope?.rows}/{dataset?.length} rows
        </span>
      </div> */}
    </div>
  );
}

DatasetHeader.propTypes = {
  dataset: PropTypes.object,
  scope: PropTypes.object,
  scopes: PropTypes.array.isRequired,
  onScopeChange: PropTypes.func.isRequired,
  isMobileDevice: PropTypes.bool,
  tags: PropTypes.array.isRequired,
};

export default DatasetHeader;
