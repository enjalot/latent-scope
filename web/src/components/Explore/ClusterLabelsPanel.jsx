import { useMemo, useState, useCallback } from 'react';
import { Button } from 'react-element-forge';
import { useScope } from '../../contexts/ScopeContext';
import { useFilter } from '../../contexts/FilterContext';
import { filterConstants } from './V2/Search/utils';
import ClusterIcon from './V2/Search/ClusterIcon';
import styles from './ClusterLabelsPanel.module.scss';

// Compute cluster centroids from scope rows
const computeClusterCentroids = (scopeRows) => {
  const clusterSums = {};
  const clusterCounts = {};

  scopeRows.forEach((row) => {
    const clusterId = row.cluster;
    if (clusterId === undefined || clusterId === null) return;

    if (!clusterSums[clusterId]) {
      clusterSums[clusterId] = { x: 0, y: 0 };
      clusterCounts[clusterId] = 0;
    }
    clusterSums[clusterId].x += row.x;
    clusterSums[clusterId].y += row.y;
    clusterCounts[clusterId] += 1;
  });

  const centroids = {};
  Object.keys(clusterSums).forEach((clusterId) => {
    centroids[clusterId] = {
      x: clusterSums[clusterId].x / clusterCounts[clusterId],
      y: clusterSums[clusterId].y / clusterCounts[clusterId],
    };
  });

  return centroids;
};

// Nearest neighbor traversal starting from top-left
const nearestNeighborSort = (clusters, centroids) => {
  if (!clusters || clusters.length === 0) return [];
  if (!centroids || Object.keys(centroids).length === 0) {
    // Fallback to alphabetical if no centroids available
    return [...clusters].sort((a, b) => a.label.localeCompare(b.label));
  }

  // Create a copy with centroid info
  const clustersWithPos = clusters.map((c) => ({
    ...c,
    centroid: centroids[c.cluster] || { x: 0, y: 0 },
  }));

  // Find top-left cluster (min x, max y - since y typically increases downward in screen coords,
  // we want min y for top, but in projection space y might be inverted, so use max y - min x)
  // Actually, let's use a scoring function: top-left means small x and large y
  // Score = -x + y (higher score = more top-left)
  const findTopLeft = (items) => {
    let topLeftIdx = 0;
    let bestScore = -Infinity;
    items.forEach((item, idx) => {
      const score = -item.centroid.x + item.centroid.y;
      if (score > bestScore) {
        bestScore = score;
        topLeftIdx = idx;
      }
    });
    return topLeftIdx;
  };

  // Euclidean distance between two centroids
  const distance = (a, b) => {
    const dx = a.centroid.x - b.centroid.x;
    const dy = a.centroid.y - b.centroid.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Greedy nearest neighbor traversal
  const result = [];
  const remaining = [...clustersWithPos];

  // Start with top-left cluster
  const startIdx = findTopLeft(remaining);
  result.push(remaining.splice(startIdx, 1)[0]);

  // Greedily add nearest unvisited neighbor
  while (remaining.length > 0) {
    const current = result[result.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    remaining.forEach((item, idx) => {
      const dist = distance(current, item);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    });

    result.push(remaining.splice(nearestIdx, 1)[0]);
  }

  // Return without centroid info
  return result.map(({ centroid, ...rest }) => rest);
};

// Sort order definitions - extensible for future sort orders
// Use compareFn for simple sorts, sortFn for complex sorts like nearest neighbor
const SORT_ORDERS = {
  alphabetical: {
    label: 'A-Z',
    compareFn: (a, b) => a.label.localeCompare(b.label),
  },
  alphabeticalDesc: {
    label: 'Z-A',
    compareFn: (a, b) => b.label.localeCompare(a.label),
  },
  countDesc: {
    label: 'Count (High)',
    compareFn: (a, b) => b.count - a.count,
  },
  countAsc: {
    label: 'Count (Low)',
    compareFn: (a, b) => a.count - b.count,
  },
  clusterIndex: {
    label: 'Cluster #',
    compareFn: (a, b) => a.cluster - b.cluster,
  },
  nearestNeighbor: {
    label: 'Nearest Neighbor',
    // Uses sortFn instead of compareFn - requires centroids
    sortFn: nearestNeighborSort,
  },
};

// Mini bar chart component for showing relative cluster size
const ClusterBar = ({ count, maxCount, isActive }) => {
  const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className={styles.clusterBar}>
      <div
        className={`${styles.clusterBarFill} ${isActive ? styles.clusterBarFillActive : ''}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

const ClusterLabelsPanel = () => {
  const [sortOrder, setSortOrder] = useState('alphabetical');
  const { clusterLabels, scopeRows } = useScope();
  const {
    clusterFilter,
    setFilterConfig,
    setFilterActive,
    setFilterQuery,
    setUrlParams,
    filterConfig,
  } = useFilter();

  // Determine active cluster from filter config
  const activeClusterIndex = useMemo(() => {
    if (filterConfig?.type === filterConstants.CLUSTER) {
      return filterConfig.value;
    }
    return null;
  }, [filterConfig]);

  // Compute cluster centroids for spatial sorting
  const clusterCentroids = useMemo(() => {
    if (!scopeRows || scopeRows.length === 0) return {};
    return computeClusterCentroids(scopeRows);
  }, [scopeRows]);

  const sortedLabels = useMemo(() => {
    if (!clusterLabels || clusterLabels.length === 0) return [];
    const sortConfig = SORT_ORDERS[sortOrder];

    // Use sortFn for complex sorts (like nearest neighbor), compareFn for simple sorts
    if (sortConfig.sortFn) {
      return sortConfig.sortFn(clusterLabels, clusterCentroids);
    }
    return [...clusterLabels].sort(sortConfig.compareFn);
  }, [clusterLabels, sortOrder, clusterCentroids]);

  // Calculate max count for relative bar sizing
  const maxCount = useMemo(() => {
    if (!clusterLabels || clusterLabels.length === 0) return 0;
    return Math.max(...clusterLabels.map((c) => c.count));
  }, [clusterLabels]);

  // Calculate total points across all clusters
  const totalPoints = useMemo(() => {
    if (!clusterLabels || clusterLabels.length === 0) return 0;
    return clusterLabels.reduce((sum, c) => sum + c.count, 0);
  }, [clusterLabels]);

  const handleClusterClick = useCallback((clusterItem) => {
    // Toggle off if clicking the same cluster
    if (activeClusterIndex === clusterItem.cluster) {
      // Clear the filter
      clusterFilter.clear();
      setFilterQuery('');
      setFilterActive(false);
      setFilterConfig(null);
      setUrlParams((prev) => {
        prev.delete('cluster');
        return new URLSearchParams(prev);
      });
    } else {
      // Set the cluster filter
      clusterFilter.setCluster(clusterItem);
      setFilterQuery(clusterItem.label);
      setFilterConfig({
        type: filterConstants.CLUSTER,
        value: clusterItem.cluster,
        label: clusterItem.label,
      });
      setFilterActive(true);
      setUrlParams((prev) => {
        prev.set('cluster', clusterItem.cluster);
        return new URLSearchParams(prev);
      });
    }
  }, [activeClusterIndex, clusterFilter, setFilterConfig, setFilterActive, setFilterQuery, setUrlParams]);

  const handleClearFilter = useCallback(() => {
    clusterFilter.clear();
    setFilterQuery('');
    setFilterActive(false);
    setFilterConfig(null);
    setUrlParams((prev) => {
      prev.delete('cluster');
      return new URLSearchParams(prev);
    });
  }, [clusterFilter, setFilterConfig, setFilterActive, setFilterQuery, setUrlParams]);

  return (
    <div
      className={styles.panel}
      data-testid="cluster-labels-panel"
      id="cluster-labels-panel"
    >
      <div className={styles.header}>
        <div className={styles.summaryStats}>
          <span className={styles.summaryItem}>
            <strong>{clusterLabels?.length || 0}</strong> clusters
          </span>
          <span className={styles.summaryItem}>
            <strong>{totalPoints.toLocaleString()}</strong> points
          </span>
        </div>

        <div className={styles.sortControls}>
          <label htmlFor="cluster-sort-order-select">Sort:</label>
          <select
            id="cluster-sort-order-select"
            className={styles.sortSelect}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            data-testid="cluster-sort-select"
          >
            {Object.entries(SORT_ORDERS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeClusterIndex !== null && (
        <div className={styles.activeFilter}>
          <span>Filtering: <strong>{filterConfig?.label}</strong></span>
          <Button
            variant="outline"
            size="small"
            onClick={handleClearFilter}
            data-testid="clear-cluster-filter"
            icon="x"
          />
        </div>
      )}

      <div className={styles.clusterList} data-testid="cluster-list">
        {sortedLabels.map((item) => {
          const isActive = activeClusterIndex === item.cluster;
          return (
            <button
              key={item.cluster}
              className={`${styles.clusterItem} ${isActive ? styles.active : ''}`}
              onClick={() => handleClusterClick(item)}
              data-testid={`cluster-item-${item.cluster}`}
              data-cluster-id={item.cluster}
              title={`${item.label} (${item.count} points)`}
            >
              <div className={styles.clusterItemHeader}>
                <ClusterIcon width={16} height={16} />
                <span className={styles.clusterLabel}>{item.label}</span>
                <span className={styles.clusterCount}>{item.count.toLocaleString()}</span>
              </div>
              <ClusterBar count={item.count} maxCount={maxCount} isActive={isActive} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ClusterLabelsPanel;
