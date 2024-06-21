import os
import re
import json
import argparse
from latentscope.util import get_data_dir
from latentscope import __version__


def main():
    print("MAIN")
    parser = argparse.ArgumentParser(description='Export scope as plot')
    parser.add_argument('dataset_id', type=str, help='Dataset id (directory name in data folder)')
    parser.add_argument('scope_id', type=str, help='Scope id')
    parser.add_argument('--plot_config', type=str, default=None, help='Optional plot config')

    args = parser.parse_args()
    print("ARGS", args)
    dmp(**vars(args))

def dmp(dataset_id, scope_id, plot_config=None):
    import datamapplot
    # import matplotlib
    # matplotlib.rcParams["figure.dpi"] = 300
    DATA_DIR = get_data_dir()
    print("DATA DIR", DATA_DIR)
    directory = os.path.join(DATA_DIR, dataset_id, "plots")
    if not os.path.exists(directory):
        os.makedirs(directory)

    def get_next_plot_number():
        # figure out the latest scope number
        plots_files = [f for f in os.listdir(directory) if re.match(rf"plots-{re.escape(scope_id)}-\d+\.png", f)]
        if len(plots_files) > 0:
            last_plots = sorted(plots_files)[-1]
            last_plots_number = int(last_plots.split("-")[3].split(".")[0])
            next_plots_number = last_plots_number + 1
        else:
            next_plots_number = 1
        return next_plots_number

    next_plots_number = get_next_plot_number()
    id = f"plots-{scope_id}-{next_plots_number:03d}"

    print("RUNNING:", id)

    import pandas as pd

    plot = {
        "ls_version": __version__,
        "id": id,
        "scope_id": scope_id,
        "dataset_id": dataset_id
    }

    # read each json file and add its contents to the scope file
    dataset_file = os.path.join(DATA_DIR, dataset_id, "meta.json")
    with open(dataset_file) as f:
        dataset = json.load(f)

    scope_file = os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".json")
    with open(scope_file) as f:
        scope = json.load(f)
    
    print("loaded dataset and scope")
    # load the actual labels and save everything but the indices in a dict
    scope_parquet = pd.read_parquet(os.path.join(DATA_DIR, dataset_id, "scopes", scope_id + ".parquet"))
    print("loaded scope parquet", scope_parquet.columns)
    # remove the indices column
    import numpy as np
    xy_columns = scope_parquet[['x', 'y']].to_numpy()
    # set the label to "No topic" for anything with value -1 in raw_clusters in scope_parquet
    # TODO: we could make this optional, but part of the point of latent scope is that you assign things to clusters
    # scope_parquet.loc[scope_parquet['raw_cluster'] == -1, 'label'] = "No Topic"

    labels = scope_parquet['label'].to_numpy()
    label_sizes = pd.Series(labels).value_counts()
    label_sizes.reset_index()
    print(label_sizes)

    simplified_labels = scope_parquet['label'].copy()
    # TODO: optional cut clusters with less than threshold
    threshold = 100
    # simplified_labels[np.in1d(simplified_labels, label_sizes[label_sizes < threshold].index)] = "No Topic"

    highlight_labels = np.unique(simplified_labels)

    if(plot_config):
        plot_config = json.loads(plot_config)
    if plot_config is None:
        plot_config = {
          "label_over_points": True,
          "dynamic_label_size": True,
          "add_glow": True,
          "darkmode": False,
          "dpi": 150,
          "figsize": [24, 24],
          "label_wrap_width": 10,
          "point_size": 7,
          "max_font_size": 32,
          "min_font_size": 16,
          "min_font_weight": 100,
          "max_font_weight": 1000,
          "font_family": "Roboto Condensed",
          "glow_keywords": {
              "kernel_bandwidth": 0.01,
              "kernel": "exponential",
              "n_levels": 128,
              "max_alpha": 0.75
          },
      }
    print("making plot", xy_columns.shape, labels.shape)
    print("using config", plot_config)
    fig, ax = datamapplot.create_plot(
        xy_columns, 
        simplified_labels, 
        force_matplotlib=True,
        use_medoids=True,
        highlight_labels=highlight_labels,
        **plot_config,
        # noise_label="No Topic",
        # label_wrap_width=10,
        # label_over_points=True,
        # dynamic_label_size=True,
        # dpi=150,
        # figsize=(24, 24),
        # point_size=7,
        # max_font_size=40,
        # min_font_size=16,
        # min_font_weight=100,
        # max_font_weight=1000,
        # font_family="Roboto Condensed",
        # add_glow=True,
        # glow_keywords={
        #     "kernel_bandwidth":0.01, 
        #     "kernel":"exponential", 
        #     "n_levels":128, 
        #     "max_alpha":0.75
        # },
        # highlight_labels=highlight_labels,
        # darkmode=False
    )
    plot_path = os.path.join(directory, f"{id}.png")
    fig.savefig(plot_path)
    print(f"Plot saved to {plot_path}")

    config_path = os.path.join(directory, f"{id}.json")
    with open(config_path, 'w', encoding='utf-8') as config_file:
        json.dump(plot_config, config_file, indent=4)

    print(f"Config saved to {config_path}")



