import { processHulls } from '../utils';
import { useState, useCallback, useEffect } from 'react';
import { apiService } from '../lib/apiService';

const useScopeData = (apiUrl, datasetId, scope) => {
    const [clusterMap, setClusterMap] = useState({});
    const [clusterIndices, setClusterIndices] = useState([]);
    const [clusterLabels, setClusterLabels] = useState([]);
    const [points, setPoints] = useState([]);
    const [drawPoints, setDrawPoints] = useState([]);
    const [hulls, setHulls] = useState([]);
    const [scopeRows, setScopeRows] = useState([]);

    const [deletedIndices, setDeletedIndices] = useState([]);

    const [sae, setSae] = useState(null)
    useEffect(() => {
        if(scope?.sae_id) {
            apiService.fetchSae(datasetId, scope.sae_id).then(sae => {
                console.log("SAE", sae)
                setSae(sae)
            })
        }
    }, [scope])

    const fetchScopeRows = useCallback(() => {
        fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/parquet`)
            .then((response) => response.json())
            .then((scopeRows) => {
                console.log("scopeRows", scopeRows)
                setScopeRows(scopeRows);

                let clusterMap = {};
                let nonDeletedClusters = new Set();
                scopeRows.forEach((d) => {
                    const label = scope.cluster_labels_lookup?.[d.cluster];
                    clusterMap[d.ls_index] = label;
                    if (!d.deleted) {
                        nonDeletedClusters.add(label.cluster);
                    }
                });
                // only take the labels of clusters that belong to rows that are not deleted 
                const labelsData = scope.cluster_labels_lookup.filter((l) => nonDeletedClusters.has(l.cluster)) || [];

                setClusterLabels(labelsData);
                setClusterIndices(scopeRows.map((d) => d.cluster));

                setClusterMap(clusterMap);

                setDeletedIndices(scopeRows.filter(d => d.deleted).map(d => d.ls_index));
            })
            .catch((error) => console.error("Fetching data failed", error));
    }, [apiUrl, datasetId, scope]);

    return {
        clusterMap,
        clusterIndices,
        clusterLabels,
        scopeRows,
        fetchScopeRows,
        deletedIndices,
        sae
    };
};

export default useScopeData;