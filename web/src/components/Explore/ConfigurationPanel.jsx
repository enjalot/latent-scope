import { Button, Switch } from 'react-element-forge';
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
    <div className={`${styles.panel} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <Button
          className={styles.closeButton}
          variant="outline"
          onClick={onClose}
          aria-label="Minimize configuration panel"
          icon="minus"
        />
      </div>

      <div className={styles.content}>
        {/* Dropdown Example
        <div className={styles.configSection}>
          <label>Color by</label>
          <select className={styles.select}>
            <option>Nomic Topic: medium</option>
          </select>
        </div> */}

        <div className={styles.configSection}>
          <label>Point Size: {pointSize}x</label>
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
          <label>Point Opacity: {pointOpacity}x</label>
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
                  <label>Image size before switching: {atlasSwitchPx}px</label>
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
                  <label>Zoom into images before points: {atlasPointsPx}px</label>
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

        <div className={styles.configSection}></div>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
