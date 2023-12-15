import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DatasetsList from './components/DatasetsList';
import DatasetDetail from './components/DatasetDetail';
import TagDetail from './components/TagDetail';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DatasetsList />} />
        <Route path="/datasets/:dataset" element={<DatasetDetail />} />
        <Route path="/datasets/:dataset/tag/:tag" element={<TagDetail />} />
      </Routes>
    </Router>
  );
}

export default App;
