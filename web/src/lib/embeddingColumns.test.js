import { describe, it, expect } from 'vitest';
import {
  isImageColumn,
  modelSupportsImages,
  modelSupportsText,
  filterModelsForColumn,
} from './embeddingColumns.js';

// Model shapes mirror latentscope/models/embedding_models.json
const textModel = {
  id: 'transformers-sentence-transformers___all-MiniLM-L6-v2',
  provider: 'transformers',
  params: { dimensions: 384 },
};
const openaiModel = {
  id: 'openai-text-embedding-3-small',
  provider: 'openai',
  params: { dimensions: 1536 },
};
const clipModel = {
  id: 'clip-openai___clip-vit-large-patch14',
  provider: 'clip',
  group: 'image',
  params: { dimensions: 768, input_types: ['image', 'text'] },
};
const siglipModel = {
  id: 'clip-google___siglip-so400m-patch14-384',
  provider: 'clip',
  group: 'image',
  params: { dimensions: 1152, input_types: ['image', 'text'] },
};
const vitModel = {
  id: 'vision-google___vit-base-patch16-224-in21k',
  provider: 'vision',
  group: 'image',
  params: { dimensions: 768, input_types: ['image'] },
};
const dinoModel = {
  id: 'vision-facebook___dinov2-base',
  provider: 'vision',
  group: 'image',
  params: { dimensions: 768, input_types: ['image'] },
};
const allModels = [textModel, openaiModel, clipModel, siglipModel, vitModel, dinoModel];

// Column metadata shapes mirror latentscope/scripts/ingest.py
const binaryImageColumn = { type: 'image', image: true, image_kind: 'binary' };
const urlImageColumn = { type: 'string', image: true, image_kind: 'url' };
const stringColumn = { type: 'string', unique_values_count: 100 };

describe('isImageColumn', () => {
  it('detects binary image columns', () => {
    expect(isImageColumn(binaryImageColumn)).toBe(true);
  });

  it('treats url image columns as text (backend embeds the url string)', () => {
    expect(isImageColumn(urlImageColumn)).toBe(false);
  });

  it('returns false for string columns and missing metadata', () => {
    expect(isImageColumn(stringColumn)).toBe(false);
    expect(isImageColumn(undefined)).toBe(false);
    expect(isImageColumn(null)).toBe(false);
  });
});

describe('modelSupportsImages / modelSupportsText', () => {
  it('clip/siglip support both images and text', () => {
    expect(modelSupportsImages(clipModel)).toBe(true);
    expect(modelSupportsText(clipModel)).toBe(true);
  });

  it('vision-only models support images but not text', () => {
    expect(modelSupportsImages(vitModel)).toBe(true);
    expect(modelSupportsText(vitModel)).toBe(false);
  });

  it('models without input_types are text-only', () => {
    expect(modelSupportsImages(textModel)).toBe(false);
    expect(modelSupportsText(textModel)).toBe(true);
  });

  it('handles undefined model', () => {
    expect(modelSupportsImages(undefined)).toBe(false);
    expect(modelSupportsText(undefined)).toBe(true);
  });
});

describe('filterModelsForColumn', () => {
  it('image column: only models whose input_types includes image', () => {
    const filtered = filterModelsForColumn(allModels, binaryImageColumn);
    expect(filtered.map((m) => m.id)).toEqual([
      clipModel.id,
      siglipModel.id,
      vitModel.id,
      dinoModel.id,
    ]);
  });

  it('text column: excludes image-only models, keeps clip/siglip and text models', () => {
    const filtered = filterModelsForColumn(allModels, stringColumn);
    expect(filtered.map((m) => m.id)).toEqual([
      textModel.id,
      openaiModel.id,
      clipModel.id,
      siglipModel.id,
    ]);
  });

  it('url image column behaves like a text column', () => {
    const filtered = filterModelsForColumn(allModels, urlImageColumn);
    expect(filtered).not.toContain(vitModel);
    expect(filtered).toContain(clipModel);
    expect(filtered).toContain(textModel);
  });

  it('undefined metadata: all text-capable models', () => {
    const filtered = filterModelsForColumn(allModels, undefined);
    expect(filtered.map((m) => m.id)).toEqual([
      textModel.id,
      openaiModel.id,
      clipModel.id,
      siglipModel.id,
    ]);
  });

  it('tolerates null/undefined entries and missing model list', () => {
    expect(filterModelsForColumn(null, binaryImageColumn)).toEqual([]);
    expect(filterModelsForColumn([textModel, null, undefined, vitModel], binaryImageColumn)).toEqual(
      [vitModel]
    );
  });
});
