import React, { useState } from 'react';
import './LeftPane.css';
import { Button } from 'react-element-forge';
import ScopeHeader from './ScopeHeader';

export default function LeftPane({ dataset, scope, scopes, tags, deletedIndices, onScopeChange }) {
  const [showMetadata, setShowMetadata] = useState(false);

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
          className="left-pane-button"
          size="small"
          icon="info"
          color="secondary"
          title="Show scope metadata"
        />
        {showMetadata && (
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
