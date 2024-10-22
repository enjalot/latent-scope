import React from 'react';
import { useSetup } from '../../contexts/SetupContext';

import styles from './StepProgress.module.scss';

const StepProgress = () => {
  const { currentStep, steps } = useSetup();

  return (
    <div className={styles.stepProgressContainer}>
      <div className={styles.stepProgress}>
        {steps.map((step, index) => (
          <h3
            key={index}
            className={`${styles.step} ${index + 1 === currentStep ? styles.active : ''} ${
              index + 1 < currentStep ? styles.completed : ''
            }`}
          >
            {index + 1}. {step}
          </h3>
        ))}
      </div>

      <div className={styles.previewHeader}>
        <h3>Preview</h3>
      </div>
    </div>
  );
};

export default StepProgress;