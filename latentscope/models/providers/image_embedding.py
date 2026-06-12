"""
Image embedding providers (CLIP, SigLIP, ViT, DINOv2).

These models embed images (PIL.Image objects) into the same vector store the
text providers use: one L2-normalized vector per input row. Dual encoders
(CLIP/SigLIP) also embed text through the same projection, so image and
caption columns of a dataset land in a single shared space.
"""

from .base import EmbedModelProvider


def _projected_features(output):
    """get_image_features/get_text_features return a plain tensor on
    transformers 4.x but a BaseModelOutputWithPooling (with the projected
    features in pooler_output) on 5.x. Accept both."""
    pooled = getattr(output, "pooler_output", None)
    return pooled if pooled is not None else output


def _select_device(torch):
    try:
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"
    except Exception:
        return "cpu"


class CLIPEmbedProvider(EmbedModelProvider):
    """Dual-encoder (CLIP / SigLIP) provider via AutoModel + AutoProcessor.

    Accepts either PIL images or strings per batch and routes them through
    get_image_features / get_text_features respectively, so an image column
    and a caption column embedded with the same model share one space.

    Compatible with models like:
    - openai/clip-vit-large-patch14
    - google/siglip-so400m-patch14-384
    """

    # Forward through the model in small sub-batches regardless of the
    # pipeline batch size: a padded forward over 100+ images OOMs easily.
    ENCODE_BATCH_SIZE = 16

    supports_images = True
    input_types = ["image", "text"]

    def __init__(self, name, params):
        super().__init__(name, params)
        import torch
        self.torch = torch
        self.device = _select_device(torch)

    def load_model(self):
        from transformers import AutoModel, AutoProcessor
        self.processor = AutoProcessor.from_pretrained(self.name)
        self.model = AutoModel.from_pretrained(self.name).to(self.device).eval()

    def _encode_sub_batch(self, sub_batch):
        if isinstance(sub_batch[0], str):
            # padding="max_length" is required for SigLIP (how it was
            # trained) and harmless for CLIP (pads to its 77-token max).
            tokens = self.processor(
                text=list(sub_batch),
                padding="max_length",
                truncation=True,
                return_tensors="pt",
            ).to(self.device)
            return _projected_features(self.model.get_text_features(**tokens))
        pixels = self.processor(
            images=list(sub_batch), return_tensors="pt"
        ).to(self.device)
        return _projected_features(self.model.get_image_features(**pixels))

    def embed(self, inputs, dimensions=None):
        results = []
        with self.torch.no_grad():
            for i in range(0, len(inputs), self.ENCODE_BATCH_SIZE):
                features = self._encode_sub_batch(inputs[i:i + self.ENCODE_BATCH_SIZE])
                features = features.float()
                if dimensions is not None and dimensions > 0:
                    features = features[:, :dimensions]
                features = self.torch.nn.functional.normalize(features, p=2, dim=1)
                results.extend(features.cpu().tolist())
        return results


class VisionEncoderEmbedProvider(EmbedModelProvider):
    """Image-only vision encoders (ViT / DINOv2) via AutoImageProcessor +
    AutoModel.

    Uses pooler_output when the model provides one, otherwise the CLS token
    of last_hidden_state. Compatible with models like:
    - google/vit-base-patch16-224-in21k
    - facebook/dinov2-base
    """

    ENCODE_BATCH_SIZE = 16

    supports_images = True
    input_types = ["image"]

    def __init__(self, name, params):
        super().__init__(name, params)
        import torch
        self.torch = torch
        self.device = _select_device(torch)

    def load_model(self):
        from transformers import AutoImageProcessor, AutoModel
        self.processor = AutoImageProcessor.from_pretrained(self.name)
        self.model = AutoModel.from_pretrained(self.name).to(self.device).eval()

    def embed(self, inputs, dimensions=None):
        if len(inputs) > 0 and isinstance(inputs[0], str):
            raise ValueError(
                f"{self.name} is an image-only encoder and cannot embed text. "
                "Use a dual encoder (CLIP/SigLIP) for text columns."
            )
        results = []
        with self.torch.no_grad():
            for i in range(0, len(inputs), self.ENCODE_BATCH_SIZE):
                pixels = self.processor(
                    images=list(inputs[i:i + self.ENCODE_BATCH_SIZE]),
                    return_tensors="pt",
                ).to(self.device)
                outputs = self.model(**pixels)
                features = getattr(outputs, "pooler_output", None)
                if features is None:
                    features = outputs.last_hidden_state[:, 0]  # CLS token
                features = features.float()
                if dimensions is not None and dimensions > 0:
                    features = features[:, :dimensions]
                features = self.torch.nn.functional.normalize(features, p=2, dim=1)
                results.extend(features.cpu().tolist())
        return results
