"""
Late interaction embedding providers (ColBERT, ColPali-style models).

These models produce per-token embeddings instead of a single vector per document.
We store both the mean vector (for UMAP/clustering) and the per-token vectors
(for MaxSim late interaction search).
"""

from .base import EmbedModelProvider


class ColBERTEmbedProvider(EmbedModelProvider):
    """Provider for ColBERT-style models via pylate.

    Compatible with models like:
    - colbert-ir/colbertv2.0
    - answerdotai/answerai-colbert-small-v1
    - jinaai/jina-colbert-v2

    pylate loads the trained ColBERT head: the linear projection (e.g.
    768->128 / 384->96), the [Q]/[D] marker tokens, query expansion, and
    punctuation masking on documents. Loading these checkpoints through plain
    sentence-transformers (the previous implementation) silently skipped all
    of that and stored raw, unprojected BERT token states.
    """

    # Documents are encoded in small sub-batches regardless of the pipeline
    # batch size: one padded forward over a whole pipeline batch (100+ docs at
    # up to max_seq_length each) OOMs on long-context models like
    # jina-colbert-v2 (8192 tokens).
    ENCODE_BATCH_SIZE = 8

    def __init__(self, name, params):
        super().__init__(name, params)
        self.late_interaction = True
        import torch
        self.torch = torch
        try:
            if torch.cuda.is_available():
                self.device = "cuda"
            elif torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"
        except Exception:
            self.device = "cpu"

    def load_model(self):
        from pylate import models as pylate_models

        self.model = pylate_models.ColBERT(
            model_name_or_path=self.name,
            device=self.device,
            trust_remote_code=True,
        )

    def embed(self, inputs, dimensions=None):
        """Return mean embeddings as a list of lists (standard interface).

        For the full token-level embeddings, use embed_multi().
        """
        mean_vectors, _ = self.embed_multi(inputs, dimensions=dimensions)
        return mean_vectors.tolist()

    def embed_multi(self, inputs, dimensions=None, is_query=False):
        """Return both mean and per-token embeddings.

        Parameters
        ----------
        is_query : bool
            Encode as ColBERT queries ([Q] marker + query expansion) instead
            of documents ([D] marker + punctuation masking).

        Returns
        -------
        mean_vectors : np.ndarray of shape (N, D)
            Mean-pooled embeddings for each input (L2-normalized).
        token_vectors_list : list[np.ndarray]
            Per-token embeddings for each input. Each element has shape (T_i, D)
            where T_i is the number of tokens for that input.
        """
        import numpy as np

        token_vectors_list = self.model.encode(
            list(inputs),
            is_query=is_query,
            convert_to_numpy=True,
            show_progress_bar=False,
            batch_size=self.ENCODE_BATCH_SIZE,
        )

        if dimensions is not None and dimensions > 0:
            truncated = []
            for tv in token_vectors_list:
                tv = tv[:, :dimensions]
                norms = np.linalg.norm(tv, axis=1, keepdims=True)
                truncated.append(tv / (norms + 1e-10))
            token_vectors_list = truncated

        token_vectors_list = [tv.astype(np.float32) for tv in token_vectors_list]

        mean_vectors_list = []
        for tv in token_vectors_list:
            mean_vec = tv.mean(axis=0)
            mean_vec = mean_vec / (np.linalg.norm(mean_vec) + 1e-10)
            mean_vectors_list.append(mean_vec)

        mean_vectors = np.array(mean_vectors_list, dtype=np.float32)
        return mean_vectors, token_vectors_list

    def tokenize_documents(self, inputs):
        """Reproduce pylate's document tokenization, aligned 1:1 with the
        vectors embed_multi stores.

        pylate encodes documents as: tokenizer(text, truncation,
        max_length=document_length - 1), then inserts the document marker
        token at position 1, then drops tokens whose id is in the punctuation
        skiplist (the dropped positions get no output vector). This method
        replays that pipeline with return_offsets_mapping so each stored
        vector gets a surface string and char span.

        Returns
        -------
        list[list[tuple[str, int, int]]]
            Per input, one (token_str, char_start, char_end) per kept token,
            in stored-vector order. Tokens with no surface form (CLS, the
            document marker, SEP) have char_start == char_end == -1.
        """
        model = self.model
        tokenizer = model.tokenizer
        prefix_id = getattr(model, "document_prefix_id", None)
        prefix_str = getattr(model, "document_prefix", None)
        max_length = model.document_length - (1 if prefix_id is not None else 0)
        skiplist = set(model.skiplist)

        encoded = tokenizer(
            list(inputs),
            truncation=True,
            max_length=max_length,
            return_offsets_mapping=True,
        )

        results = []
        for ids, offsets in zip(encoded["input_ids"], encoded["offset_mapping"]):
            strs = tokenizer.convert_ids_to_tokens(ids)
            offsets = list(offsets)
            if prefix_id is not None:
                ids = [ids[0], prefix_id] + ids[1:]
                strs = [strs[0], prefix_str] + strs[1:]
                offsets = [offsets[0], (0, 0)] + offsets[1:]
            tokens = []
            for tid, s, (start, end) in zip(ids, strs, offsets):
                if tid in skiplist:
                    continue
                if start == end:
                    tokens.append((s, -1, -1))
                else:
                    tokens.append((s, int(start), int(end)))
            results.append(tokens)
        return results


class ColPaliEmbedProvider(EmbedModelProvider):
    """EXPERIMENTAL: ColPali-style vision-language late interaction models.

    Not registered in embedding_models.json and not reachable from the UI.
    The current implementation only encodes *text* through the processor and
    reads raw last_hidden_state (not the trained retrieval projection) — image
    ingestion does not exist in the pipeline yet. Proper image support
    (including fixing this provider to use the trained ColPali head) is
    tracked as part of the image-embeddings work (issues #87/#24).
    """

    def __init__(self, name, params):
        super().__init__(name, params)
        self.late_interaction = True
        import torch
        self.torch = torch
        self.device = torch.device(
            "cuda" if torch.cuda.is_available()
            else "cpu"  # ColPali typically needs CUDA
        )

    def load_model(self):
        from transformers import AutoModel, AutoProcessor
        self.processor = AutoProcessor.from_pretrained(self.name, trust_remote_code=True)
        self.model = AutoModel.from_pretrained(
            self.name, trust_remote_code=True,
            torch_dtype=self.torch.bfloat16,
        ).to(self.device).eval()

    def embed(self, inputs, dimensions=None):
        """Return mean embeddings for text inputs."""
        mean_vectors, _ = self.embed_multi(inputs, dimensions=dimensions)
        return mean_vectors.tolist()

    def embed_multi(self, inputs, dimensions=None, is_query=False):
        """Return both mean and per-token embeddings for text inputs."""
        import numpy as np

        # Process as text queries
        with self.torch.no_grad():
            batch = self.processor(
                text=inputs,
                return_tensors="pt",
                padding=True,
                truncation=True,
            ).to(self.device)
            outputs = self.model(**batch)

        # Get token embeddings from the last hidden state
        token_embs = outputs.last_hidden_state.float()

        if dimensions is not None and dimensions > 0:
            token_embs = token_embs[:, :, :dimensions]

        token_embs = self.torch.nn.functional.normalize(token_embs, p=2, dim=-1)

        attention_mask = batch.get("attention_mask")
        token_vectors_list = []
        mean_vectors_list = []

        for i in range(len(inputs)):
            if attention_mask is not None:
                mask = attention_mask[i].bool()
                embs = token_embs[i][mask].cpu().numpy()
            else:
                embs = token_embs[i].cpu().numpy()

            token_vectors_list.append(embs)
            mean_vec = embs.mean(axis=0)
            mean_vec = mean_vec / (np.linalg.norm(mean_vec) + 1e-10)
            mean_vectors_list.append(mean_vec)

        mean_vectors = np.array(mean_vectors_list, dtype=np.float32)
        return mean_vectors, token_vectors_list
