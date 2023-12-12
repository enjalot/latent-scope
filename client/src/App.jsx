import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DatasetsList from './components/DatasetsList';
import DatasetDetail from './components/DatasetDetail';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DatasetsList />} />
        <Route path="/datasets/:dataset" element={<DatasetDetail />} />
      </Routes>
    </Router>
  );
}

export default App;
