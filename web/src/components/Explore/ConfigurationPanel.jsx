import React from 'react';
import styles from './ConfigurationPanel.module.scss';

const ConfigurationPanel = ({
  isOpen,
  onClose,
  title = "Configuration"
}) => {
  return (
    <div className={`${styles.panel} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close configuration panel"
        >
          ×
        </button>
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
          <label>Point Size</label>
          <input
            type="range"
            min="1"
            max="100"
            className={styles.slider}
          />
        </div>

        <div className={styles.configSection}>
          <label>Point Opacity</label>
          <input
            type="range"
            min="1"
            max="100"
            className={styles.slider}
          />
        </div>

        {/* Toggle Example */}
        <div className={styles.configSection}>
          <label className={styles.toggleWrapper}>
            <span>Show Heat Map</span>
            <input
              type="checkbox"
              className={styles.toggle}
            />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>

        <div className={styles.configSection}>
          <label className={styles.toggleWrapper}>
            <span>Show Cluster Outlines</span>
            <input
              type="checkbox"
              className={styles.toggle}
            />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationPanel; 