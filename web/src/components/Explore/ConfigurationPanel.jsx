import { Switch } from 'react-element-forge';
import styles from './ConfigurationPanel.module.scss';

const ConfigurationPanel = ({
  isOpen,
  onClose,
  title = 'Configuration',
  vizConfig,
  toggleShowHeatMap,
  toggleShowClusterOutlines,
  updatePointSize,
  updatePointOpacity,
  isImageDataset = false,
  imageMode = false,
  toggleImageMode,
  alwaysShowPoints = false,
  toggleAlwaysShowPoints,
  updateAtlasSwitchPx,
  updateAtlasPointsPx,
}) => {
  const { showHeatMap, showClusterOutlines, pointSize, pointOpacity, atlasSwitchPx, atlasPointsPx } =
    vizConfig;

  return (
    <div className={`${styles.panel} ls-panel ls-panel--floating ${isOpen ? styles.open : ''}`}>
      <div className="ls-panel__header">
        <h3 className="ls-panel__title">{title}</h3>
        <button
          type="button"
          className="ls-icon-btn"
          onClick={onClose}
          aria-label="Minimize configuration panel"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div>
        <div className={styles.configSection}>
          <label>
            Point Size<span className={styles.value}>{pointSize}×</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={pointSize}
            onChange={(e) => updatePointSize(+e.target.value)}
            className={styles.slider}
          />
        </div>

        <div className={styles.configSection}>
          <label>
            Point Opacity<span className={styles.value}>{pointOpacity}×</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="1.5"
            step="0.1"
            value={pointOpacity}
            onChange={(e) => updatePointOpacity(+e.target.value)}
            className={styles.slider}
          />
        </div>

        <Switch
          value={showClusterOutlines}
          onChange={toggleShowClusterOutlines}
          defaultState={showClusterOutlines}
          color="secondary"
          label="Show Cluster Outlines"
        />

        {/* For image datasets the heatmap is part of the automatic image LOD
            (heatmap -> images -> points), so the manual toggle is hidden. */}
        {!isImageDataset && (
          <Switch
            value={showHeatMap}
            onChange={toggleShowHeatMap}
            color="secondary"
            label="Show Heat Map"
          />
        )}

        {isImageDataset && (
          <>
            <Switch
              value={imageMode}
              onChange={toggleImageMode}
              defaultState={imageMode}
              color="secondary"
              label="Image map (heatmap → images)"
            />
            {imageMode && (
              <Switch
                value={alwaysShowPoints}
                onChange={toggleAlwaysShowPoints}
                defaultState={alwaysShowPoints}
                color="secondary"
                label="Always show points"
              />
            )}
            {imageMode && (
              <>
                <div className={styles.configSection}>
                  <label>
                    Image size before switching
                    <span className={styles.value}>{atlasSwitchPx}px</span>
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="48"
                    step="1"
                    value={atlasSwitchPx}
                    onChange={(e) => updateAtlasSwitchPx(+e.target.value)}
                    className={styles.slider}
                  />
                </div>
                <div className={styles.configSection}>
                  <label>
                    Zoom into images before points
                    <span className={styles.value}>{atlasPointsPx}px</span>
                  </label>
                  <input
                    type="range"
                    min="32"
                    max="200"
                    step="4"
                    value={atlasPointsPx}
                    onChange={(e) => updateAtlasPointsPx(+e.target.value)}
                    className={styles.slider}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ConfigurationPanel;
