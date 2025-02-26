import { useState, useEffect, useRef } from 'react';
import { apiService } from '../lib/apiService';
import { useScope } from '../contexts/ScopeContext';
const MIN_THRESHOLD = 0.01;
const MAX_THRESHOLD = 0.2;

const DEFAULT_FEATURE = -1;

export default function useFeatureFilter({ userId, datasetId, scope, scopeLoaded }) {
  const [feature, setFeature] = useState(DEFAULT_FEATURE);
  const [threshold, setThreshold] = useState(MIN_THRESHOLD);
  // const { features } = useScope();
  // useEffect(() => {
  //   if (feature >= 0) {
  //     const maxActivation = features[feature]?.dataset_max || 0;
  //     let t =
  //       maxActivation < MIN_THRESHOLD
  //         ? MIN_THRESHOLD
  //         : maxActivation > MAX_THRESHOLD
  //           ? MAX_THRESHOLD
  //           : maxActivation;
  //     console.log('SETTING THRESHOLD', t, maxActivation);
  //     setThreshold(t);
  //   }
  // }, [feature, features, setThreshold]);

  const filter = async () => {
    console.log('feature filter', threshold);
    if (feature >= 0) {
      const data = await apiService.searchSaeFeature(
        userId,
        datasetId,
        scope?.id,
        feature,
        threshold
      );
      console.log('feature filter data', data);
      return data;
    }
    return [];
  };

  const clear = () => {
    setFeature(DEFAULT_FEATURE);
    setThreshold(MIN_THRESHOLD);
  };

  return {
    feature,
    setFeature,
    threshold,
    filter,
    clear,
  };
}
