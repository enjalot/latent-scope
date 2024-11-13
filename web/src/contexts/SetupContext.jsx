import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiService } from '../lib/apiService';

const steps = ['Embed', 'UMAP', 'Cluster', 'Label Clusters', 'Scope'];
const stepIds = ['embedding_id', 'umap_id', 'cluster_id', 'cluster_labels_id', 'id'];

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
        setCurrentStep(5);
      });
    } else {
      console.log('setting scope to null');
      setScope(null);
      setSavedScope(null);
      setCurrentStep(1);
    }
  }, [datasetId, scopeId]);

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
