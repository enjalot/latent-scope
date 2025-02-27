// find all features that match the query

const featureLabel = (feature) => {
  return `${feature.feature}: ${feature.label} (${feature.dataset_count})`;
};

export const findFeaturesByQuery = (features, query, top = 5) => {
  if (!query) {
    return features
      .slice()
      .sort((a, b) => b.dataset_avg - a.dataset_avg)
      .slice(0, top)
      .map((feature) => ({
        value: feature.feature,
        label: featureLabel(feature),
      }));
  }

  const searchTerm = query.toLowerCase();
  return features
    .filter(
      (feature) =>
        feature.label.toLowerCase().includes(searchTerm) ||
        feature.feature.toString().includes(searchTerm)
    )
    .slice()
    .sort((a, b) => b.dataset_avg - a.dataset_avg)
    .slice(0, top)
    .map((feature) => ({
      value: feature.feature,
      label: featureLabel(feature),
    }));
};

export const findClustersByQuery = (clusters, query, top = 5) => {
  if (!query) {
    return clusters.slice(0, top).map((cluster) => ({
      value: cluster.cluster,
      label: cluster.label,
    }));
  }

  const searchTerm = query.toLowerCase();
  return clusters
    .filter((cluster) => cluster.label.toLowerCase().includes(searchTerm))
    .slice(0, top)
    .map((cluster) => ({
      value: cluster.cluster,
      label: cluster.label,
    }));
};

export const findFeatureLabel = (features, feature) => {
  return features.find((f) => f.feature === feature)?.label;
};

// check that the given column and value are valid
// meaning that the column exists and the value is one of the categories
export const validateColumnAndValue = (column, value, columnFilters) => {
  const columnFilter = columnFilters.find((c) => c.column === column);
  if (!columnFilter) return false;
  return columnFilter.categories.includes(value);
};

export const filterConstants = {
  SEARCH: 'search',
  CLUSTER: 'cluster',
  FEATURE: 'feature',
  COLUMN: 'column',
};
