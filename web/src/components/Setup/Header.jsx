import { useState, useMemo } from 'react';
import { apiUrl } from '../../lib/apiService';
import SubNav from '../SubNav';
import { Select } from 'react-element-forge';

import { useSetup } from '../../contexts/SetupContext';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';

import styles from './Header.module.scss';

function Header() {
  let { dataset, scope, scopes, navigate } = useSetup();

  // have job for re-ingesting dataset
  const [reingestJob, setReingestJob] = useState(null);
  const { startJob: startReingestJob } = useStartJobPolling(
    dataset,
    setReingestJob,
    `${apiUrl}/jobs/reingest`
  );

  const onScopeChange = (e) => {
    navigate(`/datasets/${dataset?.id}/setup/${e.target.value}`);
  };

  const scopesToShow = useMemo(
    () => [{ label: 'New scope', value: '' }, ...(scopes ?? [])],
    [scopes]
  );

  if (!dataset) {
    return (
      <>
        <SubNav
          dataset={dataset}
          scope={scope}
          scopes={scopesToShow}
          onScopeChange={onScopeChange}
        />
        <div>Loading...</div>
      </>
    );
  }

  return (
    <>
      <SubNav dataset={dataset} scope={scope} scopes={scopesToShow} onScopeChange={onScopeChange} />
      <div className={styles.dataset}>
        {!dataset.ls_version ? (
          <div className={styles.reimport}>
            <span className="warning-header">WARNING: outdated dataset!</span>
            <button
              onClick={() => {
                startReingestJob({ text_column: dataset.text_column });
              }}
            >
              Reimport
            </button>
          </div>
        ) : null}

        <JobProgress
          job={reingestJob}
          clearJob={() => {
            setReingestJob(null);
            window.location.reload();
          }}
        />
      </div>
    </>
  );
}

export default Header;
