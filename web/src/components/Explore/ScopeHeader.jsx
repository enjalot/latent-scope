import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { compareVersions } from 'compare-versions';

import { apiService } from '../../lib/apiService';
import { isMobileDevice } from '../../utils';
import { Readout } from '../ui';

function DatasetHeader({ dataset, scope, tags, deletedIndices }) {
  // Hooks must run unconditionally on every render, so they come before the
  // early return below (this was previously a rules-of-hooks violation).
  const [lsVersion, setLsVersion] = useState(null);

  useEffect(() => {
    apiService.fetchVersion().then(setLsVersion);
  }, []);

  if (!dataset) return null;

  const totalRows = dataset?.length;
  const activeRows = totalRows - (deletedIndices?.length || 0);
  const rowsValue =
    deletedIndices?.length > 0
      ? `${activeRows?.toLocaleString()}/${totalRows?.toLocaleString()} (${deletedIndices.length.toLocaleString()} deleted)`
      : `${totalRows?.toLocaleString()}`;

  return (
    <div className="summary">
      <div className="scope-card">
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
              please &quot;Overwrite&quot; the scope in the last step on the{' '}
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to
              update.
            </span>
          </div>
        ) : !scope?.ls_version ? (
          <div className="scope-version-warning">
            <span className="warning-header">Outdated Scope!</span>
            <span>
              {' '}
              please &quot;Overwrite&quot; the scope in the last step on the{' '}
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to
              update.
            </span>
          </div>
        ) : null}
        <Readout label="Dataset" value={dataset?.id} />
        <Readout label="Scope" value={scope?.id} />
        {scope?.description && <span className="scope-description">{scope.description}</span>}
        <Readout label="Embedding" value={scope?.embedding?.model_id} />
        <Readout label="Version" value={scope?.ls_version} />
        <Readout label="Rows" value={rowsValue} />
        <Readout label="Clusters" value={scope?.cluster_labels_lookup?.length} />
        <Readout label="Tags" value={tags.length} />
      </div>
    </div>
  );
}

DatasetHeader.propTypes = {
  dataset: PropTypes.object,
  scope: PropTypes.object,
  isMobileDevice: PropTypes.bool,
  tags: PropTypes.array.isRequired,
};

export default DatasetHeader;
