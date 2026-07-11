"""Network definitions for pretrained basemap (parametric UMAP) projectors.

These mirror the architectures trained in the latent-basemap project so its
checkpoints can be loaded for inference here without importing that repo.
Two checkpoint lineages exist:

- "umapnet": residual MLP with LayerNorm (``UMAPNet``), saved as
  ``{"model_state_dict", "config": {d_in, hidden_dim, n_layers, d_out}}``.
- "parametric_umap": the vendored library's ``MLP`` / ``ResidualBottleneckMLP``,
  saved flat with ``architecture``, ``input_dim``, ``hidden_dim``, ``n_layers``,
  ``n_components`` alongside ``model_state_dict``.

This module imports torch, so import it lazily (inside functions), matching the
convention for heavy deps elsewhere in latentscope.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


class UMAPNet(nn.Module):
    """Residual LayerNorm MLP from latent-basemap's Modal training scripts."""

    def __init__(self, d_in=384, hidden_dim=512, d_out=2, n_layers=3,
                 use_tanh=False, output_scale=5.0):
        super().__init__()
        self.use_tanh = use_tanh
        self.output_scale = output_scale
        self.proj_in = nn.Linear(d_in, hidden_dim)
        self.blocks = nn.ModuleList([
            nn.Sequential(nn.LayerNorm(hidden_dim), nn.Linear(hidden_dim, hidden_dim), nn.ReLU())
            for _ in range(n_layers)
        ])
        self.out_norm = nn.LayerNorm(hidden_dim)
        self.proj_out = nn.Linear(hidden_dim, d_out)

    def forward(self, x):
        x = F.relu(self.proj_in(x))
        for b in self.blocks:
            x = x + b(x)
        out = self.proj_out(self.out_norm(x))
        if self.use_tanh:
            out = torch.tanh(out) * self.output_scale
        return out


class MLP(nn.Module):
    """Plain MLP from latent-basemap's parametric_umap library (state-dict compatible)."""

    def __init__(self, input_dim, hidden_dim, output_dim, num_layers=2,
                 use_batchnorm=False, use_dropout=False, dropout_prob=0.5):
        super().__init__()
        layers = []
        in_dim = input_dim
        for _ in range(num_layers):
            layers.append(nn.Linear(in_dim, hidden_dim))
            if use_batchnorm:
                layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.ReLU())
            if use_dropout:
                layers.append(nn.Dropout(dropout_prob))
            in_dim = hidden_dim
        layers.append(nn.Linear(in_dim, output_dim))
        self.model = nn.Sequential(*layers)

    def forward(self, x):
        return self.model(x)


class ResidualBottleneckMLP(nn.Module):
    """Bottleneck MLP with residual blocks, from parametric_umap (state-dict compatible)."""

    def __init__(self, input_dim, hidden_dim, output_dim, num_layers=3):
        super().__init__()
        neck_dim = hidden_dim * 3 // 4
        self.proj_in = nn.Linear(input_dim, hidden_dim)
        self.down = nn.Sequential(nn.Linear(hidden_dim, neck_dim), nn.ReLU())
        self.blocks = nn.ModuleList([
            nn.Sequential(nn.Linear(neck_dim, neck_dim), nn.ReLU())
            for _ in range(max(num_layers - 1, 0))
        ])
        self.up = nn.Sequential(nn.Linear(neck_dim, hidden_dim), nn.ReLU())
        self.proj_out = nn.Linear(hidden_dim, output_dim)

    def forward(self, x):
        x = F.relu(self.proj_in(x))
        x = self.down(x)
        for block in self.blocks:
            x = x + block(x)
        x = self.up(x)
        return self.proj_out(x)


def load_basemap_checkpoint(path, device="cpu"):
    """Load either checkpoint lineage; returns (model, info dict).

    info: {"arch", "d_in", "hidden_dim", "n_layers", "n_params"}
    """
    checkpoint = torch.load(path, map_location=device, weights_only=False)
    state_dict = checkpoint["model_state_dict"]

    if "config" in checkpoint:  # umapnet lineage
        cfg = checkpoint["config"]
        model = UMAPNet(
            d_in=cfg.get("d_in", 384),
            hidden_dim=cfg.get("hidden_dim", 512),
            d_out=cfg.get("d_out", 2),
            n_layers=cfg.get("n_layers", 3),
            use_tanh=cfg.get("use_tanh", False),
            output_scale=cfg.get("output_scale", 5.0),
        )
        info = {"arch": "umapnet", "d_in": cfg.get("d_in", 384),
                "hidden_dim": cfg.get("hidden_dim", 512), "n_layers": cfg.get("n_layers", 3)}
    elif "architecture" in checkpoint:  # parametric_umap lineage
        arch = checkpoint.get("architecture", "mlp")
        input_dim = checkpoint.get("input_dim")
        if input_dim is None:
            if "model.0.weight" in state_dict:
                input_dim = state_dict["model.0.weight"].shape[1]
            elif "proj_in.weight" in state_dict:
                input_dim = state_dict["proj_in.weight"].shape[1]
            else:
                raise KeyError(f"cannot infer input_dim from checkpoint {path}")
        input_dim = int(input_dim)
        hidden_dim = checkpoint["hidden_dim"]
        n_layers = checkpoint["n_layers"]
        n_components = checkpoint.get("n_components", 2)
        if arch == "residual_bottleneck":
            model = ResidualBottleneckMLP(input_dim, hidden_dim, n_components, n_layers)
        else:
            model = MLP(input_dim, hidden_dim, n_components, n_layers,
                        use_batchnorm=checkpoint.get("use_batchnorm", False),
                        use_dropout=checkpoint.get("use_dropout", False))
        info = {"arch": arch, "d_in": input_dim,
                "hidden_dim": hidden_dim, "n_layers": n_layers}
    else:
        raise ValueError(f"unrecognized basemap checkpoint format: {path} "
                         f"(keys: {sorted(checkpoint.keys())})")

    model.load_state_dict(state_dict)
    model.eval()
    model.to(device)
    info["n_params"] = sum(p.numel() for p in model.parameters())
    return model, info
