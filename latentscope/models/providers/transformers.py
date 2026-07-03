from .base import ChatModelProvider, EmbedModelProvider


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
        # Task-conditioned models (e.g. jina-v3/v5) advertise `config.task_names`
        # and refuse to encode until a task is selected (they swap a LoRA adapter
        # per task). Select the requested task, else a sensible default, so these
        # models work without the caller needing a task-specialised checkpoint.
        try:
            module = self.model[0]
            task_names = list(getattr(getattr(module, "config", None), "task_names", None) or [])
            self.task_names = task_names
            if task_names and getattr(module, "default_task", None) is None:
                requested = getattr(self, "task", None) or (self.params or {}).get("task")
                if requested and requested in task_names:
                    chosen = requested
                elif "retrieval" in task_names:
                    chosen = "retrieval"
                else:
                    chosen = task_names[0]
                module.default_task = chosen
                self.task = chosen
                print(f"transformers: model is task-conditioned {task_names}; "
                      f"using task '{chosen}'")
        except Exception as e:
            print(f"transformers: task auto-detect skipped ({e})")
        # If the model defines task prompts (e.g. jina-v5's {query, document})
        # but no default, apply the document/passage prompt automatically so
        # embedding a corpus gets the retrieval "document" representation without
        # the user having to know the right --prefix. A manual --prefix still
        # stacks on top if provided, so leave it empty for prompt-aware models.
        try:
            prompts = getattr(self.model, "prompts", None) or {}
            has_default = getattr(self.model, "default_prompt_name", None)
            if prompts and not has_default:
                for key in ("document", "passage", "corpus", "doc", "text"):
                    if key in prompts:
                        self.model.default_prompt_name = key
                        print(f"transformers: auto-applying '{key}' prompt "
                              f"({prompts[key]!r}) for {self.name}")
                        break
        except Exception as e:
            print(f"transformers: prompt auto-detect skipped ({e})")

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
        import outlines
        import torch
        from transformers import pipeline
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
