"""
Late interaction embedding providers (ColBERT, ColPali-style models).

These models produce per-token embeddings instead of a single vector per document.
We store both the mean vector (for UMAP/clustering) and the per-token vectors
(for MaxSim late interaction search).
"""

from .base import EmbedModelProvider


class ColBERTEmbedProvider(EmbedModelProvider):
    """Provider for ColBERT-style models via sentence-transformers.

    Compatible with models like:
    - colbert-ir/colbertv2.0
    - answerdotai/answerai-colbert-small-v1
    - jinaai/jina-colbert-v2

    These models use the ColBERT architecture which produces per-token embeddings.
    """

    def __init__(self, name, params):
        super().__init__(name, params)
        self.late_interaction = True
        import torch
        self.torch = torch
        self.device = torch.device(
            "cuda" if torch.cuda.is_available()
            else "mps" if torch.backends.mps.is_available()
            else "cpu"
        )

    def load_model(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(self.name, trust_remote_code=True, device=self.device)
        self.tokenizer = self.model.tokenizer

    def embed(self, inputs, dimensions=None):
        """Return mean embeddings as a list of lists (standard interface).

        For the full token-level embeddings, use embed_multi().
        """
        mean_vectors, _ = self.embed_multi(inputs, dimensions=dimensions)
        return mean_vectors.tolist()

    def embed_multi(self, inputs, dimensions=None):
        """Return both mean and per-token embeddings.

        Returns
        -------
        mean_vectors : np.ndarray of shape (N, D)
            Mean-pooled embeddings for each input.
        token_vectors_list : list[np.ndarray]
            Per-token embeddings for each input. Each element has shape (T_i, D)
            where T_i is the number of tokens for that input.
        """
        import numpy as np

        # Get the raw model output with all token embeddings
        # sentence-transformers encode() returns pooled by default,
        # so we need to use the underlying model for token-level output
        features = self.tokenizer(
            inputs,
            padding=True,
            truncation=True,
            return_tensors="pt",
            max_length=getattr(self.model, "max_seq_length", 512),
        ).to(self.device)

        with self.torch.no_grad():
            model_output = self.model.forward(features)

        # model_output typically has 'token_embeddings' and 'sentence_embedding'
        if hasattr(model_output, "token_embeddings"):
            all_token_embs = model_output.token_embeddings
        elif isinstance(model_output, dict) and "token_embeddings" in model_output:
            all_token_embs = model_output["token_embeddings"]
        else:
            # Fallback: use the last hidden state directly
            all_token_embs = model_output.get(
                "last_hidden_state", model_output[0]
            )

        attention_mask = features["attention_mask"]

        # Truncate dimensions if requested (Matryoshka-style)
        if dimensions is not None and dimensions > 0:
            all_token_embs = all_token_embs[:, :, :dimensions]

        # Normalize token embeddings
        all_token_embs = self.torch.nn.functional.normalize(all_token_embs, p=2, dim=-1)

        token_vectors_list = []
        mean_vectors_list = []

        for i in range(len(inputs)):
            mask = attention_mask[i].bool()
            # Skip special tokens (CLS, SEP, PAD) - keep only real tokens
            # For most models, position 0 is CLS. We keep it for ColBERT compatibility.
            token_embs = all_token_embs[i][mask].cpu().numpy()
            token_vectors_list.append(token_embs)

            # Mean pool for the dense vector
            mean_vec = token_embs.mean(axis=0)
            mean_vec = mean_vec / (np.linalg.norm(mean_vec) + 1e-10)
            mean_vectors_list.append(mean_vec)

        mean_vectors = np.array(mean_vectors_list, dtype=np.float32)
        return mean_vectors, token_vectors_list


class ColPaliEmbedProvider(EmbedModelProvider):
    """Provider for ColPali-style vision-language late interaction models.

    Compatible with models like:
    - vidore/colpali-v1.2
    - vidore/colqwen2-v1.0

    These models embed both text queries and document images, producing
    per-patch/per-token embeddings for late interaction retrieval.
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

    def embed_multi(self, inputs, dimensions=None):
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
