import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiService } from '../lib/apiService';

const BASE_STEPS = ['Embed', 'UMAP', 'Cluster', 'Label Clusters', 'Scope'];
const BASE_STEP_IDS = ['embedding_id', 'umap_id', 'cluster_id', 'cluster_labels_id', 'id'];

function datasetHasImageColumn(dataset) {
  const cm = dataset?.column_metadata || {};
  return Object.values(cm).some((m) => m?.type === 'image');
}

const SetupContext = createContext();

export const SetupProvider = ({ children }) => {
  const { dataset: datasetId, scope: scopeId } = useParams();

  const [dataset, setDataset] = useState(null);
  const [scope, setScope] = useState({});
  const [savedScope, setSavedScope] = useState(null);
  const [scopes, setScopes] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [previewLabel, setPreviewLabel] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Append an optional "Images" step (sprite atlases) for image datasets only.
  // It uses stepId 'id' so it counts as available once a scope is saved.
  const steps = useMemo(
    () => (datasetHasImageColumn(dataset) ? [...BASE_STEPS, 'Images'] : BASE_STEPS),
    [dataset]
  );
  const stepIds = useMemo(
    () => (datasetHasImageColumn(dataset) ? [...BASE_STEP_IDS, 'id'] : BASE_STEP_IDS),
    [dataset]
  );

  useEffect(() => {
    apiService.fetchDataset(datasetId).then((data) => {
      setDataset(data);
    });
    apiService.fetchScopes(datasetId).then((data) => {
      setScopes(data);
    });
  }, [datasetId]);

  useEffect(() => {
    if (scopeId) {
      apiService.fetchScope(datasetId, scopeId).then((data) => {
        setScope(data);
        setSavedScope(data);
        console.log('setting saved scope', data);
        setIsLoaded(true);
        // a saved scope lands on the Scope step unless the URL asks for a
        // specific step (e.g. ?step=6 to continue to Images after saving)
        const stepParam = Number(new URLSearchParams(location.search).get('step'));
        setCurrentStep(stepParam >= 1 ? stepParam : 5);
      });
    } else {
      console.log('setting scope to null');
      setScope(null);
      setSavedScope(null);
      setCurrentStep(1);
    }
  }, [datasetId, scopeId, location.search]);

  const updateScope = useCallback((updates) => {
    setScope((prevScope) => ({ ...prevScope, ...updates }));
  }, []);

  const goToNextStep = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
  }, []);

  const goToPreviousStep = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
  }, []);

  const value = {
    datasetId,
    dataset,
    setDataset,
    scope,
    setScope,
    savedScope,
    setSavedScope,
    scopes,
    setScopes,
    updateScope,
    steps,
    stepIds,
    currentStep,
    setCurrentStep,
    goToNextStep,
    goToPreviousStep,
    navigate,
    previewLabel,
    setPreviewLabel,
    isLoaded,
  };

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
};

export const useSetup = () => useContext(SetupContext);
