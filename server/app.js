const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const port = 3113;

app.use(express.json());

// API Routes
const api = express.Router();
api.get("/datasets", (req, res) => {
  const directoryPath = path.join(__dirname, '../data/');
  let datasets = {};
  fs.readdirSync(directoryPath).forEach(dir => {
    const filePath = path.join(directoryPath, dir, 'embeddings.json');
    if (fs.existsSync(filePath)) {
      const jsonString = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(jsonString);
      datasets[dir] = jsonData;
    }
  });
  res.send(datasets);
  
})
api.get("/dataset/:dataset/meta", (req, res) => {
  // get all the metadata for this dataset
  const dataset = req.params.dataset;
  const directoryPath = path.join(__dirname, '../data/', dataset);
  console.log("dataset", dataset, directoryPath)
  
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return console.log('Unable to scan directory: ' + err);
    } 
    // Listing all files using forEach
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    console.log("files", files)
    console.log("json", jsonFiles)
    let jsonContents = {};
    jsonFiles.forEach(file => {
      try {
          const jsonString = fs.readFileSync(path.join(directoryPath, file), 'utf8')
          const jsonData = JSON.parse(jsonString);
          jsonContents[file] = jsonData;
        } catch(err) {
          console.log('Error parsing JSON string:', err);
        }
    });
    res.send(jsonContents);
  });
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
