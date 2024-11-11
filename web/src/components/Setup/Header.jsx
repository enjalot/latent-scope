import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../../lib/apiService';
import { Select } from 'react-element-forge';

import { useSetup } from '../../contexts/SetupContext';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';

import styles from './Header.module.scss';

function Header() {
  let { dataset, scope, scopes, navigate } = useSetup();

  // have job for re-ingesting dataset
  const [reingestJob, setReingestJob] = useState(null);
  const { startJob: startReingestJob } = useStartJobPolling(dataset, setReingestJob, `${apiUrl}/jobs/reingest`);

  return (
    <div className={styles.header}>
      <h3>{dataset ? dataset.id : "Loading..."} 
        <span className={styles.datasetLength}>{dataset?.length ? ` ${dataset.length} rows` : null}</span>
      </h3>
      {dataset && <div>
        <div className={styles.scope}>
          <div className={styles.scopesList}>
              {scopes ?
                <Select
                  onChange={(e) => {
                  navigate(`/datasets/${dataset?.id}/setup/${e.target.value}`)
                  }}
                  options={[{ label: "New scope", value: "" }, ...scopes.map(s => ({ label: `${s.label} (${s.id})`, value: s.id }))]}
                  value={scope?.id || ""}
                >
                </Select> 
              : null}
          </div>

          <div className={styles.scopeLinks}>
            { scope ? <>
                <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}> ↗ Export data <br/></Link> 
                <Link to={`/datasets/${dataset?.id}/plot/${scope?.id}`}> ↗ Export plot <br/></Link> 
              </>
            : <Link to={`/datasets/${dataset?.id}/export`}> ↗ Export data <br/></Link> }
            { scope ? <Link to={`/datasets/${dataset?.id}/explore/${scope?.id}`}> ↗ Explore <br/></Link> : null } 
          </div>

          <div className={styles.jobHistory}>
            <Link to={`/datasets/${dataset?.id}/jobs`}> Job history</Link><br/>
          </div>
        </div>

        <div className={styles.dataset}>
          {!dataset.ls_version ? <div className={styles.reimport}>
            <span className="warning-header">WARNING: outdated dataset!</span>
            <button onClick={() => {
              startReingestJob({ text_column: dataset.text_column })
            }}>Reimport</button>
          </div> : null}
          
          <JobProgress job={reingestJob} clearJob={()=> {
            setReingestJob(null)
            window.location.reload();
          }}/>

        </div> 
      </div>}
    </div>
  )
}

export default Header;