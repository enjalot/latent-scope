# Latent Scope
[![](https://dcbadge.vercel.app/api/server/x7NvpnM4pY?style=flat)](https://discord.gg/x7NvpnM4pY)
[![PyPI version](https://img.shields.io/pypi/v/latentscope.svg)](https://pypi.org/project/latentscope/)

Quickly embed, project, cluster and explore a dataset. This project is a new kind of workflow + tool for visualizing and exploring datasets through the lens of latent spaces. 
[<img src="https://github.com/enjalot/latent-scope/blob/main/documentation/dadabase-explore.png?raw=true" height="480px"  alt="Example exploration">](https://enjalot.github.io/latent-scope/#/datasets/dadabase/explore/scopes-007)

The power of machine learning models to encode unstructured data into high-dimensional embeddings is relatively under-explored. Retrieval Augmented Generation has taken off as a popular usecase for embeddings, but do you feel confident in your understanding of why certain data is being retrieved? Do you have a clear picture of what all is in your dataset? Latentscope is like a microscope that allows you to get a new perspective on what's happening to your data when it's embedded. You can try similarity search with different embeddings, peruse automatically labeled clusters and zoom in on individual data points all while keeping the context of your entire dataset. 

### Demo
This tool is meant to be run locally or on a trusted server to process data for viewing in the latent scope. You can see the result of the process in a read-only [live demo](https://enjalot.github.io/latent-scope):
* [datavis survey responses](https://enjalot.github.io/latent-scope/#/datasets/datavis-misunderstood/explore/scopes-001) - 700 survey responses
* [Dolly 15k](https://enjalot.github.io/latent-scope/#/datasets/dolly15k/explore/scopes-001) - 15k instructions
* [r/DadJokes](https://enjalot.github.io/latent-scope/#/datasets/dadabase/explore/scopes-004) - 50k dad jokes
* [emotion](https://enjalot.github.io/latent-scope/#/datasets/emotion/explore/scopes-001) - 400k emotion statements from Twitter

The source of each demo dataset is documented in the notebooks linked below. Each demo was chosen to represent different scales of data as well as some common usecases.

[<img src="https://github.com/enjalot/latent-scope/blob/main/documentation/dadabase-scopes.png?raw=true" width="100%"  alt="Dadabase demo scopes">](https://enjalot.github.io/latent-scope)


### Quick Start
To get started, install the [latent-scope module](https://pypi.org/project/latentscope/) and run the server via the Command Line:

```bash
python -m venv venv
source venv/bin/activate
pip install latentscope
ls-init ~/local-scope-data --openai_key=XXX --mistral_key=YYY # optional api keys to enable API models 
ls-serve 
```

Then open your browser to http://localhost:5001 and start processing your first dataset!  
<img src="https://github.com/enjalot/latent-scope/blob/main/documentation/home.png?raw=true" width="320px"  alt="Ingest">  <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/0-ingest.png?raw=true" width="320px"  alt="Ingest">

Once ingested, you will go through the following 6 steps: Embed, UMAP, Cluster, Label, Scope and Explore 
 <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/1-embed.png?raw=true" width="320px"  alt="Embed"> <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/2-umap.png?raw=true" width="320px"  alt="UMAP"> <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/3-cluster.png?raw=true" width="320px"  alt="Cluster"> <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/4-label.png?raw=true" width="320px"  alt="Label"> <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/5-scope.png?raw=true" width="320px"  alt="Scope"> <img src="https://github.com/enjalot/latent-scope/blob/main/documentation/6-explore.png?raw=true" width="320px"  alt="Scope">

Each step focuses on the relevant choices to move you to the next step. For example choosing which embedding model you want to use to embed with, or the parameters for UMAP. It's very likely you may want to try several choices at each step, which is why the final step before "Explore" is to make a "scope". You can make multiple scopes, as seen in the [dadabase example](https://enjalot.github.io/latent-scope/#/datasets/dadabase/explore/scopes-004) to explore your data through different lenses (i.e. OpenAI embeddings vs. Jina v2).

### Python interface
You can also ingest data from a Pandas dataframe using the Python interface:
```python
from latentscope import ls
df = pd.read_parquet("...")
ls.init("~/latent-scope-data") # you can also pass in openai_key="XXX", mistral_key="XXX" etc.)
ls.ingest("dadabase", df, text_column="joke")
ls.serve()
```


See these notebooks for detailed examples of using the Python interface to prepare and load data.  
* [dvs-survey](notebooks/dvs-survey.ipynb) - A small test dataset of 700 rows to quickly illustrate the process. This notebook shows how you can do every step of the process with the Python interface.
* [dadabase](notebooks/dadabase.ipynb) - A more interesting (and funny) dataset of 50k rows. This notebook shows how you can preprocess a dataset, ingest it into latentscope and then use the web interface to complete the process.
* [dolly15k](notebooks/dolly15k.ipynb) - Grab data from HuggingFace datasets and ingest into the process.
* [emotion](notebooks/emotion.ipynb) - 400k rows of emotional tweets.

### Command line quick start
When latent-scope is installed, it creates a suite of command line scripts that can be used to setup the scopes for exploring in the web application. The output of each step in the process is flat files stored in the data directory specified at init. These files are in standard formats that were designed to be ported into other pipelines or interfaces.

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
ls-label datavis-misunderstood "answer" cluster-001 transformers-HuggingFaceH4___zephyr-7b-beta ""
# ls-scope  dataset_id embedding_id umap_id cluster_id cluster_labels_id label description
ls-scope datavis-misunderstood cluster-001-labels-001 "E5 demo" "E5 embeddings summarized by Zephyr 7B"
# start the server to explore your scope
ls-serve
```

### Repository overview
This repository is currently meant to run locally, with a React frontend that communicates with a python server backend. We support several popular open source embedding models that can run locally as well as proprietary API embedding services. Adding new models and services should be quick and easy.

To learn more about customizing, extending and contributing see [DEVELOPMENT.md](documentation/DEVELOPMENT.md)


### Design principles
This tool is meant to be a part of a larger process. Something that hopefully helps you see things in your data that you wouldn't otherwise have. That means it needs to be easy to get data in, and easily get useful data out.

1. Flat files
  - All of the data that drives the app is stored in flat files. This is so that both final and intermediate outputs can easily be exported for other uses. It also makes it easy to see the status of any part of the process.
2. Remember everything
  - This tool is intended to aid in research, the purpose is experimentation and exploration. I developed it because far too often I try a lot of things and then I forget what parameters lead me down a promising path in the first place. All choices you make in the process are recorded in metadata files along with the output of the process.
3. It's all about the indices
  - We consider an input dataset the source of truth, a list of rows that can be indexed into. So all downstream operations, whether its embeddings, pointing to nearest neighbors or assigning data points to clusters, all use indices into the input dataset.


## Command Line Scripts: Detailed description
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
# you can get a list of models available with:
ls-list-models
# ls-embed <dataset_name> <text_column> <model_id>
ls-embed dadabase joke transformers-intfloat___e5-small-v2
```

### 2. umap
Map the embeddings from high-dimensional space to 2D with UMAP. Will generate a thumbnail of the scatterplot.
```bash
# ls-umap <dataset_name> <embedding_id> <neighbors> <min_dist>
ls-umap dadabase embedding-001 50 0.1
```


### 3. cluster
Cluster the UMAP points using HDBSCAN. This will label each point with a cluster label
```bash
# ls-cluster <dataset_name> <umap_id> <samples> <min-samples>
ls-cluster dadabase umap-001 5 3
```

### 4. label
We support auto-labeling clusters by summarizing them with an LLM. Supported models and APIs are listed in [latentscope/models/chat_models.json](latentscope/models/chat_models.json). 
You can pass context that will be injected into the system prompt for your dataset.
```bash
# ls-label <dataset_id> <cluster_id> <chat_model_id> <context>
ls-label dadabase "joke" cluster-001 openai-gpt-3.5-turbo ""
```

### 5. scope
The scope command ties together each step of the process to create an explorable configuration. You can have several scopes to view different choices, for example using different embeddings or even different parameters for UMAP and clustering. Switching between scopes in the UI is instant.

```bash
# ls-scope  <dataset_id> <embedding_id> <umap_id> <cluster_id> <cluster_labels_id> <label> <description>
ls-scope datavis-misunderstood cluster-001-labels-001 "E5 demo" "E5 embeddings summarized by GPT3.5-Turbo"
```

### 6. serve
To start the web UI we run a small server. This also enables nearest neighbor similarity search and interactively querying subsets of the input data while exploring the scopes.

```bash
ls-serve ~/latent-scope-data
```


## Dataset directory structure
Each dataset will have its own directory in data/ created when you ingest your CSV. All subsequent steps of setting up a dataset write their data and metadata to this directory.
There are no databases in this tool, just flat files that are easy to copy and edit.
<pre>
├── data/
|   ├── dataset1/
|   |   ├── input.parquet                           # from ingest.py, the dataset
|   |   ├── meta.json                               # from ingest.py, metadata for dataset, #rows, columns, text_column
|   |   ├── embeddings/
|   |   |   ├── embedding-001.h5                    # from embed.py, embedding vectors
|   |   |   ├── embedding-001.json                  # from embed.py, parameters used to embed
|   |   |   ├── embedding-002...                   
|   |   ├── umaps/
|   |   |   ├── umap-001.parquet                    # from umap.py, x,y coordinates
|   |   |   ├── umap-001.json                       # from umap.py, params used
|   |   |   ├── umap-001.png                        # from umap.py, thumbnail of plot
|   |   |   ├── umap-002....                        
|   |   ├── clusters/
|   |   |   ├── clusters-001.parquet                # from cluster.py, cluster indices
|   |   |   ├── clusters-001-labels-default.parquet # from cluster.py, default labels
|   |   |   ├── clusters-001-labels-001.parquet     # from label_clusters.py, LLM generated labels
|   |   |   ├── clusters-001.json                   # from cluster.py, params used
|   |   |   ├── clusters-001.png                    # from cluster.py, thumbnail of plot
|   |   |   ├── clusters-002...                     
|   |   ├── scopes/
|   |   |   ├── scopes-001.json                     # from scope.py, combination of embed, umap, clusters and label choice
|   |   |   ├── scopes-...                      
|   |   ├── tags/
|   |   |   ├── ❤️.indices                           # tagged by UI, powered by tags.py
|   |   |   ├── ...                                 # can have arbitrary named tags
|   |   ├── jobs/
|   |   |   ├──  8980️-12345...json                  # created when job is run via web UI
</pre>
