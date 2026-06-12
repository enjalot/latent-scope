import { useState } from 'react';
import { apiService } from '../lib/apiService';
const MIN_THRESHOLD = 0.01;

const DEFAULT_FEATURE = -1;

export default function useFeatureFilter({ datasetId, scope }) {
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
        datasetId,
        scope?.sae_id,
        feature,
        threshold,
        100
      );
      console.log('feature filter data', data);
      const indices = data.top_row_indices;
      return indices;
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
