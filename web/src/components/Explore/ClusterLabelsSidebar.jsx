import { useMemo, useState, useCallback } from 'react';
import { Button } from 'react-element-forge';
import { useScope } from '../../contexts/ScopeContext';
import { useFilter } from '../../contexts/FilterContext';
import { filterConstants } from './V2/Search/utils';
import ClusterIcon from './V2/Search/ClusterIcon';
import styles from './ClusterLabelsSidebar.module.scss';

// Sort order definitions - extensible for future sort orders
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

const ClusterLabelsSidebar = ({
  isOpen,
  onClose,
  title = 'Clusters',
}) => {
  const [sortOrder, setSortOrder] = useState('alphabetical');
  const { clusterLabels } = useScope();
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

  const sortedLabels = useMemo(() => {
    if (!clusterLabels || clusterLabels.length === 0) return [];
    const sortConfig = SORT_ORDERS[sortOrder];
    return [...clusterLabels].sort(sortConfig.compareFn);
  }, [clusterLabels, sortOrder]);

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
      className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}
      data-testid="cluster-labels-sidebar"
      id="cluster-labels-sidebar"
    >
      <div className={styles.header}>
        <h3>{title}</h3>
        <Button
          className={styles.closeButton}
          variant="outline"
          onClick={onClose}
          aria-label="Minimize cluster labels sidebar"
          icon="minus"
        />
      </div>

      <div className={styles.summaryStats}>
        <span className={styles.summaryItem}>
          <strong>{clusterLabels?.length || 0}</strong> clusters
        </span>
        <span className={styles.summaryItem}>
          <strong>{totalPoints.toLocaleString()}</strong> points
        </span>
      </div>

      <div className={styles.sortControls}>
        <label htmlFor="sort-order-select">Sort:</label>
        <select
          id="sort-order-select"
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

      {activeClusterIndex !== null && (
        <div className={styles.clearFilter}>
          <Button
            variant="outline"
            size="small"
            onClick={handleClearFilter}
            data-testid="clear-cluster-filter"
          >
            Clear Selection
          </Button>
        </div>
      )}
    </div>
  );
};

export default ClusterLabelsSidebar;
