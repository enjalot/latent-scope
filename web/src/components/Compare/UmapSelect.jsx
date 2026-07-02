import styles from './Compare.module.css';

function formatUmapOption(um, embeddings) {
  const emb = embeddings?.find((d) => um.embedding_id === d.id);
  const model = emb?.model_id || um.embedding_id;
  const dims = emb?.dimensions ? `[${emb.dimensions}]` : '';
  const sae = um.sae_id ? ' (SAE)' : '';
  const aligned = um.align_id ? ' (aligned)' : '';
  return `${um.id} - ${model} ${dims}${sae}${aligned}`;
}

/**
 * A compact labeled UMAP picker, rendered right above the map it controls.
 */
function UmapSelect({ label, value, umaps = [], embeddings = [], onChange, accent }) {
  return (
    <div className={styles['umap-inline-select']}>
      {label && (
        <span className={styles['umap-inline-label']} style={accent ? { color: accent } : undefined}>
          {label}
        </span>
      )}
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {umaps.map((um) => (
          <option key={um.id} value={um.id}>
            {formatUmapOption(um, embeddings)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default UmapSelect;
