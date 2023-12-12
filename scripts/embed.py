# Usage: python embed.py <dataset_name> <text_column>
import os
import sys
import time
import json
import torch
import numpy as np
import pandas as pd
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModel

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def embedder(dataset_name, text_column="text", model_name="BAAI/bge-small-en-v1.5"):

  df = pd.read_parquet(f"../data/{dataset_name}/input.parquet")
  # Sentences we want sentence embeddings for
  sentences = df[text_column].tolist()
  print("embedding", len(sentences), "sentences")

  # Load model from HuggingFace Hub
  tokenizer = AutoTokenizer.from_pretrained(model_name)
  model = AutoModel.from_pretrained(model_name)
  model.eval()

  batch_size = 100
  sentence_embeddings = []

  for batch in tqdm(chunked_iterable(sentences, batch_size),  total=len(sentences)//batch_size):
    # Tokenize sentences
    encoded_input = tokenizer(batch, padding=True, truncation=True, return_tensors='pt')
    # Compute token embeddings
    with torch.no_grad():
        model_output = model(**encoded_input)
        # Perform pooling. In this case, cls pooling.
        batch_sentence_embeddings = model_output[0][:, 0]

    # Normalize embeddings
    batch_sentence_embeddings = torch.nn.functional.normalize(batch_sentence_embeddings, p=2, dim=1)
    sentence_embeddings.append(batch_sentence_embeddings)


  # Concatenate all embeddings
  sentence_embeddings = torch.cat(sentence_embeddings, dim=0)
  np_embeds = sentence_embeddings.numpy()
  print("sentence embeddings:", sentence_embeddings.shape)

  # Save embeddings as a numpy file
  np.save(f'../data/{dataset_name}/embeddings.npy', np_embeds)
  # write out a json file with the model name and shape of the embeddings
  with open(f'../data/{dataset_name}/embeddings.json', 'w') as f:
      json.dump({"model": model_name, "shape": np_embeds.shape}, f)



if __name__ == "__main__":
    dataset_name = sys.argv[1]
    text_column = sys.argv[2]
    model = "BAAI/bge-small-en-v1.5"
    embedder(dataset_name, text_column)
