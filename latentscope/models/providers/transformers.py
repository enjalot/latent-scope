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
        self.encoder = AutoTokenizer.from_pretrained(self.name, trust_remote_code=True)
        # self.pipe = self.pipeline("text-generation", model=self.name, torch_dtype=self.torch.float16, device=self.device, trust_remote_code=True)

    # def chat(self, messages, max_new_tokens=24):
    #     prompt = self.pipe.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    #     outputs = self.pipe(prompt, max_new_tokens=max_new_tokens, do_sample=True, temperature=0.7, top_k=50, top_p=0.95)
    #     generated_text = outputs[0]["generated_text"]
    #     print("GENERATED TEXT", generated_text)
    #     if "<|start_header_id|>assistant<|end_header_id|>" in generated_text:
    #         generated_text = generated_text.split("<|start_header_id|>assistant<|end_header_id|>")[1].strip()
    #     elif "<|assistant|>" in generated_text:
    #         generated_text = generated_text.split("<|assistant|>")[1].strip()
    #     return generated_text
    def summarize(self, items, context=""):
        # from tqdm import tqdm
        from .prompts import summarize
        prompt = summarize(items, context)
        # tqdm.write(f"Summarizing {prompt}")
        return self.generator(prompt)
