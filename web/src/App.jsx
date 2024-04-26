import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Mobile from './pages/Mobile';
import Home from './components/Home';
import Settings from './pages/Settings';
import Explore from './pages/Explore';
import Compare from './pages/Compare';
import Setup from './pages/Setup';
import Jobs from './pages/Jobs';
import Job from './pages/Job';
import Export from './pages/Export';
import Nav from './components/Nav';
import './App.css';

const env = import.meta.env;
console.log("ENV", env)
const readonly = import.meta.env.MODE == "read_only"
const docsUrl = "https://enjalot.observablehq.cloud/latent-scope/"

function App() {
  if (readonly) {
    return (
      <div>
        <a className="docs-banner" href={docsUrl}> 👉 Navigate to the documentation site</a>
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
          <Route path="/datasets/:dataset/compare/" element={<Compare/>} />
          <Route path="/datasets/:dataset/export" element={<Export />} />
          <Route path="/datasets/:dataset/export/:scope" element={<Export />} />

          <Route path="/datasets/:dataset/setup" element={<Setup />} />
          <Route path="/datasets/:dataset/setup/:scope" element={<Setup />} />
          <Route path="/datasets/:dataset/jobs" element={<Jobs />} />
          <Route path="/datasets/:dataset/jobs/:job" element={<Job />} />
        </Routes>
      </div>
    </Router>

  );
}

export default App;
