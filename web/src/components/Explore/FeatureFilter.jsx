import { useMemo, useState, useRef, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import classNames from 'classnames';
import styles from './FeatureFilter.module.scss';

export default function FeatureFilter({
  scope,
  features,
  feature,
  featureIndices,
  setFeature,
  setFilteredIndices,
  setFeatureIndices,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  const items = useMemo(
    () =>
      features
        ?.map((f) => ({
          value: f.feature,
          label: `(${f.feature}) ${f.label}`,
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
    setFilteredIndices([]);
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
              placeholder="Filter by feature!!!"
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
        {featureIndices?.length ? <span>{featureIndices.length} rows</span> : <span>0 rows</span>}
      </div>
    </div>
  );
}
