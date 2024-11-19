import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { compareVersions } from 'compare-versions';

import { apiService } from '../../lib/apiService';
import { isMobileDevice } from '../../utils';

const readonly = import.meta.env.MODE == 'read_only';

function DatasetHeader({ hoveredCluster, hovered, dataset, scope, tags, deletedIndices }) {
  if (!dataset) return null;

  const [lsVersion, setLsVersion] = useState(null);

  useEffect(() => {
    apiService.fetchVersion().then(setLsVersion);
  }, []);

  if (hoveredCluster && hovered) {
    return (
      <div className="summary" style={{ height: '192px' }}>
        <div className="scope-card">
          {hoveredCluster && (
            <span>
              <span className="key">Cluster {hoveredCluster.cluster}: </span>
              <span className="value">{hoveredCluster.label}</span>
            </span>
          )}
          <br></br>
          <span>Index: {hovered.index}</span>
          <p className="tooltip-text">{hovered[scope?.embedding?.text_column]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="summary">
      <div className="scope-card">
        {isMobileDevice() && <i>Use a desktop browser for full interactivity!</i>}

        {scope?.ls_version ? (
          <span>
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
            ) : null}
            <span>
              <span className="metadata-label">Dataset</span> {dataset?.id}
            </span>
            <br />
            <span>
              <span className="metadata-label">Scope</span> {scope?.id}
            </span>
            <br />
            <span>
              <span className="metadata-label">Description</span> {scope?.description}
            </span>
            <br />
            <span>
              <span className="metadata-label">Embedding</span> {scope?.embedding?.model_id}
            </span>

            <br />
            <span>
              <span className="metadata-label">Version</span> {scope?.ls_version}
            </span>
            <br />
            {/* <div className="dataset-card"> */}
            <span>
              {dataset?.length - deletedIndices?.length}/{dataset?.length} rows
              {deletedIndices?.length > 0 && (
                <span className="metadata-label"> ({deletedIndices?.length} deleted)</span>
              )}
            </span>
            <br />
            {/* </div> */}
            <span>
              <span>{scope?.cluster_labels_lookup?.length} clusters</span>
            </span>
            <br />
            <span>
              <span>{tags.length} tags</span>
            </span>
          </span>
        ) : (
          <div className="scope-version-warning">
            <span className="warning-header">Outdated Scope!</span>
            <span>
              {' '}
              please "Overwrite" the scope in the last step on the{' '}
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to
              update.
            </span>
          </div>
        )}
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
