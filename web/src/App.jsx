import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Explore from './pages/Explore';
import Setup from './pages/Setup';
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
        {readonly ? null : <Route path="/datasets/:dataset/setup" element={<Setup/>} />}
        {readonly ? null : <Route path="/datasets/:dataset/setup/:scope" element={<Setup/>} />}
        {readonly ? null : <Route path="/datasets/:dataset/jobs" element={<Jobs />} />}
        {readonly ? null : <Route path="/datasets/:dataset/jobs/:job" element={<Job />} />}
        <Route path="/datasets/:dataset/explore/:scope" element={<Explore />} />
      </Routes>
      </div>
    </Router>

  );
}

export default App;
