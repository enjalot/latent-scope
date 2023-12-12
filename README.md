# latent-scope
A lens formed by the embeddings of a model, illuminated by data points and housed by an interactive web interface 


# Repository overview
This repository is currently meant to run locally, as it has several pieces that use the file system to coordinate functionality.

## data
The data directory is where you will put your datasets, and where the scripts and app will store the output of their processes along with the associated metadata. The web app will look at the contents of this folder using a specific directory structure.

## client
A React app that provides the interface for operating the scope and running the various scripts 

## scripts
Python scripts that can be run via CLI or via the web interface (through the server). The scripts assume a certain directory structure in the data folder

## server
A node.js server that 


# Directory structure

Each dataset in data will have its own directory

├── data/
|   ├── dataset1/
|   |   ├── input.parquet         # you provide this
|   |   ├── umap-001.parquet      # from umap.py, x,y coordinates
|   |   ├── umap-001.json         # from umap.py, params used
|   |   ├── umap-001.png          # from umap.py, thumbnail of plot
|   |   ├── clusters-001.parquet  # from clusters.py, cluster labels
|   |   ├── clusters-001.json     # from clusters.py, params used
|   |   ├── clusters-001.png      # from clusters.py, thumbnail of plot


# Scripts

## umap.py

## clusters.py

## csv2parquet.py
A simple utility to convert a csv file into a parquet file. It will write the output parquet file into the proper folder given by the dataset name.

```bash
python csv2parquet.py <csv_file> <dataset_name>
```