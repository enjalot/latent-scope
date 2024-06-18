import os
import time
from .base import EmbedModelProvider


class VoyageAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        import voyageai 
        from tokenizers import Tokenizer
        from latentscope.util import get_key
        api_key = get_key("VOYAGE_API_KEY")
        if api_key is None:
            print("ERROR: No API key found for Voyage")
            print("Missing 'VOYAGE_API_KEY' variable in:", f"{os.getcwd()}/.env")
        self.client = voyageai.Client(api_key)
        # The voyage client provides a tokenizer that only encodes https://docs.voyageai.com/tokenization/
        # It also says that it uses the same tokenizer as Llama 2
        self.encoder = Tokenizer.from_pretrained("TheBloke/Llama-2-70B-fp16")

    def embed(self, inputs, dimensions=None):
        time.sleep(0.1) # TODO proper rate limiting
        # We truncate the input ourselves, even though the API supports truncation its still possible to send too big a batch
        enc = self.encoder
        max_tokens = self.params["max_tokens"]
        inputs = [enc.decode(enc.encode(b).ids[:max_tokens]) if len(enc.encode(b)) > max_tokens else b for b in inputs]
        response = self.client.embed(texts=inputs, model=self.name, truncation=self.params["truncation"])
        embeddings = response.embeddings
        return embeddings