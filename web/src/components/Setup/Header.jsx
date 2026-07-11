import { useState, useMemo } from 'react';
import { Button } from 'react-element-forge';
import { apiUrl } from '../../lib/apiService';
import SubNav from '../SubNav';
import { Spinner } from '../ui';

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
        <div className={styles.loading}>
          <Spinner label="LOADING DATASET…" />
        </div>
      </>
    );
  }

  return (
    <>
      <SubNav dataset={dataset} scope={scope} scopes={scopesToShow} onScopeChange={onScopeChange} />
      <div className={styles.dataset}>
        {!dataset.ls_version ? (
          <div className={styles.reimport}>
            <span className={styles.warning}>Outdated dataset</span>
            <Button
              size="small"
              color="secondary"
              onClick={() => {
                startReingestJob({ text_column: dataset.text_column });
              }}
              text="Reimport"
            />
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
