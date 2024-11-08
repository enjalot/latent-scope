import { useEffect, useState, useCallback, useMemo } from 'react';

const useCurrentScope = (datasetId, scopeId, apiUrl) => {
    const [dataset, setDataset] = useState(null);

    useEffect(() => {
        fetch(`${apiUrl}/datasets/${datasetId}/meta`)
            .then((response) => response.json())
            .then((data) => {
                console.log("dataset", data);
                setDataset(data);
            });
    }, [datasetId, setDataset]);

    // the current scope being used
    const [scope, setScope] = useState(null);
    const fetchScopeMeta = useCallback(() => {
        fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
            .then((response) => response.json())
            .then((data) => {
                console.log("scope", data);
                setScope(data);
            });
    }, [datasetId, scopeId, setScope]);

    // all scopes available for this dataset
    const [scopes, setScopes] = useState([]);
    useEffect(() => {
        fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
            .then((response) => response.json())
            .then((data) => {
                setScopes(data);
            });
    }, [datasetId, setScopes]);

    useEffect(() => {
        fetchScopeMeta();
    }, [datasetId, scopeId, fetchScopeMeta]);

    // embeddings available for this dataset
    // TODO: don't think we need this actually if we are just
    // using the single embedding from the current scope
    const [embeddings, setEmbeddings] = useState([]);
    useEffect(() => {
        fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
            .then((response) => response.json())
            .then((data) => {
                setEmbeddings(data);
            });
    }, [datasetId, setEmbeddings]);

    const [tagset, setTagset] = useState({});
    const fetchTagSet = useCallback(() => {
        fetch(`${apiUrl}/tags?dataset=${datasetId}`)
            .then((response) => response.json())
            .then((data) => setTagset(data));
    }, [datasetId, setTagset]);

    useEffect(() => {
        fetchTagSet();
    }, [fetchTagSet]);

    const tags = useMemo(() => {
        const tags = [];
        for (const tag in tagset) {
            tags.push(tag);
        }
        // console.log("tagset", tagset, tags)
        return tags;
    }, [tagset]);


    return { dataset, setDataset, scope, setScope, fetchScopeMeta, scopes, embeddings, tagset, fetchTagSet, setTagset, tags };
};

export default useCurrentScope;