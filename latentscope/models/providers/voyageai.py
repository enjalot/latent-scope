import os
import time
import voyageai 
import tokenizers
from tokenizers import Tokenizer
from .base import EmbedModelProvider


from latentscope.util import get_key

class VoyageAIEmbedProvider(EmbedModelProvider):
    def load_model(self):
        self.client = voyageai.Client(get_key("VOYAGE_API_KEY"))
        # The voyage client provides a tokenizer that only encodes https://docs.voyageai.com/tokenization/
        # It also says that it uses the same tokenizer as Llama 2
        # self.encoder = Tokenizer.from_pretrained("TheBloke/Llama-2-70B-fp16")

    def embed(self, inputs):
        time.sleep(0.1) # TODO proper rate limiting

        # We truncate the input ourselves, even though the API supports truncation its still possible to send too big a batch
        # enc = self.encoder
        # max_tokens = self.params["max_tokens"]
        # print("max tokens", max_tokens)
        # print("before", self.client.count_tokens(inputs))
        # total = 0
        # inputs = [enc.decode(enc.encode(b)[:max_tokens]) if len(enc.encode(b)) > max_tokens else b for b in inputs]
        # for i in inputs:
        #     total += len(enc.encode(i))
        #     print(len(enc.encode(i)), self.client.count_tokens([i]))
        # print("after", self.client.count_tokens(inputs))
        # print("llama 2 total", total)
        # import json
        # print("JSON")
        # print(json.dumps(inputs, indent=2))
        # print(" ")
        
        response = self.client.embed(texts=inputs, model=self.name, truncation=self.params["truncation"])
        embeddings = response.embeddings
        return embeddings