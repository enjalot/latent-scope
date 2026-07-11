import { Modal, Button } from 'react-element-forge';
import { useCallback } from 'react';
import styles from './FeatureModal.module.scss';
import { useScope } from '../../contexts/ScopeContext';

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

  // Deep-link into the latent-taxonomy browser for whichever SAE this
  // scope's embedding model uses (the registry label is the taxonomy name).
  const { saeEntry } = useScope();
  const taxonomyName = saeEntry?.label || 'NOMIC_FWEDU_25k';
  const baseUrl = `https://enjalot.github.io/latent-taxonomy#model=${taxonomyName}&feature=`;
  const maxAct = Math.max(...topActs);
  const getWidth = (act) => {
    return `${(act / maxAct) * 100}%`;
  };

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
      // --ls-z-modal: sits above the point detail drawer (--ls-z-drawer)
      zIndex={510}
    >
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className="ls-overline">SAE FEATURES · ROW {rowIndex}</span>
          <span className={styles.title}>Top {TO_SHOW} activated features</span>
        </div>
        <button
          type="button"
          className="ls-icon-btn"
          onClick={onClose}
          aria-label="Close feature list"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className={styles.content}>
        {topIndices.slice(0, TO_SHOW).map((featIdx, i) => {
          const feature = features?.[featIdx];
          return (
            <div
              className={`${styles.item} ${featIdx === selectedFeature ? styles.itemSelected : ''}`}
              key={i}
            >
              <div
                className={`${styles.itemBackground} ${
                  hoveredIdx === i ? styles.itemBackgroundHovered : ''
                }`}
                style={{ width: getWidth(topActs[i]) }}
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
                <span className={styles.filterLabel}>{feature?.label}</span>
                <span className={styles.filterMeta}>
                  {topActs?.[i]?.toFixed(3)}/{feature?.dataset_max?.toFixed(3)} · n=
                  {feature?.dataset_count}
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
