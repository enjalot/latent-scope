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
  hasImageColumn = false,
  spriteStatus = { generated: false },
  spriteJob = null,
  showSprites = false,
  toggleShowSprites,
  onGenerateSprites,
}) => {
  const { showHeatMap, showClusterOutlines, pointSize, pointOpacity } = vizConfig;
  const spriteJobRunning = spriteJob && !['completed', 'error', 'dead'].includes(spriteJob.status);

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

        <Switch
          value={showHeatMap}
          onChange={toggleShowHeatMap}
          color="secondary"
          label="Show Heat Map"
        />

        {hasImageColumn &&
          (spriteStatus.generated ? (
            <Switch
              value={showSprites}
              onChange={toggleShowSprites}
              defaultState={showSprites}
              color="secondary"
              label="Show Images (zoom in)"
            />
          ) : (
            <div className={styles.configSection}>
              <Button
                onClick={onGenerateSprites}
                disabled={spriteJobRunning}
                variant="outline"
                text={spriteJobRunning ? 'Generating image sprites…' : 'Generate image sprites'}
              />
              {spriteJobRunning && spriteJob?.progress?.length > 0 && (
                <div className={styles.spriteProgress}>
                  {spriteJob.progress[spriteJob.progress.length - 1]}
                </div>
              )}
            </div>
          ))}

        <div className={styles.configSection}></div>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
