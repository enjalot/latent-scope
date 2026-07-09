/**
 * Pure helpers for the point detail drawer (PointDetail.jsx): decide how a
 * dataset's columns are organized for display and how individual cell values
 * are rendered. Kept free of React so the logic is unit-testable.
 */

// Columns that are internal bookkeeping and shouldn't appear in the
// detail list (the row index is already shown in the drawer header).
const INTERNAL_COLUMNS = new Set(['ls_index', 'index', 'idx', 'sae_indices', 'sae_acts']);

/**
 * Organize a dataset's columns for the detail view.
 *
 * Returns:
 * - imageColumns: [{ column, kind }] where kind is "binary" (fetched from the
 *   backend image endpoint) or "url" (the row value is the image URL)
 * - textColumn: the dataset's main text column (shown prominently)
 * - listColumns: everything else, in dataset column order
 */
export function organizeDetailColumns(dataset) {
  if (!dataset) return { imageColumns: [], textColumn: null, listColumns: [] };
  const metadata = dataset.column_metadata || {};
  const columns = dataset.columns || [];
  const textColumn = dataset.text_column || null;

  const imageColumns = [];
  const listColumns = [];
  columns.forEach((column) => {
    if (INTERNAL_COLUMNS.has(column)) return;
    const meta = metadata[column];
    if (meta?.type === 'image') {
      imageColumns.push({ column, kind: 'binary' });
    } else if (meta?.image) {
      imageColumns.push({ column, kind: 'url' });
    } else if (column !== textColumn) {
      listColumns.push(column);
    }
  });
  return { imageColumns, textColumn, listColumns };
}

/** Format a number compactly: integers with locale separators, floats trimmed. */
export function formatDetailNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) return num.toLocaleString();
  // Trim float noise but keep small values legible.
  return String(parseFloat(num.toPrecision(6)));
}

/** Format a date-ish value; fall back to the raw string when unparseable. */
export function formatDetailDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

const URL_REGEX = /^https?:\/\//;

/**
 * Classify a cell value (given its column metadata) for rendering.
 *
 * Returns one of:
 * - { kind: "empty" }
 * - { kind: "url", value }
 * - { kind: "array", value }        (render as expandable JSON)
 * - { kind: "object", value }      (render as expandable JSON)
 * - { kind: "text", display }      (numbers/dates arrive pre-formatted)
 */
export function describeCellValue(value, meta) {
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  if (Array.isArray(value)) return { kind: 'array', value };
  if (meta?.url && typeof value === 'string') return { kind: 'url', value };
  if (meta?.type === 'date') return { kind: 'text', display: formatDetailDate(value) };
  if (meta?.type === 'number' || typeof value === 'number') {
    return { kind: 'text', display: formatDetailNumber(value) };
  }
  if (typeof value === 'object') return { kind: 'object', value };
  if (typeof value === 'string' && URL_REGEX.test(value)) return { kind: 'url', value };
  return { kind: 'text', display: String(value) };
}
