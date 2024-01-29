class EmbedModelProvider:
    def __init__(self, name, params):
        self.name = name
        self.params = params

    def load_model(self):
        raise NotImplementedError("This method should be implemented by subclasses.")

    def embed(self, text):
        raise NotImplementedError("This method should be implemented by subclasses.")

class ChatModelProvider:
    def __init__(self, name, params):
        self.name = name
        self.params = params

    def load_model(self):
        raise NotImplementedError("This method should be implemented by subclasses.")

    def chat(self, messages):
        raise NotImplementedError("This method should be implemented by subclasses.")

