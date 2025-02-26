import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../lib/apiService';

const useColumnFilter = (userId, datasetId, scope) => {
  const [columnToValue, setColumnToValue] = useState({});

  const dataset = useMemo(() => {
    return scope?.dataset;
  }, [scope]);

  const columnFilters = useMemo(() => {
    if (!dataset?.column_metadata) return [];
    return Object.keys(dataset.column_metadata)
      .map((column) => ({
        column: column,
        categories: dataset.column_metadata[column].categories,
        counts: dataset.column_metadata[column].counts,
      }))
      .filter((d) => d.counts && Object.keys(d.counts).length > 1);
  }, [dataset]);

  const filter = async (column, value) => {
    let query = [
      {
        column: column,
        type: 'eq',
        value: value,
      },
    ];
    const res = await apiService.columnFilter(datasetId, query);
    console.log('column filter res', res);
    return res.indices;
  };

  const clear = () => {
    setColumnToValue({});
  };

  return {
    columnToValue,
    columnFilters,
    filter,
    clear,
  };
};

export default useColumnFilter;
