import { processHulls } from '../utils';
import { useState, useCallback } from 'react';

const useScopeData = (apiUrl, datasetId, scope) => {
    const [clusterMap, setClusterMap] = useState({});
    const [clusterIndices, setClusterIndices] = useState([]);
    const [clusterLabels, setClusterLabels] = useState([]);
    const [points, setPoints] = useState([]);
    const [drawPoints, setDrawPoints] = useState([]);
    const [hulls, setHulls] = useState([]);
    const [scopeRows, setScopeRows] = useState([]);
    const [scopeToInputIndexMap, setScopeToInputIndexMap] = useState({});
    const [inputToScopeIndexMap, setInputToScopeIndexMap] = useState({});

    const fetchScopeRows = useCallback(() => {
        fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/parquet`)
            .then((response) => response.json())
            .then((scopeRows) => {
                console.log("scope rows", scopeRows);
                setScopeRows(scopeRows);

                // Calculate scopeIndexMap
                let sim = {};
                let ism = {};
                scopeRows.forEach((d, i) => {
                    ism[d.ls_index] = i;
                    sim[i] = d.ls_index;
                });
                setScopeToInputIndexMap(sim);
                setInputToScopeIndexMap(ism);

                const pts = scopeRows.map((d) => [d.x, d.y]);
                setPoints(pts);

                const dpts = scopeRows.map((d, i) => [d.x, d.y, d.cluster]);
                setDrawPoints(dpts);
                setHulls([]);

                const labelsData = scope.cluster_labels_lookup || [];
                setClusterLabels(labelsData);
                setClusterIndices(scopeRows.map((d) => d.cluster));

                let clusterMap = {};
                scopeRows.forEach((d) => {
                    clusterMap[d.ls_index] = scope.cluster_labels_lookup?.[d.cluster];
                });
                setClusterMap(clusterMap);

                setTimeout(() => {
                    if (labelsData) setHulls(processHulls(labelsData, pts, ism));
                }, 100);
            })
            .catch((error) => console.error("Fetching data failed", error));
    }, [apiUrl, datasetId, scope]);

    return {
        clusterMap,
        clusterIndices,
        clusterLabels,
        scopeRows,
        points,
        drawPoints,
        hulls,
        scopeToInputIndexMap,
        inputToScopeIndexMap,
        fetchScopeRows,
        setClusterLabels,
    };
};

export default useScopeData;