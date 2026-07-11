import { useState, useEffect, useCallback } from 'react';
import { Button } from 'react-element-forge';

import styles from './Bulk.module.css';

const apiUrl = import.meta.env.VITE_API_URL;

function Tagging({ dataset, indices, onSuccess }) {
  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`${apiUrl}/tags?dataset=${dataset?.id}`)
      .then((response) => response.json())
      .then((data) => setTagset(data));
  }, [dataset]);

  const [tags, setTags] = useState([]);
  useEffect(() => {
    setTags(Object.keys(tagset));
  }, [dataset, tagset]);

  const [tag, setTag] = useState('');

  const handleAdd = useCallback(() => {
    fetch(`${apiUrl}/tags/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: dataset.id, indices, tag }),
    })
      .then((response) => response.json())
      .then((data) => onSuccess(data))
      .catch((error) => console.error('error', error));
  }, [dataset, tag, indices]);

  const handleRemove = useCallback(() => {
    fetch(`${apiUrl}/tags/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: dataset.id, indices, tag }),
    })
      .then((response) => response.json())
      .then((data) => onSuccess(data))
      .catch((error) => console.error('error', error));
  }, [dataset, tag, indices]);

  return (
    <div className={styles.bulkRow}>
      <div className={`tags ${styles.tags}`}>
        {tags.map((t) => (
          <button
            type="button"
            key={t}
            className={`ls-badge ${styles.tagButton} ${
              t === tag ? 'ls-badge--selected' : styles.tagButtonIdle
            }`}
            onClick={() => (t === tag ? setTag('') : setTag(t))}
          >
            {t}
          </button>
        ))}
      </div>
      {tag && (
        <div className={`action ${styles.actions}`}>
          <Button size="small" color="primary" text="Add" onClick={handleAdd} />
          <Button size="small" color="secondary" text="Remove" onClick={handleRemove} />
        </div>
      )}
    </div>
  );
}

export default Tagging;
