# Latent Scope

Quickly embed, project, cluster and explore a dataset. I think of this as somewhere between a microscope and a workbench for visualizing and exploring datasets through the lens of embedding model latent spaces. 

### Demo
TODO (walk through website, youtube video)

### Repository overview
This repository is currently meant to run locally, with a React frontend that communicates with a python server backend. We support several popular open source embedding models that can run locally as well as proprietary API embedding services. Adding new models and services should be quick and easy.

### Python setup
The following directories depend on a virtual env

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### python_server
A python server that provides access to the data as well as on-demand nearest neighbor search and simple queries into larger datasets.
This starts a development server used by the web client on port 5001.
```bash
cd python_server
python server.py
```

### Web client
A React app that provides the interface for operating the scope and running the various scripts 
```bash
cd client
npm install
npm run dev
```
Now you can open your browser to the provided url and use Latent Scope!

## Embedding models
The scripts below (which power the app) reference embedding models by an "id" which identifies models prepared in [models/models.json](models/models.json)

There is a `get_model(id)` function which will load the appropriate class based on the model provider. See `providers/` for `transformers`, `openai`, `cohereai`, `togetherai`, `voyageai`


## Notebooks
There are some example notebooks for preparing data in CSV format for ingesting into latent scope:
* [dvs-survey](notebooks/dvs-survey.ipynb)
* [dadabase](notebooks/dadabase.ipynb)

## Scripts
The scripts should be run in order once you have an `input.csv` file in your folder. Alternatively the Setup page in the web UI will run these scripts via API calls to the server for you.

### ingest.py
This script turns the input.csv into input.parquet and sets up the directories and `meta.json` which run the app

```bash
#python ingest.py <dataset_name>
python ingest.py database-curated
```

### 1. embed.py 
Take the text from the input and embed it. Default is to use `BAAI/bge-small-en-v1.5` locally via HuggingFace transformers. API services are supported as well, see [models/models.json](models/models.json) for model ids. 

```bash
# python embed.py <dataset_name> <text_column> <model_id>
python embed.py dadabase-curated joke transformers-intfloat___e5-small-v2
```

### 2. umapper.py
Map the embeddings from high-dimensional space to 2D with UMAP. Will generate a thumbnail of the scatterplot.
```bash
# python umapper.py <dataset_name> <neighbors> <min_dist>
python umapper.py dadabase-curated 50 0.1
```


### 3. clusters.py
Cluster the UMAP points using HDBSCAN. This will label each point with a cluster label
```bash
# python cluster.py <dataset_name> <umap_name> <samples> <min-samples>
slides.py dadabase-curated umap-005 5 3
```

### 4. slides.py
Create a datastructure that allows us to annotate clusters
```bash
# python cluster.py <dataset_name> <cluster_name>
cluster.py dadabase-curated cluster-005
```

## Dataset directory structure
Each dataset will have its own directory in data/ created when you ingest your CSV. All subsequent steps of setting up a dataset write their data and metadata to this directory.
There are no databases in this tool, just flat files that are easy to copy and edit.
<pre>
├── data/
|   ├── dataset1/
|   |   ├── input.parquet                       # you provide this file
|   |   ├── embeddings/
|   |   |   ├── e5-small-v2.npy                 # from embed-*.py, embedding vectors
|   |   |   ├── UAE-Large-V1.npy                # files are named after the model
|   |   ├── umaps/
|   |   |   ├── umap-001.parquet                # from umap.py, x,y coordinates
|   |   |   ├── umap-001.json                   # from umap.py, params used
|   |   |   ├── umap-001.png                    # from umap.py, thumbnail of plot
|   |   |   ├── umap-002....                    # subsequent runs increment
|   |   ├── clusters/
|   |   |   ├── clusters-001.parquet            # from clusters.py, cluster labels
|   |   |   ├── clusters-001.json               # from clusters.py, params used
|   |   |   ├── clusters-001.png                # from clusters.py, thumbnail of plot
|   |   |   ├── clusters-...                    # from clusters.py, thumbnail of plot
|   |   ├── slides/
|   |   |   ├── slides-001.parquet              # from slides.py, cluster labels
|   |   |   ├── slides-001.json                 # from slides.py, cluster labels
|   |   |   ├── slides-...                      # from slides.py, thumbnail of plot
|   |   ├── tags/
|   |   |   ├── ❤️.indices                       # tagged by UI, powered by server.py
|   |   |   ├── ...                             # can have arbitrary named tags
|   |   ├── jobs/
|   |   |   ├──  8980️-12345...json              # created when job is run via web UI
</pre>
