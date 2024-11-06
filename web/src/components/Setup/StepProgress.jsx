import { useCallback } from 'react';
import { useSetup } from '../../contexts/SetupContext';
import { Tooltip } from 'react-tooltip';

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
          <h3
            key={index}
            onClick={() => {
              if(isCompleted(index)) {
                setCurrentStep(index + 1)
              }
            }}
            className={`${styles.step} ${isActive(index) ? styles.active : ''} ${
              isCompleted(index) && !isActive(index) ? styles.completed : ''
            }`}
          >
            {index + 1 + ". "} {step}
          </h3>
        ))}
      </div>

      <div className={styles.previewHeader}>
        <h3>Preview: {previewLabel}</h3>
      </div>

      <Tooltip id="saved" place="top" effect="solid">
        This selection is saved in the scope being configured.
      </Tooltip>
    </div>
  );
};

export default StepProgress;