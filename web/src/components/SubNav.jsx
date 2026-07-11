import { Link, useLocation } from 'react-router-dom';
import styles from './SubNav.module.css';
import { Select } from 'react-element-forge';

const tabClass = (extra = '') => `ls-tab ${styles.tab}${extra ? ` ${extra}` : ''}`;

const SubNav = ({ dataset, scope, scopes, onScopeChange }) => {
  const location = useLocation();

  const disabledTab = tabClass(styles.disabledTab);
  const activeTab = (match) =>
    tabClass(location.pathname.includes(match) ? 'ls-tab--active' : '');

  // If no dataset, show ghost version
  if (!dataset) {
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
            <span className={disabledTab}>Setup</span>
            <span className={disabledTab}>Explore</span>
          </div>
          <div className={styles.rightTabs}>
            <span className={disabledTab}>Export Data</span>
            <span className={disabledTab}>Export Plot</span>
            <span className={disabledTab}>Job History</span>
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
          <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`} className={activeTab('/setup')}>
            Setup
          </Link>
          {!scope ? (
            <span className={disabledTab} title="Finish setup to explore">
              Explore
            </span>
          ) : (
            <Link
              to={`/datasets/${dataset?.id}/explore/${scope?.id}`}
              className={activeTab('/explore')}
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
            className={activeTab('/export')}
          >
            Export Data
          </Link>
          {!scope ? (
            <span className={disabledTab} title="Finish setup to export plot">
              Export Plot
            </span>
          ) : (
            <Link to={`/datasets/${dataset?.id}/plot/${scope?.id}`} className={activeTab('/plot')}>
              Export Plot
            </Link>
          )}
          <Link
            to={
              scope ? `/datasets/${dataset?.id}/jobs/${scope?.id}` : `/datasets/${dataset?.id}/jobs`
            }
            className={activeTab('/jobs')}
          >
            Job History
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SubNav;
