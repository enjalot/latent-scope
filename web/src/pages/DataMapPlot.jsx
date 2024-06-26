import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import JobProgress from '../components/Job/Progress';
import { useStartJobPolling } from '../components/Job/Run';


const apiUrl = import.meta.env.VITE_API_URL

import styles from './DataMapPlot.module.css';

function niceBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"]
  let i = 0;
  while (bytes > 1024) {
    bytes = bytes / 1024;
    i++;
  }
  return `${bytes.toFixed(0)}${units[i]}`;
}



function DataMapPlot() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();

  const [plotJob, setPlotJob] = useState(null);
  const { startJob: startPlotJob } = useStartJobPolling(dataset, setPlotJob, `${apiUrl}/jobs/plot`);

  // Initialize state with default values
  const [config, setConfig] = useState({
    label_over_points: true,
    dynamic_label_size: true,
    add_glow: true,
    darkmode: false,
    interactive: false,
    dpi: 150,
    figsize: [24, 24],
    label_wrap_width: 10,
    point_size: 7,
    max_font_size: 32,
    min_font_size: 16,
    min_font_weight: 100,
    max_font_weight: 1000,
    font_family: "Roboto Condensed",
    glow_keywords: {
      kernel_bandwidth: 0.01,
      kernel: "exponential",
      n_levels: 128,
      max_alpha: 0.75
    }
  });

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(setDataset)
      .catch(console.error);
  }, [datasetId, setDataset]);

  const [scope, setScope] = useState(null);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
      .then(response => response.json())
      .then(data => {
        console.log("scope", data)
        setScope(data)
      })
      .catch(console.error);
  }, [datasetId, scopeId, setScope]);


  const [plotFiles, setPlotFiles] = useState([]);
  const fetchPlotFiles = useCallback(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/plot/${scopeId}/list`)
      .then(response => response.json())
      .then(data => {
        console.log("plot list", data);
        setPlotFiles(data);
      })
      .catch(console.error);
  }, [apiUrl, datasetId, scopeId, setPlotFiles]);

  useEffect(() => {
    fetchPlotFiles();
  }, [fetchPlotFiles]);

  // Handle form input changes
  const handleChange = (event) => {
    const { name, value, type } = event.target;
    if (type === 'checkbox') {
      setConfig(prev => ({ ...prev, [name]: event.target.checked }));
    } else if (name.includes('.')) { // Handle nested objects
      const keys = name.split('.');
      setConfig(prev => ({
        ...prev,
        [keys[0]]: {
          ...prev[keys[0]],
          [keys[1]]: type === 'number' ? parseFloat(value) : value
        }
      }));
    } else {
      setConfig(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) : value }));
    }
  };

  // Handle form submission
  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    console.log("running job", config);
    let job = {
      scope_id: scopeId,
      config: JSON.stringify(config)
    };
    startPlotJob(job);
  }, [config, startPlotJob, scopeId]);

  useEffect(() => {
    if (plotJob && plotJob.status === "completed") {
      console.log("plot job completed", plotJob)
      fetchPlotFiles();
    }
  }, [plotJob, fetchPlotFiles])



  const fileLink = useCallback((d, i) => {
    return <li className={styles["file-link"]} key={i}>
      <a className={styles["config-link"]} href={`${apiUrl}/files/${datasetId}/plots/${d[0]}`} target="_blank" rel="noreferrer">
        {d[0]}
        <br></br>
        <img src={`${apiUrl}/files/${datasetId}/plots/${d[0]}`} alt={d[0]} width={400} />
      </a>
      <br />
      <span className={styles["size"]}>{niceBytes(d[2])} PNG</span>
      <span className={styles["config-link"]}><a href={`${apiUrl}/files/${datasetId}/plots/${d[0].split(".png")[0]}.json`} target="_blank" rel="noreferrer">
        [Config JSON]</a></span>
      {/* <span className={styles["path"]}>{d[1]}</span> */}
    </li>
  }, [datasetId])

  return (
    <div className={styles["page"]}>
      <div className={styles["header"]}>
        <h2>Export Static Plot for {dataset?.id} {scopeId}</h2>
        <Link to={`/datasets/${datasetId}/setup/${scopeId}`}>Setup {dataset?.id} {scopeId}</Link>
        <Link to={`/datasets/${datasetId}/explore/${scopeId}`}>Explore {dataset?.id} {scopeId}</Link>
        <Link to={`/datasets/${datasetId}/export/${scopeId}`}>Export data {dataset?.id} {scopeId}</Link>
      </div>
      <div className={styles["new-export"]}>
        <h3>New Plot</h3>
        <p>
          This will create a new plot using <a href="https://datamapplot.readthedocs.io/en/latest/index.html">DataMapPlot</a>.
        </p>
        <form className={styles["config-form"]} onSubmit={handleSubmit}>
          <div className={styles["label-group"]}>
            <label>
              <span>
                Dark Mode:
              </span>
              <input type="checkbox" name="darkmode" checked={config.darkmode} onChange={handleChange} />
            </label>
            <label>
              <span>
                Interactive:
              </span>
              <input type="checkbox" name="interactive" checked={config.interactive} onChange={handleChange} />
            </label>
            <label>
              <span>
                DPI:
              </span>
              <input type="number" name="dpi" value={config.dpi} onChange={handleChange} />
            </label>
            <label>
              <span>
                Figure Size Width:
              </span>
              <input type="number" name="figsize.0" value={config.figsize[0]} onChange={handleChange} />
            </label>
            <label>
              <span>
                Figure Size Height:
              </span>
              <input type="number" name="figsize.1" value={config.figsize[1]} onChange={handleChange} />
            </label>
            <label>
              <span>
                Label Wrap Width:
              </span>
              <input type="number" name="label_wrap_width" value={config.label_wrap_width} onChange={handleChange} />
            </label>
            <label>
              <span>
                Point Size:
              </span>
              <input type="number" name="point_size" value={config.point_size} onChange={handleChange} />
            </label>
          </div>

          <div className={styles["label-group"]}>
            <label>
              <span>
                Label Over Points:
              </span>
              <input type="checkbox" name="label_over_points" checked={config.label_over_points} onChange={handleChange} />
            </label>
            <label>
              <span>
                Dynamic Label Size:
              </span>
              <input type="checkbox" name="dynamic_label_size" checked={config.dynamic_label_size} onChange={handleChange} />
            </label>
            <label>
              <span>
                Max Font Size:
              </span>
              <input type="number" name="max_font_size" value={config.max_font_size} onChange={handleChange} />
            </label>
            <label>
              <span>
                Min Font Size:
              </span>
              <input type="number" name="min_font_size" value={config.min_font_size} onChange={handleChange} />
            </label>
            <label>
              <span>
                Min Font Weight:
              </span>
              <input type="number" name="min_font_weight" value={config.min_font_weight} onChange={handleChange} />
            </label>
            <label>
              <span>
                Max Font Weight:
              </span>
              <input type="number" name="max_font_weight" value={config.max_font_weight} onChange={handleChange} />
            </label>
            <label>
              <span>
                Font Family:
              </span>
              <input type="text" list="fontFamilyOptions" name="font_family" value={config.font_family} onChange={handleChange} />
              <datalist id="fontFamilyOptions">
                <option value="Roboto Condensed">Roboto Condensed</option>
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
                <option value="Georgia">Georgia</option>
                <option value="Palatino">Palatino</option>
                <option value="Garamond">Garamond</option>
                <option value="Bookman">Bookman</option>
                <option value="Comic Sans MS">Comic Sans MS</option>
                <option value="Trebuchet MS">Trebuchet MS</option>
                <option value="Arial Black">Arial Black</option>
                <option value="Impact">Impact</option>
                <option value="Lucida Sans Unicode">Lucida Sans Unicode</option>
              </datalist>
            </label>
          </div>

          <div className={styles["label-group"]}>
            <label>
              <span>
                Add Glow:
              </span>
              <input type="checkbox" name="add_glow" checked={config.add_glow} onChange={handleChange} />
            </label>
            <label>
              <span>
                Kernel Bandwidth:
              </span>
              <input type="number" name="glow_keywords.kernel_bandwidth" step="0.01" value={config.glow_keywords.kernel_bandwidth} onChange={handleChange} />
            </label>
            <label>
              <span>
                Kernel:
              </span>
              <select name="glow_keywords.kernel" value={config.glow_keywords.kernel} onChange={handleChange}>
                <option value="gaussian">Gaussian</option>
                <option value="tophat">Tophat</option>
                <option value="epanechnikov">Epanechnikov</option>
                <option value="exponential">Exponential</option>
                <option value="linear">Linear</option>
                <option value="cosine">Cosine</option>
              </select>
            </label>
            <label>
              <span>
                Number of Levels:
              </span>
              <input type="number" name="glow_keywords.n_levels" value={config.glow_keywords.n_levels} onChange={handleChange} />
            </label>
            <label>
              <span>
                Max Alpha:
              </span>
              <input type="number" name="glow_keywords.max_alpha" step="0.01" value={config.glow_keywords.max_alpha} onChange={handleChange} />
            </label>
          </div>
          <div className={styles["create-button"]}>
            <button type="submit">Create Plot</button>
          </div>
        </form>

        <JobProgress job={plotJob} clearJob={() => {
          setPlotJob(null)
        }} />

        {plotJob && plotJob.status !== "completed" ? <p className={styles["warning"]}>
          May take more than 30 seconds to see progress.
        </p> : null}

      </div>
      <div className={styles["plots"]}>
        <h3>Plots ({plotFiles.length})</h3>
        <div className={styles["plot-list"]}>
          {plotFiles.map(fileLink)}
        </div>
      </div>
    </div>
  );
}

export default DataMapPlot;
