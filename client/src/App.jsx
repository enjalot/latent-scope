import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DatasetsList from './components/DatasetsList';
import DatasetDetail from './components/DatasetDetail';
import DatasetSetup from './components/DatasetSetup';
import TagDetail from './components/TagDetail';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DatasetsList />} />
        <Route path="/datasets/:dataset" element={<DatasetDetail />} />
        <Route path="/datasets/:dataset/setup" element={<DatasetSetup/>} />
        <Route path="/datasets/:dataset/tags/:tag" element={<TagDetail />} />
      </Routes>
    </Router>
  );
}

export default App;
