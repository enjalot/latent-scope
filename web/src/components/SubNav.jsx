import { Link, useLocation } from 'react-router-dom';
import styles from './SubNav.module.css';
import { Select } from 'react-element-forge';

const SubNav = ({ dataset, scope, scopes, onScopeChange }) => {
  const location = useLocation();

  const hidden = !dataset || !scope || !scopes;

  // if (!scope) {
  //   return null;
  // }

  // <div className={styles.scopesList}>
  //             {scopes ?
  //               <Select
  //                 onChange={(e) => {
  //                   navigate(`/datasets/${dataset?.id}/setup/${e.target.value}`)
  //                 }}
  //                 options={[{ label: "New scope", value: "" }, ...scopes.map(s => ({ label: `${s.label} (${s.id})`, value: s.id }))]}
  //                 value={scope?.id || ""}
  //               >
  //               </Select>
  //             : null}
  //         </div>

  const scopeOptions = dataset
    ? scopes.map((s) => ({
        label: `${dataset?.id} / ${s.id ? `${s.label} (${s.id})` : 'New scope'}`,
        value: `${s.id ? s.id : ''}`,
      }))
    : [];
  // { label: 'New scope', value: '' },,
  // ];

  console.log({ dataset, scope, scopes });

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
