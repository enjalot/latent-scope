import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import DatasetExplore from './components/DatasetExplore';
import DatasetSetup from './components/DatasetSetup';
import Jobs from './pages/Jobs';
import Job from './pages/Job';
import Nav from './components/Nav';
import './App.css';

const env = import.meta.env;
console.log("ENV", env)
const readonly = import.meta.env.MODE == "read_only"

function App() {
  return (
    <Router basename={env.BASE_NAME}>
      <Nav />
      <div className="page">
      <Routes>
        <Route path="/" element={<Home />} />
        {readonly ? null : <Route path="/datasets/:dataset/setup" element={<DatasetSetup/>} />}
        {readonly ? null : <Route path="/datasets/:dataset/setup/:scope" element={<DatasetSetup/>} />}
        {readonly ? null : <Route path="/datasets/:dataset/jobs" element={<Jobs />} />}
        {readonly ? null : <Route path="/datasets/:dataset/jobs/:job" element={<Job />} />}
        <Route path="/datasets/:dataset/explore/:scope" element={<DatasetExplore />} />
      </Routes>
      </div>
    </Router>

  );
}

export default App;
