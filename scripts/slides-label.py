# Usage: python embed-openai.py <dataset_name> <text_column>
import os
import json
import time
import tiktoken
import argparse
import numpy as np
import pandas as pd
from tqdm import tqdm
from openai import OpenAI
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModel

load_dotenv()

enc = tiktoken.encoding_for_model("text-embedding-ada-002")

def chunked_iterable(iterable, size):
    """Yield successive chunks from an iterable."""
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]

def too_many_duplicates(line, threshold=10):
    word_count = {}
    words = line.split()
    for word in words:
        word_count[word] = word_count.get(word, 0) + 1
    return any(count > threshold for count in word_count.values())

def labeler(dataset_name, text_column="text", slides_name="slides-001", model_name="gpt-3.5-turbo", context=""):

    df = pd.read_parquet(f"../data/{dataset_name}/input.parquet")
    # TODO This should be dropped in the preprocessing step
    df = df.reset_index(drop=True)

    slides = pd.read_parquet(f"../data/{dataset_name}/slides/{slides_name}.parquet")
    # Sentences we want sentence embeddings for

    extracts = []
    print(df.index)
    for _, row in slides.iterrows():
        indices = row['indices']
        items = df.loc[list(indices), text_column]
        items = items.drop_duplicates()
        text = '\n'.join([f"{i+1}. {t}" for i, t in enumerate(items) if not too_many_duplicates(t)])
        # text = '\n * '.join(df.loc[list(indices), text_column])
        print(text)
        encoded_text = enc.encode(text)
        if len(encoded_text) > 4000:
            encoded_text = encoded_text[:4000]
        extracts.append(enc.decode(encoded_text))


    # TODO we arent really batching these
    batch_size = 1
    labels = []

    # openai.api_key = os.getenv("OPENAI_API_KEY")
    rate_limit = 400  # number of requests per minute
    start_time = time.time()
    request_count = 0
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    for batch in tqdm(chunked_iterable(extracts, batch_size),  total=len(extracts)//batch_size):
        # print(batch[0])
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role":"system", "content": f"""You're job is to summarize lists of items with a short label of no more than 4 words. 
{context}
The user will submit a bulleted list of items and you should choose a label that best summarizes the theme of the list so that someone browsing the labels will have a good idea of what is in the list. 
Do not use punctuation, just return a few words that summarize the list."""},
                    {"role":"user", "content": batch[0]} # TODO hardcoded batch size
                ]
            )
            # label = response['choices'][0]['message']['content']
            label = response.choices[0].message.content
            print("label", label)
            label = label.replace("\n", " ")
            label = label.replace('"', '')
            label = label.replace("'", '')
            # label = label.replace("-", '')
            label = ' '.join(label.split())
            label = " ".join(label.split(" ")[0:5])
            
            print("cut label", label)
            labels.append(label)

        except Exception as e: 
            print(e)
            print(batch[0])
            print("exiting")
            exit()

        # Rate limit the requests
        request_count += 1
        if request_count >= rate_limit:
            elapsed_time = time.time() - start_time
            if elapsed_time < 60:
                time.sleep(60 - elapsed_time)
            start_time = time.time()
            request_count = 0

    print("sentence embeddings:", len(labels))
    # add lables to slides df
    slides_df = slides.copy()
    slides_df['label'] = labels

    # write the df to parquet
    slides_df.to_parquet(f"../data/{dataset_name}/slides/{slides_name}-labeled.parquet")

    with open(f'../data/{dataset_name}/slides/{slides_name}.json', 'w') as f:
        json.dump({
            "slides_name": slides_name,
            "model": model_name,
        }, f)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Label a set of slides using OpenAI')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('text_column', type=str, help='Output file', default='text')
    parser.add_argument('slides_name', type=str, help='name of slides set', default='slides-001')
    parser.add_argument('model', type=str, help='Name of model to use', default="gpt-3.5-turbo")
    parser.add_argument('context', type=str, help='Additional context for labeling model', default="")

    # Parse arguments
    args = parser.parse_args()

    labeler(args.name, args.text_column, args.slides_name, args.model, args.context)
