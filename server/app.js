const express = require('express');
const path = require('path');

const app = express();
const port = 3113;

app.use(express.json());

// API Routes
const api = express.Router();
api.get("/datasets", (req, res) => {
  res.send(["dataset1", "dataset2", "dataset3"])
})
app.use("/api", api)

// Dataset Routes
// make it easy to fetch dataset files directly from folder
const datasets = express.Router();
app.get('*', (req, res) => {
  console.log("req url", req.url)
  let datasetPath = req.url.split('/dataset')[1];
  res.sendFile(path.join(__dirname, '../data/', datasetPath));
});
app.use("/dataset", datasets)

// Serve static files in production if not an API route
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}


app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
