# Development of Latent Scope

If you are interested in customizing or contributing to latent-scope this document explains the ways to develop it.

## Python module
The `latentscope` directory contains the python source code for the [latent scope pip module](). There are three primary parts to the module:

1. server - contains the flask app and API routes
2. scripts - 
3. models/
4. util/

### Running locally
If you modify the python code and want to try out your changes, you can run locally like so:

```
python -m venv testenv
source venv/bin/activate
pip install -e .
ls-serve ~/latent-scope-data
```


## Web client
The `web` directory contains the JavaScript React source code for the web interface. Node.js is required to be installed on your system to run the development server or build a new version of the module.

```
cd web
npm install
npm run dev
```
This sets up a local development server for the client code, typically at http://localhost:5173  
This will call the local API at http://localhost:5001 as set in `web/.env.development`


## Building for distribution
You can build a new version of the module, this will package the latest version of the web interface as well.

```
python setup.py sdist bdist_wheel
```
This builds the package, including the React app, and bundles it all up. 

```
deactivate
python setup.py sdist bdist_wheel
source testenv/bin/activate
pip install dist/latentscope-0.1.0-py3-none-any.whl

```


# Python Code

## Configuration
`latentscope/util`   

The module makes use of `dotenv` to save important configuration environment variables. The most important variable is `DATA_DIR`.
This determines where the input data is stored as well as all of output from each step in the process.

API keys for the various proprietary model APIs are also stored in the .env file created by `dotenv`.

## App
`latentscope/server/`   
The flask app that runs the API and hosts the web UI has multiple components. The main setup is in `app.py` while `datasets.py`, `search.py`, `tags.py` provide specific routes. `jobs.py` is explained below.

## Jobs
`latentscope/server/jobs.py`  
The process run by the web UI is done by kicking off subprocesses that call the command line script for each step. The progress of the subprocess is captured and saved in a job JSON file and is updated continuously until the process completes or errors. This allows us to poll and display the status of the commands from the web UI.

## Models
`latentscope/models`
The code to run models or call APIs is centralized here. The idea is to provide a uniform interface for embedding and another for summarization and allow the configuration of each model (context length, truncation etc.) to be specified in a single JSON file. We then can use the JSON file to power UI choices on which model to use in the process.

### Embedding models
Embedding models are prepared in [latentscope/models/embedding_models.json](latentscope/models/embedding_models.json).
There is a `get_embedding_model(id)` function which will load the appropriate class based on the model provider. See `providers/` for `transformers`, `openai`, `cohereai`, `togetherai`, `voyageai`

### Chat models
Chat models for summarization of clusters are prepared in [latentscope/models/chat_models.json](latentscope/models/chat_models.json). 
There is a `get_chat_model(id)` function which will load the appropriate class based on the model provider. Each provider can support a chat model if the interface is implemented. Adding more chat providers should be relatively straightforward and is still a TODO item.

## Scripts
The scripts are outlined in the [README.md](README.md). Each one provides a python interface as well as a command line interface for running its part of the process. They all use ids to read relevant data from disk and then output any relevant information to disk.

The idea is that each step in the process may be run with many different parameters or need to be rerun and you shouldn't have to wonder what you did before.


# React code
The react application that powers the web UI is split up into pages and components. It could certainly use some refactoring and there is a lot of development planned around the UI as the underlying data is solidified.

## Pages

### Home
See list of datasets and scopes

### Setup
Setup scopes

### Explore
Explore scopes

### Jobs
Show list of jobs that have run for a dataset

### Job
Follow a specific job while its running, or rerun an error job.

### Mobile
Mobile is currently unsupported as the regl-scatterplot component that powers the scatter plots doesn't work well on Android or at all on iOS.
