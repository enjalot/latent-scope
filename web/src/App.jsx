import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import './App.css';

// Lazy-load each route so the initial bundle only contains the shell;
// heavy pages (scatterplot, setup pipeline, etc.) load on demand.
const Home = lazy(() => import('./components/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const Explore = lazy(() => import('./pages/FullScreenExplore'));
const Compare = lazy(() => import('./pages/Compare'));
const CompareClusters = lazy(() => import('./pages/CompareClusters'));
const Setup = lazy(() => import('./pages/Setup'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Export = lazy(() => import('./pages/Export'));
const DataMapPlot = lazy(() => import('./pages/DataMapPlot'));

import 'react-element-forge/dist/style.css';
import './styles/primitives.scss';

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
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/datasets/:dataset/explore/:scope" element={<Explore />} />
            <Route path="/datasets/:dataset/compare/" element={<Compare />} />
            <Route path="/datasets/:dataset/compare-clusters/" element={<CompareClusters />} />
            <Route path="/datasets/:dataset/export" element={<Export />} />
            <Route path="/datasets/:dataset/export/:scope" element={<Export />} />
            <Route path="/datasets/:dataset/plot/:scope" element={<DataMapPlot />} />

            <Route path="/datasets/:dataset/setup" element={<Setup />} />
            <Route path="/datasets/:dataset/setup/:scope" element={<Setup />} />
            <Route path="/datasets/:dataset/jobs" element={<Jobs />} />
            <Route path="/datasets/:dataset/jobs/:scope" element={<Jobs />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
