import torch
from .base import ModelProvider
from transformers import AutoTokenizer, AutoModel

def cls_pooling(model_output):
    return model_output[0][:, 0]

def average_pooling(model_output, attention_mask):
    last_hidden = model_output.last_hidden_state.masked_fill(~attention_mask[..., None].bool(), 0.0)
    return last_hidden.sum(dim=1) / attention_mask.sum(dim=1)[..., None]

def mean_pooling(model_output, attention_mask):
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)


class TransformersProvider(ModelProvider):
    def load_model(self):
        self.tokenizer = AutoTokenizer.from_pretrained(self.name)
        self.model = AutoModel.from_pretrained(self.name, trust_remote_code=True)
        self.model.eval()

    def embed(self, inputs):
        encoded_input = self.tokenizer(inputs, padding=self.params["padding"], truncation=self.params["truncation"], return_tensors='pt')
        pool = self.params["pooling"]
        # Compute token embeddings
        with torch.no_grad():
            model_output = self.model(**encoded_input)
            if pool == "cls":
                embeddings = cls_pooling(model_output)
            elif pool == "average":
                embeddings = average_pooling(model_output, encoded_input["attention_mask"])
            elif pool == "mean":
                embeddings = mean_pooling(model_output, encoded_input["attention_mask"])

        # Normalize embeddings
        normalized_embeedings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return normalized_embeedings.tolist()