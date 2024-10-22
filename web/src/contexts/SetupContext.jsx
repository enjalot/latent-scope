import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiService } from '../lib/apiService';

const steps = ['Embed', 'UMAP', 'Cluster', 'Label Clusters', 'Scope'];

const SetupContext = createContext();

export const SetupProvider = ({ children }) => {
  const { dataset: datasetId, scope: scopeId } = useParams();

  const [dataset, setDataset] = useState(null);
  const [scope, setScope] = useState({});
  const [scopes, setScopes] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    apiService.getDataset(datasetId)
      .then(data => {
        setDataset(data)
      });
    apiService.getScopes(datasetId)
      .then(data => {
        setScopes(data)
      });
  }, [datasetId]);

  useEffect(() => {
    if(scopeId) {
      apiService.getScope(datasetId, scopeId)
        .then(data => {
          setScope(data)
        });
    } else {
      setScope(null)
    }
  }, [datasetId, scopeId]);

  const updateScope = useCallback((updates) => {
    setScope(prevScope => ({ ...prevScope, ...updates }));
  }, []);

  const goToNextStep = useCallback(() => {
    setCurrentStep(prev => prev + 1);
  }, []);

  const goToPreviousStep = useCallback(() => {
    setCurrentStep(prev => prev - 1);
  }, []);

  const value = {
    datasetId,
    dataset,
    setDataset,
    scope,
    scopes,
    updateScope,
    steps,
    currentStep,
    goToNextStep,
    goToPreviousStep,
    navigate
  };

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
};

export const useSetup = () => useContext(SetupContext);