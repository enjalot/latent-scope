# Development of Latent Scope

If you are interested in customizing or contributing to latent-scope this document explains the ways to develop it.

## Repository Overview
TODO

## Python module
The `latentscope` directory contains the python source code for the [latent scope pip module](). There are three primary parts to the module:

1. server
2. scripts
3. models

### Running locally
If you modify the python code and want to try out your changes, you can run locally like so:

```
python -m venv testenv
source venv/bin/activate
pip install -e .
ls-serve ~/latent-scope-data
```


## Web client
The `web` directory contains the JavaScript React source code for the web interface.

```
cd web
npm install
npm run dev
```
This sets up a local development server for the client code, typically at http://localhost:5173  
This will call the local API at http://localhost:5001 as set in `web/.env.development`


## Building for distribution
TODO: flesh out these instructions

```
python setup.py sdist bdist_wheel
```
This builds the package, including the React app, and bundles it all up. This allows yo


# Python Code
TODO

## Embedding models
models prepared in [latentscope/models/embedding_models.json](latentscope/models/embedding_models.json)
There is a `get_embedding_model(id)` function which will load the appropriate class based on the model provider. See `providers/` for `transformers`, `openai`, `cohereai`, `togetherai`, `voyageai`
