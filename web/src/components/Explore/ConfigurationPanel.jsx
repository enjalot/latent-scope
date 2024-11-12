import { useState, useCallback } from 'react';
import { Button, Switch } from 'react-element-forge';
import styles from './ConfigurationPanel.module.scss';

const ConfigurationPanel = ({
  isOpen,
  onClose,
  title = "Configuration"
}) => {
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [showClusterOutlines, setShowClusterOutlines] = useState(false);
  // pointSize and pointOpacity will be multiplied with the values in th colors.js arrays like mapPointSize
  const [pointSize, setPointSize] = useState(1);
  const [pointOpacity, setPointOpacity] = useState(1);

  const toggleShowHeatMap = useCallback(() => {
    setShowHeatMap(!showHeatMap);
  }, [setShowHeatMap]);
  const toggleShowClusterOutlines = useCallback(() => {
    setShowClusterOutlines(!showClusterOutlines);
  }, [setShowClusterOutlines]);
  
  return (
    <div className={`${styles.panel} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <Button
          color="primary"
          variant="outline"
          onClick={onClose}
          aria-label="Close configuration panel"
          icon={"x"}
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
            onChange={(e) => setPointSize(+e.target.value)}
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
            onChange={(e) => setPointOpacity(+e.target.value)}
            className={styles.slider}
          />
        </div>

        <Switch value={showClusterOutlines} onChange={toggleShowClusterOutlines} color="secondary" label="Show Cluster Outlines" />

        <Switch value={showHeatMap} onChange={toggleShowHeatMap} color="secondary" label="Show Heat Map" />

        <div className={styles.configSection}>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationPanel; 