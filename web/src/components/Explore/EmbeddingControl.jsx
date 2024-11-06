import React, { useState, useEffect } from 'react';
import EmbeddingVis from '../EmbeddingVis';

const EmbeddingControls = ({
    showEmbeddings,
    handleShowEmbeddings,
    searchEmbedding,
    rows,
    embeddingMinValues,
    embeddingMaxValues,
    embeddings,
    showDifference,
    handleShowDifference,
}) => {
    const height = 64;
    const spacing = 0;

    // ====================================================================================================
    // Embeddings
    // ====================================================================================================
    // const [showEmbeddings, setShowEmbeddings] = useState(null);
    // const handleShowEmbeddings = useCallback(() => {
    //   setShowEmbeddings(showEmbeddings ? null : searchModel);
    // }, [searchModel, showEmbeddings]);

    // const [showDifference, setShowDifference] = useState(false);
    // const handleShowDifference = useCallback(() => {
    //   setShowDifference(!showDifference);
    // }, [showDifference]);

    // useEffect(() => {
    //   // console.log("search model", searchModel)
    //   if (showEmbeddings) {
    //     setShowEmbeddings(searchModel);
    //   }
    // }, [searchModel, showEmbeddings]);

    // const [embeddingMinValues, setEmbeddingMinValues] = useState([]);
    // const [embeddingMaxValues, setEmbeddingMaxValues] = useState([]);
    // // get the min and max values for the embedding
    // useEffect(() => {
    //   if (searchModel) {
    //     fetch(`${apiUrl}/datasets/${datasetId}/embeddings/${searchModel}`)
    //       .then((response) => response.json())
    //       .then((data) => {
    //         console.log("embedding stats", data);
    //         setEmbeddingMinValues(data.min_values);
    //         setEmbeddingMaxValues(data.max_values);
    //       });
    //   }
    // }, [datasetId, searchModel]);

    const [averageEmbedding, setAverageEmbedding] = useState([])
    useEffect(() => {
        if (rows.length > 0) {
            // Calculate column-wise average of all embeddings in rows
            const avg = rows.reduce((acc, row) => {
                if (row.ls_embedding && Array.isArray(row.ls_embedding)) {
                    return acc.map((sum, i) => sum + (row.ls_embedding[i] || 0));
                }
                return acc;
            }, new Array(rows[0]?.ls_embedding?.length || 0).fill(0));
            // Divide the sum by the number of rows to get the average
            const avgEmbedding = avg.map(sum => sum / rows.length);
            setAverageEmbedding(avgEmbedding);
        }
    }, [rows]);

    return (
        <>
            <div>
                <button onClick={handleShowEmbeddings}>{showEmbeddings ? "Hide" : "Show"} Embeddings</button>
                <br />
                {showEmbeddings ? <button onClick={handleShowDifference}>{showDifference ? "Show Absolute" : "Show Difference"}</button> : null}
            </div>
            {showEmbeddings && searchEmbedding?.length ?
                <div>
                    <span>Search embedding</span><br />
                    <EmbeddingVis embedding={searchEmbedding} minValues={embeddingMinValues} maxValues={embeddingMaxValues} height={height} spacing={spacing} />
                </div> : null}
            {showEmbeddings && averageEmbedding.length ?
                <div>
                    <span>Average embedding (over {rows.length} rows)</span><br />
                    {showDifference && searchEmbedding?.length ?
                        <EmbeddingVis embedding={averageEmbedding} minValues={embeddingMinValues} maxValues={embeddingMaxValues} height={height} spacing={spacing} difference={searchEmbedding} />
                        :
                        <EmbeddingVis embedding={averageEmbedding} minValues={embeddingMinValues} maxValues={embeddingMaxValues} height={height} spacing={spacing} />
                    }
                </div> : null}
            {showEmbeddings ? <div>
                <span>{showEmbeddings}</span>
                <span>{embeddings.find(e => e.id === showEmbeddings)?.model_id}</span>
                <span>{embeddings.find(e => e.id === showEmbeddings)?.dimensions}</span>
            </div> : null}
        </>
    );
};

export default EmbeddingControls;