import { useState } from 'react';
import { Input, Button } from 'react-element-forge';
import styles from './NearestNeighbor.module.scss';

export default function NearestNeighbor({
  searchIndices,
  searchLoading,
  setSearchText,
  clearSearch,
}) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setSearchText(e.target.elements.searchBox.value);
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
            onClick={() => (searchIndices.length ? handleClear() : null)}
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
