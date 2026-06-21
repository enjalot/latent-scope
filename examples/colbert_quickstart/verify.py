"""Verify ColBERT late-interaction (MaxSim) similarity search via LanceDB.

For each topic we issue a natural-language query and check that the top results
are on-topic. This exercises the exact path the Explore search box uses:
encode the query with ColBERT query expansion (is_query=True), then MaxSim
re-rank candidates pulled from the LanceDB per-token vector store.
"""
import os

import pandas as pd

from latentscope.models import get_embedding_model
from latentscope.util import get_data_dir
from latentscope.util.embedding_store import search_late_interaction

DATASET = "colbert-quickstart"
MODEL_ID = "colbert-answerdotai___answerai-colbert-small-v1"
EMBEDDING_ID = "embedding-001"
TOPK = 5

QUERIES = {
    "cooking": "how do I bake fresh bread at home",
    "space": "what happens inside a black hole",
    "finance": "how should I invest my retirement savings",
    "sports": "the player scored a goal in the match",
    "programming": "a fast data structure for key value lookups",
    "gardening": "tips for growing healthy tomato plants",
}


def main():
    data_dir = get_data_dir()
    df = pd.read_parquet(os.path.join(data_dir, DATASET, "input.parquet"))

    model = get_embedding_model(MODEL_ID)
    model.load_model()

    total_hits = 0
    for expected_topic, query in QUERIES.items():
        _, query_token_vectors = model.embed_multi([query], is_query=True)
        query_tokens = query_token_vectors[0]
        indices, scores = search_late_interaction(
            data_dir, DATASET, EMBEDDING_ID, query_tokens,
            prefilter_limit=200, final_limit=TOPK,
        )
        topics = [df.iloc[i]["topic"] for i in indices[:TOPK]]
        hits = sum(t == expected_topic for t in topics)
        total_hits += hits
        print(f"\nquery: {query!r}  (expect: {expected_topic})")
        for rank, i in enumerate(indices[:TOPK]):
            row = df.iloc[i]
            mark = "OK" if row["topic"] == expected_topic else "  "
            print(f"  {mark} [{scores[rank]:.3f}] ({row['topic']}) {row['text']}")
        print(f"  -> {hits}/{TOPK} on-topic")

    denom = len(QUERIES) * TOPK
    print(f"\nTOTAL on-topic in top-{TOPK}: {total_hits}/{denom}")
    # Each query's single most-relevant cluster should dominate its top-5.
    assert total_hits >= len(QUERIES) * 3, (
        f"late-interaction search quality below threshold ({total_hits}/{denom})"
    )
    print("PASS: late-interaction (MaxSim) search via LanceDB returns on-topic results")


if __name__ == "__main__":
    main()
