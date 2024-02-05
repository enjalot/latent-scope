# Latent Scope

Quickly embed, project, cluster and explore a dataset. I think of this project as a new kind of workflow + tool for visualizing and exploring datasets through the lens of latent spaces. 

### Demo
This tool is meant to be run locally or on a trusted server to process data for viewing in the latent scope. You can see the result of the process in live demos:
* TODO: OpenOrca
* TODO: Dolly 15k
* TODO: r/DadJokes

TODO: YouTube getting started video

### Quick Start
To get started, install the [latent-scope module]() and run the server:
```bash
python -m venv venv
source venv/bin/activate
pip install latent-scope
ls-serve ~/local-scope-data
```
Then open your browser to http://localhost:5001 and upload your first dataset!

### Notebooks
You can also configure and run the server from inside python, see these notebooks for examples of preparing and loading data:
* [dvs-survey](notebooks/dvs-survey.ipynb) - a small test dataset of 700 rows to quickly illustrate the process
* [dadabase](notebooks/dadabase.ipynb) - a more interesting (and funny) dataset of 50k rows

### Command line scripts
When latent-scope is installed, it creates a suite of command line scripts

```bash
# like above, we make sure to install latent-scope
python -m venv venv
source venv/bin/activate
pip install latent-scope

# prepare some data
wget "https://storage.googleapis.com/fun-data/latent-scope/examples/dvs-survey/datavis-misunderstood.csv" > ~/Downloads/datavis-misunderstood.csv

ls-init "~/latent-scope-data"
# ls-ingest dataset_id csv_path
ls-ingest-csv "datavis-misunderstood" "~/Downloads/datavis-misunderstood.csv"
# get a list of model ids available (lists both embedding and chat models available)
ls-list-models
# ls-embed dataset_id text_column model_id prefix
ls-embed datavis-misunderstood "answer" transformers-intfloat___e5-small-v2 ""
# ls-umap dataset_id embedding_id n_neighbors min_dist
ls-umap datavis-misunderstood embedding-001 25 .1
# ls-cluster dataset_id umap_id samples min_samples
ls-cluster datavis-misunderstood umap-001 5 5
# ls-label dataset_id text_column cluster_id model_id context
ls-label datavis-misunderstood "answer" cluster-001 transformers-HuggingFaceH4___zephyr-7b-beta
# ls-scope  dataset_id labels_id
ls-scope datavis-misunderstood cluster-001-labels-001
ls-serve
```

### Repository overview
This repository is currently meant to run locally, with a React frontend that communicates with a python server backend. We support several popular open source embedding models that can run locally as well as proprietary API embedding services. Adding new models and services should be quick and easy.

To learn more about customizing, extending and contributing see [DEVELOPMENT.md](DEVELOPMENT.md)


### Design principles
This tool is meant to be a part of a larger process. Something that hopefully helps you see things in your data that you wouldn't otherwise have. That means it needs to be easy to get data in, and easily get useful data out.

1. Flat files
  - All of the data that drives the app is stored in flat files. This is so that both final and intermediate outputs can easily be exported for other uses. It also makes it easy to see the status of any part of the process.
2. Remember everything
  - This tool is intended to aid in research, the purpose is experimentation and exploration. I developed it because far too often I try a lot of things and then I forget what parameters lead me down a promising path in the first place. All choices you make in the process are recorded in metadata files along with the output of the process.
3. It's all about the indices
  - We consider an input dataset the source of truth, a list of rows that can be indexed into. So all downstream operations, whether its embeddings, pointing to nearest neighbors or assigning data points to clusters, all use indices into the input dataset.


## Scripts
If you want to use the CLI instead of the web UI you can use the following scripts.

The scripts should be run in order once you have an `input.csv` file in your folder. Alternatively the Setup page in the web UI will run these scripts via API calls to the server for you.  
These scripts expect at the least a `LATENT_SCOPE_DATA` environment variable with a path to where you want to store your data. If you run `ls-serve` it will set the variable and put it in a `.env` file. You can add API keys to the .env file to enable usage of the various API services, see [.env.example](.env.example) for the structure.


### 0. ingest
This script turns the `input.csv` into `input.parquet` and sets up the directories and `meta.json` which run the app.

```bash
# ls-ingest <dataset_name>
ls-ingest database-curated
```

### 1. embed
Take the text from the input and embed it. Default is to use `BAAI/bge-small-en-v1.5` locally via HuggingFace transformers. API services are supported as well, see [latentscope/models/embedding_models.json](latentscope/models/embedding_models.json) for model ids. 

```bash
# ls-embed <dataset_name> <text_column> <model_id>
ls-embed dadabase-curated joke transformers-intfloat___e5-small-v2
```

### 2. umap
Map the embeddings from high-dimensional space to 2D with UMAP. Will generate a thumbnail of the scatterplot.
```bash
# ls-umap <dataset_name> <model_id> <neighbors> <min_dist>
ls-umap dadabase-curated transformers-intfloat___e5-small-v2 50 0.1
```


### 3. cluster
Cluster the UMAP points using HDBSCAN. This will label each point with a cluster label
```bash
# ls-cluster <dataset_name> <umap_name> <samples> <min-samples>
ls-cluster dadabase-curated umap-005 5 3
```

### 4. label
We support auto-labeling clusters by summarizing them with an LLM. Supported models and APIs are listed in [latentscope/models/chat_models.json](latentscope/models/chat_models.json). 
You can pass context that will be injected into the system prompt for your dataset.
```bash
# ls-label <dataset_name> <cluster_name> <model_id> <context>
ls-label dadabase-curated cluster-005 openai-gpt-3.5-turbo ""
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
