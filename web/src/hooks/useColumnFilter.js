import { useState, useEffect, useCallback, useMemo } from "react";

const useColumnFilter = (apiUrl, dataset, datasetId, points) => {
    const [columnIndices, setColumnIndices] = useState([]);
    const [columnFiltersActive, setColumnFiltersActive] = useState({});
    const [columnIndicesAnnotations, setColumnIndicesAnnotations] = useState([]);

    const columnFilters = useMemo(() => {
        if (!dataset?.column_metadata) return [];
        return Object.keys(dataset.column_metadata)
            .map((column) => ({
                column: column,
                categories: dataset.column_metadata[column].categories,
                counts: dataset.column_metadata[column].counts,
            }))
            .filter((d) => d.counts);
    }, [dataset]);

    const columnQuery = useCallback(
        (filters) => {
            let query = [];
            Object.keys(filters).forEach((c) => {
                let f = filters[c];
                if (f) {
                    query.push({
                        column: c,
                        type: "eq",
                        value: f,
                    });
                }
            });
            console.log("query", query);
            fetch(`${apiUrl}/column-filter`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ dataset: datasetId, filters: query }),
            })
                .then((response) => response.json())
                .then((data) => {
                    let indices = data.indices;
                    setColumnIndices(indices);
                });
        },
        [apiUrl, datasetId],
    );

    useEffect(() => {
        const annots = columnIndices.map(
            (index) => points[index]
        );
        setColumnIndicesAnnotations(annots);
    }, [columnIndices, points]);

    useEffect(() => {
        let active = Object.values(columnFiltersActive).filter((d) => !!d).length;
        // console.log("active filters", active, columnFiltersActive)
        if (active > 0) {
            columnQuery(columnFiltersActive);
        }
    }, [columnFiltersActive, columnQuery]);

    return {
        columnIndices,
        setColumnIndices,
        columnFiltersActive,
        setColumnFiltersActive,
        columnIndicesAnnotations,
        columnFilters,
    };
};

export default useColumnFilter;