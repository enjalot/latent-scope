class EmbedModelProvider:
    def __init__(self, name, params):
        self.name = name
        self.params = params

    def load_model(self):
        raise NotImplementedError("This method should be implemented by subclasses.")

    def embed(self, text):
        raise NotImplementedError("This method should be implemented by subclasses.")

    def embed_query(self, inputs, dimensions=None):
        """Embed a search query. Defaults to plain embed(); providers whose
        models use distinct query/document prompts (e.g. transformers/jina)
        override this to apply the query prompt."""
        return self.embed(inputs, dimensions=dimensions)

class ChatModelProvider:
    def __init__(self, name, params, base_url=None):
        self.name = name
        self.params = params
        self.base_url = base_url

    def load_model(self):
        raise NotImplementedError("This method should be implemented by subclasses.")

    def chat(self, messages):
        raise NotImplementedError("This method should be implemented by subclasses.")

