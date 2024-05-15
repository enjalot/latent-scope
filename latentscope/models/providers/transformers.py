from .base import EmbedModelProvider, ChatModelProvider

class TransformersEmbedProvider(EmbedModelProvider):
    def __init__(self, name, params):
        super().__init__(name, params)
        import torch
        self.torch = torch
        self.device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

    def cls_pooling(self, model_output):
        return model_output[0][:, 0]

    def average_pooling(self, model_output, attention_mask):
        last_hidden = model_output.last_hidden_state.masked_fill(~attention_mask[..., None].bool(), 0.0)
        return last_hidden.sum(dim=1) / attention_mask.sum(dim=1)[..., None]

    def mean_pooling(self, model_output, attention_mask):
        token_embeddings = model_output[0]
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        return self.torch.sum(token_embeddings * input_mask_expanded, 1) / self.torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        
    def load_model(self):
        from transformers import AutoTokenizer, AutoModel

        if "rps" in self.params and self.params["rps"]:
            self.model = AutoModel.from_pretrained(self.name, trust_remote_code=True, safe_serialization=True, rotary_scaling_factor=2 )
        else:
            self.model = AutoModel.from_pretrained(self.name, trust_remote_code=True)

        print("CONFIG", self.model.config)

        if self.name == "nomic-ai/nomic-embed-text-v1" or self.name == "nomic-ai/nomic-embed-text-v1.5":
            self.tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased", model_max_length=self.params["max_tokens"])
        else:
            self.tokenizer = AutoTokenizer.from_pretrained(self.name)

        self.model.to(self.device)
        self.model.eval()

    def embed(self, inputs, dimensions=None):
        encoded_input = self.tokenizer(inputs, padding=self.params["padding"], truncation=self.params["truncation"], return_tensors='pt')
        encoded_input = {key: value.to(self.device) for key, value in encoded_input.items()}
        pool = self.params["pooling"]
        # Compute token embeddings
        with self.torch.no_grad():
            model_output = self.model(**encoded_input)
            if pool == "cls":
                embeddings = self.cls_pooling(model_output)
            elif pool == "average":
                embeddings = self.average_pooling(model_output, encoded_input["attention_mask"])
            elif pool == "mean":
                embeddings = self.mean_pooling(model_output, encoded_input["attention_mask"])

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
        self.torch = torch
        self.pipeline = pipeline

    def load_model(self):
        # self.pipe = pipeline("text-generation", model="TinyLlama/TinyLlama-1.1B-Chat-v1.0", torch_dtype=torch.bfloat16, device_map="auto")
        # self.pipe = pipeline("text-generation", model="TinyLlama/TinyLlama-1.1B-Chat-v1.0", torch_dtype=torch.bfloat16, device_map="cpu")
        # TODO: support bfloat16 for non mac environmentss
        self.pipe = self.pipeline("text-generation", model=self.name, torch_dtype=self.torch.float16, device_map="auto")
        self.encoder = self.pipe.tokenizer

    def chat(self, messages, max_new_tokens=24):
        prompt = self.pipe.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        outputs = self.pipe(prompt, max_new_tokens=max_new_tokens, do_sample=True, temperature=0.7, top_k=50, top_p=0.95)
        generated_text = outputs[0]["generated_text"]
        print("GENERATED TEXT", generated_text)
        if "<|start_header_id|>assistant<|end_header_id|>" in generated_text:
            generated_text = generated_text.split("<|start_header_id|>assistant<|end_header_id|>")[1].strip()
        elif "<|assistant|>" in generated_text:
            generated_text = generated_text.split("<|assistant|>")[1].strip()
        return generated_text