import { Modal, Button } from 'react-element-forge';
import { useCallback } from 'react';
import styles from './FeatureModal.module.scss';

function FeatureModal({
  isOpen,
  onClose,
  rowIndex,
  hoveredIdx,
  features,
  topIndices,
  topActs,
  selectedFeature,
  handleFeatureClick,
}) {
  const TO_SHOW = 15;

  const baseUrl = 'https://enjalot.github.io/latent-taxonomy#model=NOMIC_FWEDU_25k&feature=';
  const maxAct = Math.max(...topActs);
  const getWidth = (act) => {
    return `${(act / maxAct) * 100}%`;
  };

  const itemStyle = (featIdx) => ({
    fontWeight: featIdx === selectedFeature ? 'bold' : 'normal',
  });

  const featureClick = useCallback(
    (featIdx, activation) => {
      handleFeatureClick(featIdx, activation, features[featIdx]?.label);
      onClose();
    },
    [handleFeatureClick, onClose, features]
  );

  return (
    <Modal
      className={styles.featureModal}
      isVisible={isOpen}
      onClose={onClose}
      title={`Features for Index ${rowIndex}`}
    >
      <div className={styles.header}>
        <span className={styles.headerText}>Top {TO_SHOW} Activated SAE Features</span>
        <Button onClick={onClose} icon="x" color="primary" variant="outline" size="small" />
      </div>
      <div className={styles.content}>
        {topIndices.slice(0, TO_SHOW).map((featIdx, i) => {
          const feature = features?.[featIdx];
          return (
            <div className={styles.item} key={i} style={itemStyle(featIdx)}>
              <div
                className={styles.itemBackground}
                style={{
                  width: getWidth(topActs[i]),
                  borderBottom: hoveredIdx === i ? '2px solid #b87333' : 'none',
                  backgroundColor: hoveredIdx === i ? '#b87333' : '#aaa',
                }}
              />
              <div className={styles.featureLabel}>
                <Button
                  icon="filter"
                  color="primary"
                  variant="outline"
                  size="small"
                  onClick={() => featureClick(featIdx, topActs[i])}
                />
                <span
                  title={`${baseUrl}${featIdx}`}
                  onClick={() =>
                    window.open(`${baseUrl}${featIdx}`, '_blank', 'noopener,noreferrer')
                  }
                  className={styles.filterLink}
                >
                  {featIdx}:
                </span>
                <span className={styles.filterLabel}>
                  {feature?.label} [ activation: {topActs?.[i]?.toFixed(3)} /{' '}
                  {feature?.dataset_max?.toFixed(3)}] [count: {feature?.dataset_count}]
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default FeatureModal;
