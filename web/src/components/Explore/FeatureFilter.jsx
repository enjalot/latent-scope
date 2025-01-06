import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import classNames from 'classnames';
import styles from './FeatureFilter.module.scss';

export default function FeatureFilter({
  scope,
  features,
  feature,
  featureIndices,
  setFeature,
  setFeatureIndices,
  onThreshold,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);
  const [threshold, setThreshold] = useState(0.1);

  const featureLabel = (featIdx) => {
    const featureObj = features.find((f) => f.feature === featIdx);
    return `(${featIdx}) ${featureObj.label}`;
  };

  useEffect(() => {
    if (feature !== -1) {
      setInputValue(featureLabel(feature));
    }
  }, [feature]);

  // default the threshold to half the max activation of the feature
  useEffect(() => {
    if (feature >= 0) {
      const maxActivation = scope?.sae?.max_activations[feature] || 0;
      let t = maxActivation < 0.2 ? maxActivation / 2 : 0.1;
      setThreshold(t);
      onThreshold(t);
    }
  }, [feature, scope, onThreshold]);

  const items = useMemo(
    () =>
      features
        ?.map((f) => ({
          value: f.feature,
          label: featureLabel(f.feature),
        }))
        .filter((f) => scope?.sae?.max_activations[f.value] !== 0) || [],
    [features, scope]
  );

  const filteredItems = useMemo(() => {
    if (!inputValue) return items;
    const searchTerm = inputValue.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(searchTerm));
  }, [items, inputValue]);

  const selectedItem = useMemo(
    () => (feature ? items.find((f) => f.value === feature) : null),
    [items, feature]
  );

  const clickingItemRef = useRef(false);

  const handleSelect = useCallback(
    (item) => {
      setFeature(item.value);
      setInputValue(item.label);
      setIsOpen(false);
      clickingItemRef.current = false;
    },
    [setFeature, setInputValue, setIsOpen]
  );

  const handleInputChange = useCallback(
    (e) => {
      setInputValue(e.target.value);
      setIsOpen(true);
      if (!e.target.value) {
        setFeature(null);
      }
    },
    [setFeature]
  );

  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleBlur = useCallback((e) => {
    setTimeout(() => {
      if (!clickingItemRef.current) {
        setIsOpen(false);
      }
    }, 200);
  }, []);

  const handleClear = useCallback(() => {
    setInputValue('');
    setFeature(-1);
    setFeatureIndices([]);
    inputRef.current?.focus();
  }, [setFeature, setInputValue, inputRef]);

  const renderRow = useCallback(
    ({ index, style }) => {
      const item = filteredItems[index];
      return (
        <div
          key={item.value}
          onMouseDown={() => {
            clickingItemRef.current = true;
          }}
          onClick={() => handleSelect(item)}
          style={style}
          className={classNames(styles.item, {
            [styles.selected]: selectedItem?.value === item.value,
          })}
        >
          {item.label}
        </div>
      );
    },
    [filteredItems, handleSelect, selectedItem]
  );

  const handleThresholdChanged = useCallback(() => {
    console.log('threshold', threshold);
    onThreshold(threshold);
  }, [threshold, setFeature]);

  return (
    <div className={classNames(styles.container)}>
      <div className={classNames(styles.filterCell, styles.left)}>
        <div className={styles.dropdownContainer}>
          <div className={styles.inputWrapper}>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Filter by feature"
              className={styles.input}
            />
            {inputValue && (
              <button
                className={styles.clearButton}
                onClick={handleClear}
                aria-label="clear selection"
              >
                ×
              </button>
            )}
          </div>

          {isOpen && (
            <div className={styles.menu}>
              <List
                height={Math.min(filteredItems.length * 60, 300)}
                itemCount={filteredItems.length}
                itemSize={35}
                width="100%"
              >
                {renderRow}
              </List>
            </div>
          )}
        </div>
      </div>
      <div className={classNames(styles.filterCell, styles.middle)}>
        {feature >= 0 && (
          <div className={styles.thresholdContainer}>
            <input
              type="range"
              min={0.01}
              max={scope?.sae?.max_activations[feature] || 0.1}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onMouseUp={handleThresholdChanged}
              className={styles.thresholdInput}
            />
            <span className={styles.thresholdLabel}> activation threshold: {threshold}</span>
          </div>
        )}
        <div className={styles.rowCount}>
          {featureIndices?.length ? <span>{featureIndices.length} rows</span> : <span>0 rows</span>}
        </div>
      </div>
    </div>
  );
}
