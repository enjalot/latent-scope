import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Mobile from './pages/Mobile';
import Home from './components/Home';
import Settings from './pages/Settings';
import Explore from './pages/Explore';
import Compare from './pages/Compare';
import Setup from './pages/Setup';
import Jobs from './pages/Jobs';
import Job from './pages/Job';
import Nav from './components/Nav';
import './App.css';

const env = import.meta.env;
console.log("ENV", env)
const readonly = import.meta.env.MODE == "read_only"

const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

function App() {
  return (
    <Router basename={env.BASE_NAME}>
      <Nav />
      <div className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/datasets/:dataset/explore/:scope" element={<Explore />} />
          <Route path="/datasets/:dataset/compare/" element={<Compare/>} />

          {readonly ? null : <Route path="/datasets/:dataset/setup" element={<Setup />} />}
          {readonly ? null : <Route path="/datasets/:dataset/setup/:scope" element={<Setup />} />}
          {readonly ? null : <Route path="/datasets/:dataset/jobs" element={<Jobs />} />}
          {readonly ? null : <Route path="/datasets/:dataset/jobs/:job" element={<Job />} />}
        </Routes>
      </div>
    </Router>

  );
}

export default App;
