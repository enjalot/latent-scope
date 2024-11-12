import { useState } from 'react';
import { Link } from 'react-router-dom';
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

  // THIS IS UGLY, handle loading state better from the useSetp
  const scopesToShow = [{ label: 'New scope', value: '' }, ...(scopes ?? [])];

  return (
    <SubNav dataset={dataset} scope={scope} scopes={scopesToShow} onScopeChange={onScopeChange} />
  );
  // TODO: need to add this back in
  //     <div className={styles.dataset}>
  //       {!dataset.ls_version ? <div className={styles.reimport}>
  //         <span className="warning-header">WARNING: outdated dataset!</span>
  //         <button onClick={() => {
  //           startReingestJob({ text_column: dataset.text_column })
  //         }}>Reimport</button>
  //       </div> : null}

  //       <JobProgress job={reingestJob} clearJob={()=> {
  //         setReingestJob(null)
  //         window.location.reload();
  //       }}/>

  //     </div>
  //   </div>}
  // </div>
}

export default Header;