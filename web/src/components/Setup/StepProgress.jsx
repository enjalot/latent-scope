import { useCallback } from 'react';
import { useSetup } from '../../contexts/SetupContext';

import styles from './StepProgress.module.scss';

const StepProgress = () => {
  const { scope, currentStep, steps, stepIds, setCurrentStep } = useSetup();

  const isActive = useCallback((index) => {
    return index + 1 === currentStep
  }, [currentStep])
  // TODO: this needs to depend on the scope
  const isCompleted = useCallback((index) => {
    console.log("scope", scope, stepIds[index])
    return scope?.[stepIds[index]]
  }, [scope, stepIds,currentStep])

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
            {!isCompleted(index) && !isActive(index) ? index + 1 + ". " : ""} {step}
          </h3>
        ))}
      </div>

      <div className={styles.previewHeader}>
        {/* <h3>Preview</h3> */}
      </div>
    </div>
  );
};

export default StepProgress;