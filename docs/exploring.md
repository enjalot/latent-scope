# Exploring, coloring, and comparing scopes

Once you have built a scope (`ls-scope`) and started the server (`ls-serve`), the
web UI lets you explore the map, color it by your data, and compare two scopes
side by side.

---

## Color-by (Explore and Compare)

You can color the points on both the **Explore** map and the **Compare** panes by
any numeric or categorical column in your dataset
([issue #131](https://github.com/enjalot/latent-scope/issues/131)):

- **Numeric columns** render as a continuous color ramp with a legend showing the
  column's `[min, max]` extent (the extent is precomputed at ingest time and
  stored in `meta.json → column_metadata`).
- **Categorical columns** (string columns with ≤100 distinct values, whose
  categories/counts are recorded at ingest) render as discrete category colors.

Pick a column from the color-by control; selection highlighting still composes on
top of the data-driven colors, so you can color by a column and lasso-select at
the same time.

Under the hood the UI fetches per-point values (aligned to the dataset's
`ls_index` order) from the color-by column endpoint, so the colors line up
exactly with the points on the map.

---

## Compare page: shared selection

The **Compare** page shows two scopes side by side. A lasso/brush selection in
either pane becomes **shared state**: the selected rows are highlighted in *both*
panes using the same visual language as Explore's selection
([issue #132](https://github.com/enjalot/latent-scope/issues/132)). The selection
summary appears in the Compare data panel, making it easy to see how the same
rows land in two different projections or clusterings.

Combine this with color-by to, for example, brush a region in one embedding's map
and see where those same rows scatter in another.

---

## Named experiments + gallery

UMAP and cluster runs can carry human-friendly `--name` / `--description` values
(see [docs/clustering.md](clustering.md#named-runs--the-experiment-gallery)). The
Setup UI renders a browsable **gallery** of a dataset's umaps and clusterings —
thumbnails, titles, parameter badges, and cluster-quality metrics — instead of a
bare `umap-001` / `cluster-001` id list, so multi-experiment workflows stay
navigable. Names and descriptions are editable inline in the gallery without
re-running the step.

---

## Curation (post-1.0)

**Curation is not part of Latent Scope 1.0.** Row-level curation actions —
**deleting rows**, **tagging during Setup / Step 0 ingestion**, and **reassigning
points between clusters** — were removed in 0.6 and remain out of scope for 1.0.
They are planned as a **post-1.0 (1.1)** initiative
([#92](https://github.com/enjalot/latent-scope/issues/92),
[#79](https://github.com/enjalot/latent-scope/issues/79),
[#80](https://github.com/enjalot/latent-scope/issues/80)).

Note that similarity search, filtering, and **tagging in the Explore view** still
work in 1.0 — the deferred work is the broader curation workflow (editing the
underlying dataset), not exploration.
