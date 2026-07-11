import { useState, useCallback } from 'react';
import { Button, Modal } from 'react-element-forge';
import Settings from '../pages/Settings';
import { Tooltip } from 'react-tooltip';
import styles from './SettingsModal.module.scss';

const SettingsModal = ({
  tooltip = '',
  color = 'primary',
  variant = 'outline',
  onClose = () => {}, // Provide a no-op default function
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const handleClose = useCallback(() => {
    setShowSettings(false);
    if (onClose) onClose();
  }, [setShowSettings, onClose]);

  return (
    <>
      <Button
        color={color}
        variant={variant}
        icon="settings"
        onClick={() => setShowSettings(true)}
        text="Settings"
      />
      {tooltip && (
        <span className={styles.tooltipTrigger} data-tooltip-id="settings-modal">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
      )}
      {tooltip && (
        <Tooltip id="settings-modal" place="top" effect="solid" className="ls-tooltip" delayShow={300}>
          {tooltip}
        </Tooltip>
      )}

      {showSettings && (
        <Modal isVisible={showSettings} onClose={handleClose} className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalClose}>
              <button
                type="button"
                className="ls-icon-btn"
                onClick={handleClose}
                aria-label="Close settings"
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
            <Settings />
          </div>
        </Modal>
      )}
    </>
  );
};

export default SettingsModal;
