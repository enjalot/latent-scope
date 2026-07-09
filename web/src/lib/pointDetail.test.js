import { describe, it, expect } from 'vitest';
import { organizeDetailColumns, describeCellValue, formatDetailNumber } from './pointDetail';

describe('organizeDetailColumns', () => {
  const dataset = {
    text_column: 'text',
    columns: ['text', 'photo', 'thumb_url', 'link', 'score', 'tokens', 'ls_index'],
    column_metadata: {
      photo: { type: 'image', image_kind: 'binary' },
      thumb_url: { image: true, image_kind: 'url' },
      link: { url: true },
      score: { type: 'number', extent: [0, 1] },
      tokens: { type: 'array' },
    },
  };

  it('splits image columns by kind and keeps the rest in order', () => {
    const { imageColumns, textColumn, listColumns } = organizeDetailColumns(dataset);
    expect(imageColumns).toEqual([
      { column: 'photo', kind: 'binary' },
      { column: 'thumb_url', kind: 'url' },
    ]);
    expect(textColumn).toBe('text');
    expect(listColumns).toEqual(['link', 'score', 'tokens']);
  });

  it('excludes the text column and internal ls_index from the list', () => {
    const { listColumns } = organizeDetailColumns(dataset);
    expect(listColumns).not.toContain('text');
    expect(listColumns).not.toContain('ls_index');
  });

  it('handles a missing dataset and missing metadata', () => {
    expect(organizeDetailColumns(null)).toEqual({
      imageColumns: [],
      textColumn: null,
      listColumns: [],
    });
    const bare = organizeDetailColumns({ text_column: 't', columns: ['t', 'a'] });
    expect(bare.imageColumns).toEqual([]);
    expect(bare.listColumns).toEqual(['a']);
  });
});

describe('describeCellValue', () => {
  it('classifies empty values', () => {
    expect(describeCellValue(null, null).kind).toBe('empty');
    expect(describeCellValue(undefined, null).kind).toBe('empty');
    expect(describeCellValue('', null).kind).toBe('empty');
  });

  it('classifies urls from metadata and from value shape', () => {
    expect(describeCellValue('https://a.com', { url: true })).toEqual({
      kind: 'url',
      value: 'https://a.com',
    });
    expect(describeCellValue('http://b.org/x', null).kind).toBe('url');
    expect(describeCellValue('not a url', { url: true }).kind).toBe('url');
  });

  it('classifies arrays and objects for expandable JSON', () => {
    expect(describeCellValue([1, 2, 3], { type: 'array' }).kind).toBe('array');
    expect(describeCellValue([1], null).kind).toBe('array');
    expect(describeCellValue({ a: 1 }, null).kind).toBe('object');
  });

  it('formats numbers and dates as display text', () => {
    expect(describeCellValue(1234567, { type: 'number' })).toEqual({
      kind: 'text',
      display: (1234567).toLocaleString(),
    });
    expect(describeCellValue(0.123456789, { type: 'number' }).display).toBe('0.123457');
    const date = describeCellValue('2024-01-15T00:00:00Z', { type: 'date' });
    expect(date.kind).toBe('text');
    expect(date.display).not.toBe('2024-01-15T00:00:00Z'); // formatted
  });

  it('falls back to raw strings for unparseable dates and plain text', () => {
    expect(describeCellValue('not a date', { type: 'date' })).toEqual({
      kind: 'text',
      display: 'not a date',
    });
    expect(describeCellValue('hello', null)).toEqual({ kind: 'text', display: 'hello' });
  });
});

describe('formatDetailNumber', () => {
  it('keeps integers exact and trims float noise', () => {
    expect(formatDetailNumber(42)).toBe('42');
    expect(formatDetailNumber(0.30000000000000004)).toBe('0.3');
    expect(formatDetailNumber('nope')).toBe('nope');
  });
});
