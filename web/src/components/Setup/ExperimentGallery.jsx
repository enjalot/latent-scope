import { useCallback, useState } from 'react';
import { Button, Icon } from 'react-element-forge';
import { Badge } from '../ui';

import styles from './ExperimentGallery.module.scss';

/**
 * Reusable gallery of experiment cards for a dataset's UMAP or cluster runs.
 *
 * Renders each run as a card (thumbnail + editable title/description + param
 * badges + optional metrics) instead of a bare-id radio list. Selecting a card
 * calls `onSelect(item)` (preserving the "select this umap/cluster" flow);
 * the delete and "Proceed with X" affordances are preserved. Titles/descriptions
 * are editable inline and persisted through `onRename(item, { name, description })`
 * (which the parent wires to `apiService.updateUmapMeta` / `updateClusterMeta`).
 *
 * Props:
 *  - items: array of run rows (already filtered by the parent)
 *  - selectedId: id of the currently selected run
 *  - savedId: id of the run referenced by the saved scope (renders a SAVED badge)
 *  - onSelect(item): selection callback
 *  - onProceed(): advance to the next step with the selected run
 *  - proceedLabel: text for the proceed button (e.g. `Proceed with umap-001`)
 *  - onDelete(item): delete callback
 *  - isDeleteDisabled: boolean, disables all delete buttons (job in flight)
 *  - onRename(item, { name, description }) => Promise: persist edited meta
 *  - renderInfo(item): JSX for the primary param badges
 *  - renderMetrics(item): optional JSX rendered under the thumbnail (metrics)
 *  - renderExtra(item): optional JSX (e.g. aligned-umap thumbnails)
 */
function ExperimentGallery({
  items = [],
  selectedId,
  savedId,
  onSelect,
  onProceed,
  proceedLabel,
  onDelete,
  isDeleteDisabled = false,
  onRename,
  renderInfo,
  renderMetrics,
  renderExtra,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingId, setSavingId] = useState(null);

  const startEditing = useCallback((item) => {
    setEditingId(item.id);
    setEditName(item.name || '');
    setEditDescription(item.description || '');
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  }, []);

  const saveEditing = useCallback(
    (item) => {
      if (!onRename) {
        cancelEditing();
        return;
      }
      setSavingId(item.id);
      Promise.resolve(onRename(item, { name: editName, description: editDescription }))
        .catch((err) => console.error('Error renaming experiment', err))
        .finally(() => {
          setSavingId(null);
          setEditingId(null);
        });
    },
    [onRename, editName, editDescription, cancelEditing]
  );

  return (
    <div className={styles['gallery']}>
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const isEditing = item.id === editingId;
        const title = item.name || item.id;
        return (
          <div
            key={item.id}
            className={styles['card'] + (isSelected ? ' ' + styles['selected'] : '')}
            onClick={() => {
              if (!isEditing && !isSelected) onSelect?.(item);
            }}
          >
            <div className={styles['card-header']}>
              {isEditing ? (
                <div className={styles['edit-form']} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    className={styles['edit-name']}
                    placeholder="Name"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <input
                    type="text"
                    className={styles['edit-description']}
                    placeholder="Description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                  <div className={styles['edit-actions']}>
                    <Button
                      size="small"
                      color="primary"
                      disabled={savingId === item.id}
                      onClick={() => saveEditing(item)}
                      text="Save"
                    />
                    <Button
                      size="small"
                      color="secondary"
                      variant="outline"
                      disabled={savingId === item.id}
                      onClick={cancelEditing}
                      text="Cancel"
                    />
                  </div>
                </div>
              ) : (
                <div className={styles['title-row']}>
                  <span className={styles['title']}>
                    {title}
                    {item.name ? <span className={styles['title-id']}> ({item.id})</span> : null}
                    {savedId === item.id ? (
                      <span className={styles['saved']} data-tooltip-id="saved">
                        <Badge mono variant="neutral">SAVED</Badge>
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="ls-icon-btn"
                    title="Rename / describe"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(item);
                    }}
                  >
                    <Icon name="edit-2" size={16} />
                  </button>
                </div>
              )}
              {!isEditing && item.description ? (
                <div className={styles['description']}>{item.description}</div>
              ) : null}
              {renderInfo ? <div className={styles['info']}>{renderInfo(item)}</div> : null}
            </div>

            {item.url ? (
              <img className={styles['thumbnail']} src={item.url} alt={item.id} />
            ) : null}

            {renderExtra ? renderExtra(item) : null}
            {renderMetrics ? renderMetrics(item) : null}

            <div className={styles['card-footer']}>
              {isSelected && onProceed ? (
                <Button
                  className={styles['proceed']}
                  onClick={(e) => {
                    e.stopPropagation();
                    onProceed();
                  }}
                  text={proceedLabel || `Proceed with ${item.id}`}
                />
              ) : (
                <span />
              )}
              <Button
                className={styles['delete']}
                color="delete"
                variant="outline"
                size="small"
                icon="trash"
                label="Delete run"
                disabled={isDeleteDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(item);
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ExperimentGallery;
