import { Link, useLocation } from 'react-router-dom';
import styles from './SubNav.module.css';
import { Select } from 'react-element-forge';

const SubNav = ({ dataset, scope, scopes, onScopeChange }) => {
  const location = useLocation();

  console.log({ dataset, scope, scopes });

  // If no dataset, show ghost version
  if (!dataset || !scope || !scopes) {
    return (
      <div className={styles.subHeaderContainer}>
        <div className={styles.tabsContainer}>
          <div className={styles.leftTabs}>
            <div className={styles.scope}>
              <Select
                className={styles.scopeSelector}
                onChange={() => {}}
                value=""
                options={[]}
                disabled
              />
            </div>
            <div className={styles.divider} />
            <span className={`${styles.tab} ${styles.disabledTab}`}>Setup</span>
            <span className={`${styles.tab} ${styles.disabledTab}`}>Explore</span>
          </div>
          <div className={styles.rightTabs}>
            <span className={`${styles.tab} ${styles.disabledTab}`}>Export Data</span>
            <span className={`${styles.tab} ${styles.disabledTab}`}>Export Plot</span>
            <span className={`${styles.tab} ${styles.disabledTab}`}>Job History</span>
          </div>
        </div>
      </div>
    );
  }

  const scopeOptions = dataset
    ? scopes.map((s) => ({
        label: `${dataset?.id} / ${s.id ? `${s.label} (${s.id})` : 'New scope'}`,
        value: `${s.id ? s.id : ''}`,
      }))
    : [];

  return (
    <div className={styles.subHeaderContainer}>
      <div className={styles.tabsContainer}>
        <div className={styles.leftTabs}>
          <div className={styles.scope}>
            <Select
              className={styles.scopeSelector}
              onChange={onScopeChange}
              value={scope?.id || ''}
              options={scopeOptions}
            />
          </div>
          <div className={styles.divider} />
          <Link
            to={`/datasets/${dataset?.id}/setup/${scope?.id}`}
            className={`${styles.tab} ${location.pathname.includes('/setup') ? styles.activeTab : ''}`}
          >
            Setup
          </Link>
          {!scope ? (
            <span className={`${styles.tab} ${styles.disabledTab}`} title="Finish setup to explore">
              Explore
            </span>
          ) : (
            <Link
              to={`/datasets/${dataset?.id}/explore/${scope?.id}`}
              className={`${styles.tab} ${location.pathname.includes('/explore') ? styles.activeTab : ''} `}
            >
              Explore
            </Link>
          )}
        </div>
        <div className={styles.rightTabs}>
          <Link
            to={
              scope
                ? `/datasets/${dataset?.id}/export/${scope?.id}`
                : `/datasets/${dataset?.id}/export`
            }
            className={`${styles.tab} ${location.pathname.includes('/export') ? styles.activeTab : ''}`}
          >
            Export Data
          </Link>
          {!scope ? (
            <span
              className={`${styles.tab} ${styles.disabledTab}`}
              title="Finish setup to export plot"
            >
              Export Plot
            </span>
          ) : (
            <Link
              to={`/datasets/${dataset?.id}/plot/${scope?.id}`}
              className={`${styles.tab} ${location.pathname.includes('/plot') ? styles.activeTab : ''} `}
            >
              Export Plot
            </Link>
          )}
          <Link
            to={`/datasets/${dataset?.id}/jobs`}
            className={`${styles.tab} ${location.pathname.includes('/jobs') ? styles.activeTab : ''}`}
          >
            Job History
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SubNav;
