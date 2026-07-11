import { useState, useEffect, useMemo } from 'react';
import './LeftPane.css';
import { apiService } from '../../lib/apiService';
import { compareVersions } from 'compare-versions';
import ScopeHeader from './ScopeHeader';

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

// feather-style glyphs for the rail buttons
const TableIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);
const GridIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);
const PenToolIcon = () => (
  <svg {...iconProps}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);
const InfoIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export default function LeftPane({
  dataset,
  scope,
  scopes,
  tags,
  deletedIndices,
  onScopeChange,
  showClusters,
  onToggleClusters,
}) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [lsVersion, setLsVersion] = useState(null);

  useEffect(() => {
    apiService.fetchVersion().then(setLsVersion);
  }, []);

  const isOutdatedScope = useMemo(() => {
    if (!scope?.ls_version || !lsVersion) return false;
    const scopeMinor = scope.ls_version.replace(/(\d+\.\d+)\.\d+/, '$1.0');
    const lsMinor = lsVersion.replace(/(\d+\.\d+)\.\d+/, '$1.0');
    return compareVersions(scopeMinor, lsMinor) < 0;
  }, [lsVersion, scope]);

  return (
    <div className="left-pane-container">
      <div className="button-column main-buttons">
        <button
          type="button"
          className="ls-icon-btn left-pane-button selected"
          title="Filter data points"
          aria-label="Filter data points"
        >
          <TableIcon />
        </button>
        <button
          type="button"
          className={`ls-icon-btn left-pane-button ${showClusters ? 'selected' : ''}`}
          title="Browse clusters"
          aria-label="Browse clusters"
          aria-pressed={showClusters}
          onClick={onToggleClusters}
          data-testid="toggle-clusters-button"
        >
          <GridIcon />
        </button>
        <button
          type="button"
          className="ls-icon-btn left-pane-button"
          title="Annotate"
          aria-label="Annotate"
          disabled
        >
          <PenToolIcon />
        </button>
      </div>

      <div
        className="button-column info-button"
        onMouseEnter={() => setShowMetadata(true)}
        onMouseLeave={() => setShowMetadata(false)}
      >
        <button
          type="button"
          className={`ls-icon-btn left-pane-button ${isOutdatedScope ? 'warning-button' : ''}`}
          title="Show scope metadata"
          aria-label="Show scope metadata"
        >
          <InfoIcon />
        </button>
        {(showMetadata || isOutdatedScope) && (
          <div className="metadata-tooltip ls-panel ls-panel--floating">
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
