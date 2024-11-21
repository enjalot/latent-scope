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
        onClick={() => setShowSettings(true)}
        text="⚙️ Settings"
      />
      {tooltip && (
        <span className="tooltip" data-tooltip-id="settings-modal">
          🤔
        </span>
      )}
      {tooltip && (
        <Tooltip id="settings-modal" place="top" effect="solid" className="tooltip-area">
          {tooltip}
        </Tooltip>
      )}

      {showSettings && (
        <Modal isVisible={showSettings} onClose={handleClose} className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalClose}>
              <Button onClick={handleClose} icon="x" color="primary" variant="outline" />
            </div>
            <Settings />
          </div>
        </Modal>
      )}
    </>
  );
};

export default SettingsModal;
