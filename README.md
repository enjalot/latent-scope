# latent-scope
A lens formed by the embeddings of a model, illuminated by data points and housed by an interactive web interface 


# Repository overview
This repository is currently meant to run locally, as it has several pieces that use the file system to coordinate functionality.

## data
The data directory is where you will put your datasets, and where the scripts and app will store the output of their processes along with the associated metadata. The web app will look at the contents of this folder using a specific directory structure.

## client
A React app that provides the interface for operating the scope and running the various scripts 
```bash
cd client
npm install
npm run dev
```

## scripts
Python scripts that can be run via CLI or via the web interface (through the server). The scripts assume a certain directory structure in the data folder.  
See below for more detailed instructions on using the scripts


## python_server
A python server that provides access to the data as well as on-demand nearest neighbor search and simple queries into larger datasets
```bash
cd python_server
python server.py
```

# Directory structure

Each dataset in data will have its own directory
<pre>
├── data/
|   ├── dataset1/
|   |   ├── input.parquet                   # you provide this file
|   |   ├── umaps/
|   |   |   ├── umap-001.parquet                # from umap.py, x,y coordinates
|   |   |   ├── umap-001.json                   # from umap.py, params used
|   |   |   ├── umap-001.png                    # from umap.py, thumbnail of plot
|   |   |   ├── umap-002....                    # subsequent runs increment
|   |   ├── clusters/
|   |   |   ├── clusters-umap-001-001.parquet   # from clusters.py, cluster labels
|   |   |   ├── clusters-umap-001-001.json      # from clusters.py, params used
|   |   |   ├── clusters-umap-001-001.png       # from clusters.py, thumbnail of plot
|   |   |   ├── clusters-umap-001-...           # from clusters.py, thumbnail of plot
|   |   ├── tags/
|   |   |   ├── ❤️.indices                       # tagged by UI, powered by server.py
|   |   |   ├── ...                             # can have arbitrary named tags
</pre>

# Scripts
The scripts should be run in order once you have an `input.parquet` file in your folder. You will need to install the dependencies:

```bash
pip install fastparquet pyarrow umap-learn hdbscan matplotlib
```

Follow along by downloading the dad_jokes.csv file from https://www.kaggle.com/datasets/usamabuttar/dad-jokes into data/, and cd into the scripts folder:

```bash
cd scripts/
```

## csv2parquet.py
A simple utility to convert a csv file into a parquet file. It will write the output parquet file into the proper folder given by the dataset name.

```bash
#python csv2parquet.py <csv_file> <dataset_name>
python csv2parquet.py ../data/dad_jokes.csv dadabase-curated
```

## 1. embed.py 
Take the text from the input and embed it. Default is to use `BAAI/bge-small-en-v1.5` locally via HuggingFace transformers.

```bash
# python embed.py <dataset_name> <text_column>
python embed.py dadabase-curated joke
# output: reading ../dad_jokes.csv… wrote ../data/dadabase-curated/input.parquet
```

## 2. umapper.py
Map the embeddings from high-dimensional space to 2D with UMAP. Will generate a thumbnail of the scatterplot.
```bash
# python umapper.py <dataset_name> <neighbors> <min_dist>
python umapper.py dadabase-curated 50 0.075 
# output: embedding 13187 sentences… 132it [03:19,  1.51s/it]… sentence embeddings: torch.Size([13187, 384])
```


## 3. clusters.py
Cluster the UMAP points using HDBSCAN. This will label each point with a cluster label
```bash
# python cluster.py <dataset_name> <umap_name> <samples> <min_samples>
python cluster.py dadabase-curated umap-002 50 5
```

## Optional 1D scripts
There are `umap-1d.py` and `cluster-1d.py` which will create 1-dimensional umaps and clustering. This can be useful for ordering the data in a list.

## TODO: Higher-dimensional clustering
