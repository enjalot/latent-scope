import { useState, useEffect } from 'react';
import { Input, Button } from 'react-element-forge';
import styles from './NearestNeighbor.module.scss';

export default function NearestNeighbor({
  searchIndices,
  searchLoading,
  setSearchText,
  clearSearch,
  defaultValue = '',
}) {
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    setInputValue(defaultValue);
  }, [defaultValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSearchText(inputValue);
  };

  const handleClear = () => {
    clearSearch();
    setInputValue('');
  };

  return (
    <div className={`${styles.container} ${searchIndices.length ? styles.active : ''}`}>
      <div className={`${styles.searchInputContainer}`}>
        <Input
          className={styles.searchInput}
          value={inputValue}
          placeholder="Filter by nearest neighbors to search query..."
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !searchLoading) {
              setSearchText(e.target.value);
            }
          }}
        />
        <div className={styles.searchButtonContainer}>
          <Button
            color="secondary"
            className={styles.searchButton}
            disabled={searchLoading}
            onClick={(e) => {
              e.preventDefault();
              searchIndices.length ? handleClear() : handleSubmit(e);
            }}
            icon={searchLoading ? 'pie-chart' : searchIndices.length ? 'x' : 'search'}
          />
        </div>
      </div>
      <div className={`${styles.count}`}>
        {searchIndices.length ? <span>{searchIndices.length} rows</span> : null}
      </div>
    </div>
  );
}
