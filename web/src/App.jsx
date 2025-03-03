import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Settings from './pages/Settings';
import Explore from './pages/V2/FullScreenExplore';
import Compare from './pages/Compare';
import Setup from './pages/Setup';
import Jobs from './pages/Jobs';
import Export from './pages/Export';
import DataMapPlot from './pages/DataMapPlot';
import Nav from './components/Nav';
import './App.css';

import 'react-element-forge/dist/style.css';
import './latentscope--brand-theme.scss';

const env = import.meta.env;
console.log('ENV', env);
const readonly = import.meta.env.MODE == 'read_only';
const docsUrl = 'https://enjalot.observablehq.cloud/latent-scope/';

function App() {
  if (readonly) {
    return (
      <div>
        <a className="docs-banner" href={docsUrl}>
          {' '}
          👉 Navigate to the documentation site
        </a>
        <iframe src={docsUrl} style={{ width: '100%', height: '100vh', border: 'none' }} />
      </div>
    );
  }
  return (
    <Router basename={env.BASE_NAME}>
      <Nav />
      <div className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/datasets/:dataset/explore/:scope" element={<Explore />} />
          <Route path="/datasets/:dataset/compare/" element={<Compare />} />
          <Route path="/datasets/:dataset/export" element={<Export />} />
          <Route path="/datasets/:dataset/export/:scope" element={<Export />} />
          <Route path="/datasets/:dataset/plot/:scope" element={<DataMapPlot />} />

          <Route path="/datasets/:dataset/setup" element={<Setup />} />
          <Route path="/datasets/:dataset/setup/:scope" element={<Setup />} />
          <Route path="/datasets/:dataset/jobs" element={<Jobs />} />
          <Route path="/datasets/:dataset/jobs/:scope" element={<Jobs />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
