import { useCallback } from 'react';
import { useSetup } from '../../contexts/SetupContext';
import { Tooltip } from 'react-tooltip';
import { StatusDiode } from '../ui';

import styles from './StepProgress.module.scss';

const StepProgress = () => {
  const { scope, currentStep, steps, stepIds, setCurrentStep, previewLabel } = useSetup();

  const isActive = useCallback((index) => {
    return index + 1 === currentStep
  }, [currentStep])

  const currentStepId = useCallback((index) => {
    return scope?.[stepIds[index]]
  }, [scope, stepIds])

  const isCompleted = useCallback((index) => {
    return currentStepId(index) != null
  }, [currentStepId])

  return (
    <div className={styles.stepProgressContainer}>
      <div className={styles.stepProgress}>
        {steps.map((step, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              if(isCompleted(index)) {
                setCurrentStep(index + 1)
              }
            }}
            disabled={!isCompleted(index) && !isActive(index)}
            className={`${styles.step} ${isActive(index) ? styles.active : ''} ${
              isCompleted(index) && !isActive(index) ? styles.completed : ''
            }`}
          >
            <StatusDiode
              status={isActive(index) ? 'busy' : isCompleted(index) ? 'ready' : 'offline'}
              pulse={isActive(index)}
            />
            <span>
              {index + 1 + '. '} {step}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.previewHeader}>
        {previewLabel && (
          <h3>
            Preview: <span className={styles.previewId}>{previewLabel}</span>
          </h3>
        )}
      </div>

      <Tooltip id="saved" place="top" effect="solid">
        This selection is saved in the scope being configured.
      </Tooltip>
    </div>
  );
};

export default StepProgress;
