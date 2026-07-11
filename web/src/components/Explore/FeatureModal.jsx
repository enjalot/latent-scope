import { Modal, Button } from 'react-element-forge';
import { useCallback, useMemo } from 'react';
import { useScope } from '../../contexts/ScopeContext';
import { getLabelsForSaeModel } from '../../lib/SAE';
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
  const { sae, saeEntry } = useScope();

  // Deep-link into the latent-taxonomy browser for THIS scope's SAE:
  // scope-declared SAEs (e.g. token SAEs) resolve by the SAE's model repo,
  // pretrained registry SAEs by the embedding model's registry entry.
  const taxonomyName =
    getLabelsForSaeModel(sae?.model_id)?.label || saeEntry?.label || 'NOMIC_FWEDU_25k';
  const baseUrl = `https://enjalot.github.io/latent-taxonomy#model=${taxonomyName}&feature=`;

  // The SAE h5 stores top-k indices/acts in arbitrary order (torch topk with
  // sorted=False), so "top 15" must sort by activation here — slicing the raw
  // array showed an arbitrary subset and dropped genuinely strong features.
  // origIdx preserves the position in the unsorted array, which is what the
  // canvas hover (hoveredIdx) refers to.
  const ranked = useMemo(
    () =>
      topIndices
        .map((featIdx, origIdx) => ({ featIdx, act: topActs[origIdx], origIdx }))
        .filter(({ act }) => act > 0)
        .sort((a, b) => b.act - a.act),
    [topIndices, topActs]
  );

  const maxAct = ranked.length ? ranked[0].act : 1;
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
        {ranked.slice(0, TO_SHOW).map(({ featIdx, act, origIdx }, i) => {
          const feature = features?.[featIdx];
          return (
            <div
              className={`${styles.item} ${featIdx === selectedFeature ? styles.itemSelected : ''}`}
              key={i}
            >
              <div
                className={`${styles.itemBackground} ${
                  hoveredIdx === origIdx ? styles.itemBackgroundHovered : ''
                }`}
                style={{ width: getWidth(act) }}
              />
              <div className={styles.featureLabel}>
                <Button
                  icon="filter"
                  color="primary"
                  variant="outline"
                  size="small"
                  onClick={() => featureClick(featIdx, act)}
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
                  {act?.toFixed(3)}/{feature?.dataset_max?.toFixed(3)} · n=
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
