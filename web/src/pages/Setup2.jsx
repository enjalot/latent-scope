
import './Setup.css';

import { SetupProvider, useSetup } from '../contexts/SetupContext';
import SetupHeader from '../components/Setup/Header';
import Embedding from '../components/Setup/Embedding';
import Umap from '../components/Setup/Umap';
import Cluster from '../components/Setup/Cluster';
import ClusterLabels from '../components/Setup/ClusterLabels';
import Scope from '../components/Setup/Scope';

import StepProgress from '../components/Setup/StepProgress';

import Stage from '../components/Setup/Stage';
import styles from './Setup.module.scss';

 
const stepComponents = {
  1: Embedding,
  // 2: Umap,
  // 3: Cluster,
  // 4: ClusterLabels,
  // 5: Scope,
};

function StepRenderer() {
  const { currentStep } = useSetup();
  const StepComponent = stepComponents[currentStep];

  return StepComponent ? <StepComponent /> : null;
} 


function Setup() {
  return (
    <SetupProvider>
      <div className={styles.setup}>
        <SetupHeader />
        <div className={styles.steps}>
          <StepProgress />
          <div className={styles.stepRenderer}>
            <StepRenderer />
          </div>
        </div>
      </div>
    </SetupProvider>
  );
}

export default Setup;