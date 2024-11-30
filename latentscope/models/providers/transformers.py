from .base import EmbedModelProvider, ChatModelProvider

class TransformersEmbedProvider(EmbedModelProvider):
    def __init__(self, name, params):
        super().__init__(name, params)
        import torch
        self.torch = torch
        self.device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
        
    def load_model(self):
        # from transformers import AutoTokenizer, AutoModel
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(self.name, trust_remote_code=True, device=self.device)#, backend="onnx")
        self.tokenizer = self.model.tokenizer

    def embed(self, inputs, dimensions=None):
        embeddings = self.model.encode(inputs, convert_to_tensor=True)
        # Support Matroyshka embeddings
        if dimensions is not None and dimensions > 0:
            embeddings = self.torch.nn.functional.layer_norm(embeddings, normalized_shape=(embeddings.shape[1],))
            embeddings = embeddings[:, :dimensions]

        # Normalize embeddings
        normalized_embeddings = self.torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return normalized_embeddings.tolist()


class TransformersChatProvider(ChatModelProvider):
    def __init__(self, name, params):
        super().__init__(name, params)
        import torch
        from transformers import pipeline
        import outlines
        self.torch = torch
        self.pipeline = pipeline
        self.outlines = outlines
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    def load_model(self):
        # TODO: support bfloat16 for non mac environments
        from transformers import AutoTokenizer
        self.model = self.outlines.models.transformers(self.name)
        self.generator = self.outlines.generate.text(self.model)
        # TODO: this had an error. but also it would exclude foreign characters
        # self.generator = self.outlines.generate.regex(
        #     self.model
        #     , r"[a-zA-Z0-9 ]+"
        #     )
        self.encoder = AutoTokenizer.from_pretrained(self.name, trust_remote_code=True)
        # self.pipe = self.pipeline("text-generation", model=self.name, torch_dtype=self.torch.float16, device=self.device, trust_remote_code=True)

    def summarize(self, items, context=""):
        # from tqdm import tqdm
        from .prompts import summarize, summarize_system_prompt
        prompt = summarize(items, context)
        # tqdm.write(f"Summarizing {prompt}")
        # Apply chat template to format prompt for model
        formatted_prompt = self.encoder.apply_chat_template([
            # {"role": "system", "content": summarize_system_prompt},
            {"role": "user", "content": prompt}], 
            tokenize=False,
            add_generation_prompt=True)
        return self.generator(formatted_prompt)
