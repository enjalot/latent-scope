// web/src/components/BulkActions.jsx
import React from 'react';
import Tagging from "../Bulk/Tagging";
import Clustering from "../Bulk/Clustering";
import Deleting from "../Bulk/Deleting";

function BulkActions({
    bulkAction,
    setBulkAction,
    dataset,
    scope,
    intersectedIndices,
    fetchTagSet,
    fetchScopeMeta,
    fetchScopeRows,
    clearFilters
}) {
    return (
        <>
            <div className="bulk-actions-buttons">
                Bulk Actions:
                <button
                    title="Add tags to rows"
                    className={`bulk ${bulkAction === "tag" ? "active" : ""}`}
                    onClick={() =>
                        bulkAction === "tag"
                            ? setBulkAction(null)
                            : setBulkAction("tag")
                    }
                >
                    🏷️
                </button>
                <button
                    title="Change cluster of rows"
                    className={`bulk ${bulkAction === "cluster" ? "active" : ""}`}
                    onClick={() =>
                        bulkAction === "cluster"
                            ? setBulkAction(null)
                            : setBulkAction("cluster")
                    }
                >
                    ️📍
                </button>
                <button
                    title="Delete rows"
                    className={`bulk ${bulkAction === "delete" ? "active" : ""}`}
                    onClick={() =>
                        bulkAction === "delete"
                            ? setBulkAction(null)
                            : setBulkAction("delete")
                    }
                >
                    🗑️
                </button>
            </div>
            <div className="bulk-actions-action">
                {bulkAction === "tag" ? (
                    <Tagging
                        dataset={dataset}
                        indices={intersectedIndices}
                        onSuccess={() => {
                            setBulkAction(null);
                            fetchTagSet();
                        }}
                    />
                ) : null}
                {bulkAction === "cluster" ? (
                    <Clustering
                        dataset={dataset}
                        scope={scope}
                        indices={intersectedIndices}
                        onSuccess={() => {
                            setBulkAction(null);
                            fetchScopeMeta();
                            fetchScopeRows();
                        }}
                    />
                ) : null}
                {bulkAction === "delete" ? (
                    <Deleting
                        dataset={dataset}
                        scope={scope}
                        indices={intersectedIndices}
                        onSuccess={() => {
                            setBulkAction(null);
                            clearFilters();
                            fetchScopeMeta();
                            fetchScopeRows();
                        }}
                    />
                ) : null}
            </div>
        </>
    );
}

export default BulkActions;