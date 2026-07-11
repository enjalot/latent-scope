# Usage: ls-tokenize <dataset_id> <embedding_id>
# Builds the token metadata table (token strings + char offsets) for a late
# interaction embedding, aligned 1:1 with the stored per-token vectors.
# Required before token-granularity umap/cluster/scope steps.
import argparse
import json
import os
import sys

from latentscope.util import get_data_dir


def main():
    parser = argparse.ArgumentParser(
        description="Build token metadata (strings + char offsets) for a late "
                    "interaction embedding")
    parser.add_argument("dataset_id", type=str,
                        help="Dataset name (directory name in data/)")
    parser.add_argument("embedding_id", type=str,
                        help="Late interaction embedding to tokenize (e.g. embedding-001)")
    parser.add_argument("--batch_size", type=int, default=500,
                        help="Documents tokenized per batch")
    args = parser.parse_args()
    tokenizer(args.dataset_id, args.embedding_id, batch_size=args.batch_size)


def tokenizer(dataset_id, embedding_id, batch_size=500):
    DATA_DIR = get_data_dir()

    meta_path = os.path.join(DATA_DIR, dataset_id, "embeddings", f"{embedding_id}.json")
    if not os.path.exists(meta_path):
        print(f"No embedding metadata at {meta_path}")
        sys.exit(1)
    with open(meta_path) as f:
        emb_meta = json.load(f)

    if not emb_meta.get("late_interaction"):
        print(f"{embedding_id} is not a late interaction embedding; "
              "token metadata only applies to per-token (ColBERT-style) models.")
        sys.exit(1)
    if emb_meta.get("input_type") == "image":
        print("Token metadata is not supported for image embeddings.")
        sys.exit(1)

    import numpy as np
    import pandas as pd
    from tqdm import tqdm

    from latentscope.models import get_embedding_model
    from latentscope.util.embedding_store import (
        append_token_metadata,
        count_token_metadata,
        create_token_metadata_indexes,
        drop_token_metadata,
        load_num_tokens,
    )

    text_column = emb_meta["text_column"]
    prefix = emb_meta.get("prefix") or ""
    model_id = emb_meta["model_id"]

    print("loading document token counts")
    num_tokens = load_num_tokens(DATA_DIR, dataset_id, embedding_id)

    df = pd.read_parquet(
        os.path.join(DATA_DIR, dataset_id, "input.parquet"), columns=[text_column])
    if len(df) != len(num_tokens):
        print(f"Row count mismatch: input.parquet has {len(df)} rows but the "
              f"embedding has {len(num_tokens)}. Was the dataset re-ingested "
              "after embedding?")
        sys.exit(1)

    print("MODEL ID", model_id)
    model = get_embedding_model(model_id)
    if emb_meta.get("task"):
        model.task = emb_meta["task"]
    model.load_model()
    if not hasattr(model, "tokenize_documents"):
        print(f"Model {model_id} does not support document tokenization.")
        sys.exit(1)

    # Reproduce embed.py's input prep exactly: same empty/NaN handling, same
    # prefix concatenation — the offsets must refer to the strings that were
    # actually embedded, then get shifted back to the raw column value.
    def prep(s):
        if pd.isna(s) or s == "":
            return " "
        if not isinstance(s, str):
            return str(s)
        return s

    # Re-runs start clean: a partial table from a crashed run would silently
    # misalign token_index.
    drop_token_metadata(DATA_DIR, dataset_id, embedding_id)

    prefix_len = len(prefix)
    token_index = 0
    mismatches = []
    total_batches = (len(df) + batch_size - 1) // batch_size

    texts = df[text_column]
    for b in tqdm(range(total_batches)):
        start_row = b * batch_size
        end_row = min(start_row + batch_size, len(df))
        raw = [prep(texts.iloc[i]) for i in range(start_row, end_row)]
        batch_tokens = model.tokenize_documents([prefix + s for s in raw])

        ls_indices, token_pos, token_strs, char_starts, char_ends = [], [], [], [], []
        for row_offset, tokens in enumerate(batch_tokens):
            ls_index = start_row + row_offset
            expected = int(num_tokens[ls_index])
            if len(tokens) != expected:
                mismatches.append((ls_index, expected, len(tokens)))
                continue
            for pos, (token_str, char_start, char_end) in enumerate(tokens):
                if prefix_len and char_start != -1:
                    # shift offsets back to the raw column value; tokens that
                    # fall inside the prefix get no surface span
                    char_start -= prefix_len
                    char_end -= prefix_len
                    if char_start < 0:
                        char_start, char_end = -1, -1
                ls_indices.append(ls_index)
                token_pos.append(pos)
                token_strs.append(token_str)
                char_starts.append(char_start)
                char_ends.append(char_end)

        if mismatches:
            break
        if token_strs:
            append_token_metadata(
                DATA_DIR, dataset_id, embedding_id,
                ls_indices, token_pos, token_strs, char_starts, char_ends,
                start_token_index=token_index,
            )
            token_index += len(token_strs)

    if mismatches:
        drop_token_metadata(DATA_DIR, dataset_id, embedding_id)
        print(f"\nTokenization mismatch on {len(mismatches)} row(s); "
              "token metadata was NOT written.")
        for ls_index, expected, got in mismatches[:10]:
            print(f"  row {ls_index}: embedding stored {expected} token vectors, "
                  f"re-tokenization produced {got}")
        print("This usually means the model, its tokenizer, or pylate's document "
              "processing changed since the embedding was created. Re-run "
              "ls-embed, or pin the versions used at embed time.")
        sys.exit(1)

    expected_total = int(num_tokens.sum())
    if token_index != expected_total:
        drop_token_metadata(DATA_DIR, dataset_id, embedding_id)
        print(f"Token total mismatch: wrote {token_index}, embedding has "
              f"{expected_total}. Token metadata was NOT written.")
        sys.exit(1)

    print("creating indexes")
    create_token_metadata_indexes(DATA_DIR, dataset_id, embedding_id)

    tokens_meta = {
        "embedding_id": embedding_id,
        "dataset_id": dataset_id,
        "model_id": model_id,
        "text_column": text_column,
        "prefix": prefix,
        "total_tokens": token_index,
        "rows": len(df),
        "avg_tokens_per_row": round(token_index / max(len(df), 1), 2),
    }
    with open(os.path.join(DATA_DIR, dataset_id, "embeddings",
                           f"{embedding_id}-tokens.json"), "w") as f:
        json.dump(tokens_meta, f, indent=2)

    written = count_token_metadata(DATA_DIR, dataset_id, embedding_id)
    print(f"done: {written} tokens across {len(df)} documents")


if __name__ == "__main__":
    main()
