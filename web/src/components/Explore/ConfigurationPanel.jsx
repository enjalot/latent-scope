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
}) => {
  const { showHeatMap, showClusterOutlines, pointSize, pointOpacity } = vizConfig;

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

        <div className={styles.configSection}></div>
      </div>
    </div>
  );
};

export default ConfigurationPanel;
