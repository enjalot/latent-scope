import Select from 'react-select';
import { Button } from 'react-element-forge';
import styles from './ColumnFilter.module.scss';
import { selectStyles } from './SelectStyles';
const ColumnFilter = ({
  columnFilters,
  columnIndices,
  columnFiltersActive,
  setColumnFiltersActive,
  setColumnIndices,
}) => {
  return columnFilters?.length ? (
    <div className={`${styles.container} ${columnIndices?.length ? styles.active : ''}`}>
      <div className={styles.filterCell}>
        {columnFilters.map((column) => (
          <span key={column.column}>
            <Select
              value={
                columnFiltersActive[column.column]
                  ? {
                      value: columnFiltersActive[column.column],
                      label: `${columnFiltersActive[column.column]} (${
                        column.counts[columnFiltersActive[column.column]]
                      })`,
                    }
                  : null
              }
              onChange={(selectedOption) => {
                let active = { ...columnFiltersActive };
                active[column.column] = selectedOption ? selectedOption.value : '';
                setColumnFiltersActive(active);
              }}
              options={column.categories.map((c) => ({
                value: c,
                label: `${c} (${column.counts[c]})`,
              }))}
              isClearable
              placeholder={`Filter by ${column.column}`}
              className={styles.columnSelect}
              styles={selectStyles}
            />
          </span>
        ))}
      </div>
      <div className={styles.count}>
        {columnIndices?.length ? <span>{columnIndices?.length} rows</span> : null}
        {columnIndices?.length ? (
          <Button
            onClick={() => {
              setColumnFiltersActive({});
              setColumnIndices([]);
            }}
            icon="x"
            color="secondary"
          />
        ) : null}
      </div>
    </div>
  ) : null;
};

export default ColumnFilter;
