import { useState, useCallback, useEffect } from 'react';

export default function useNearestNeighborsSearch({
    apiUrl,
    datasetId,
    scope,
    embeddings,
    inputToScopeIndexMap,
    onSearchEmbedding
}) {
    const [searchIndices, setSearchIndices] = useState([]);
    const [distances, setDistances] = useState([]);
    const [searchText, setSearchText] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const search = useCallback(
        async (query) => {
            const emb = embeddings?.find((d) => d.id === scope.embedding_id);
            const embeddingDimensions = emb?.dimensions;

            const searchParams = new URLSearchParams({
                dataset: datasetId,
                query,
                embedding_id: scope.embedding_id,
                ...(embeddingDimensions !== undefined
                    ? { dimensions: embeddingDimensions }
                    : {}),
            });

            setIsLoading(true);
            try {
                const response = await fetch(
                    `${apiUrl}/search/nn?${searchParams.toString()}`
                );
                const data = await response.json();

                let dists = [];
                let inds = data.indices
                    .map((idx, i) => {
                        dists[idx] = data.distances[i];
                        return idx;
                    })
                    .filter((idx) => inputToScopeIndexMap[idx] >= 0);

                setDistances(dists);
                setSearchIndices(inds);
                onSearchEmbedding?.(data.search_embedding[0]);
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setIsLoading(false);
            }
        },
        [apiUrl, datasetId, scope, embeddings, inputToScopeIndexMap, onSearchEmbedding]
    );

    const clearSearch = useCallback(() => {
        setSearchText("");
        setSearchIndices([]);
        setDistances([]);
    }, []);

    // Trigger search when searchText changes
    useEffect(() => {
        if (searchText) {
            search(searchText);
        }
    }, [searchText, search]);

    return {
        searchText,
        setSearchText,
        setSearchIndices,
        searchIndices,
        distances,
        isLoading,
        search,
        clearSearch
    };
}