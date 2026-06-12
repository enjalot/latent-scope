// Helpers for matching embedding models to the selected dataset column.
//
// Dataset meta.json column_metadata entries for image columns look like:
//   { type: "image", image: true, image_kind: "binary" }   (raw/HF-style bytes)
//   { type: "string", image: true, image_kind: "url" }     (image URLs)
// Only type === "image" columns are embedded as images by the backend
// (latentscope/scripts/embed.py); url columns are embedded as text.
//
// Embedding models (latentscope/models/embedding_models.json) declare
// params.input_types for image-capable models:
//   ["image", "text"]  — CLIP / SigLIP (embed both)
//   ["image"]          — vision-only models (ViT, DINOv2)
// Text models have no input_types field.

/** True when the column will be embedded as images by the backend. */
export function isImageColumn(columnMeta) {
  return columnMeta?.type === 'image';
}

/** True when the model can embed image inputs. */
export function modelSupportsImages(model) {
  const inputTypes = model?.params?.input_types;
  return Array.isArray(inputTypes) && inputTypes.includes('image');
}

/** True when the model can embed text inputs (models without input_types are text models). */
export function modelSupportsText(model) {
  const inputTypes = model?.params?.input_types;
  if (!Array.isArray(inputTypes)) return true;
  return inputTypes.includes('text');
}

/**
 * Filter the model list down to models compatible with the selected column.
 * - image column: only models whose params.input_types includes "image"
 * - text column (or unknown metadata): exclude image-only models, keep
 *   text models and dual-input models like CLIP/SigLIP
 */
export function filterModelsForColumn(models, columnMeta) {
  const list = (models || []).filter((m) => !!m);
  return isImageColumn(columnMeta)
    ? list.filter(modelSupportsImages)
    : list.filter(modelSupportsText);
}
