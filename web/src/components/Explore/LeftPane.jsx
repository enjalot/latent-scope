import React, { useState, useEffect, useMemo } from 'react';
import './LeftPane.css';
import { Button } from 'react-element-forge';
import { apiService } from '../../lib/apiService';
import { compareVersions } from 'compare-versions';
import ScopeHeader from './ScopeHeader';

export default function LeftPane({ dataset, scope, scopes, tags, deletedIndices, onScopeChange }) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [lsVersion, setLsVersion] = useState(null);

  useEffect(() => {
    apiService.fetchVersion().then(setLsVersion);
  }, []);

  const isOutdatedScope = useMemo(() => {
    if (!scope?.ls_version || !lsVersion) return false;
    // Convert versions to minor by replacing patch with 0
    const scopeMinor = scope.ls_version.replace(/(\d+\.\d+)\.\d+/, '$1.0');
    const lsMinor = lsVersion.replace(/(\d+\.\d+)\.\d+/, '$1.0');
    return compareVersions(scopeMinor, lsMinor) < 0;
  }, [lsVersion, scope]);

  return (
    <div className="left-pane-container">
      <div className="button-column main-buttons">
        <Button
          className="left-pane-button"
          size="small"
          icon="table"
          color="primary"
          title="Filter data points"
        />
        {/* <Button
          className="left-pane-button disabled"
          size="small"
          icon="edit"
          color="secondary"
          title="View scope metadata"
        /> */}
        <Button
          className="left-pane-button disabled"
          size="small"
          icon="pen-tool"
          color="secondary"
          title="Annotate"
          disabled
        />
      </div>
      <div
        className="button-column info-button"
        onMouseEnter={() => setShowMetadata(true)}
        onMouseLeave={() => setShowMetadata(false)}
      >
        <Button
          className={`left-pane-button ${isOutdatedScope ? 'warning-button' : ''}`}
          size="small"
          icon="info"
          color="secondary"
          title="Show scope metadata"
        />
        {(showMetadata || isOutdatedScope) && (
          <div className="metadata-tooltip">
            <ScopeHeader
              dataset={dataset}
              tags={tags}
              scope={scope}
              scopes={scopes}
              deletedIndices={deletedIndices}
              onScopeChange={onScopeChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
