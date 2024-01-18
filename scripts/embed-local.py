# Usage: python embed-local.py <dataset_name> <text_column> <model>
import os
import sys
import json
import torch
import argparse
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
    model = AutoModel.from_pretrained(model_name, trust_remote_code=True)
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
    if not os.path.exists(f'../data/{dataset_name}/embeddings'):
        os.makedirs(f'../data/{dataset_name}/embeddings')

    # TODO: make the sanitization a function
    safe_model_name = model_name.replace("/", "___")
    np.save(f'../data/{dataset_name}/embeddings/{safe_model_name}.npy', np_embeds)
    # # write out a json file with the model name and shape of the embeddings
    # with open(f'../data/{dataset_name}/meta.json', 'w') as f:
    #     json.dump({
    #         "id": dataset_name,
    #         "text_column": text_column, 
    #         "length": len(sentences),
    #         "active_embeddings": safe_model_name, 
    #         }, f, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Embed a dataset')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('model', type=str, help='Name of Transformer Embedding model to use', default="BAAI/bge-small-en-v1.5")

    # Parse arguments
    args = parser.parse_args()

    embedder(args.name, args.text_column, args.model)
