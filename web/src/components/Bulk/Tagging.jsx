import { useState, useEffect, useCallback } from 'react';
const apiUrl = import.meta.env.VITE_API_URL

function Tagging({ dataset, indices, onSuccess }) {
  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`${apiUrl}/tags?dataset=${dataset?.id}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [dataset])

  const [tags, setTags] = useState([])
  useEffect(() => {
    console.log("TAGSET", tagset, dataset)
    const tags = []
    for (const tag in tagset) {
      tags.push(tag)
    }
    // console.log("tagset", tagset, tags)
    setTags(tags)
  }, [dataset, tagset])

  const [tag, setTag] = useState('');

  const handleAdd = useCallback(() => {
    console.log("add", tag, indices)
    fetch(`${apiUrl}/tags/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({dataset: dataset.id, indices, tag}),
    })
    .then(response => response.json())
    .then(data => onSuccess(data))
    .catch(error => console.error('error', error))
    
  }, [dataset, tag, indices])

  const handleRemove = useCallback(() => {
    console.log("remove", tag, indices)
    fetch(`${apiUrl}/tags/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({dataset: dataset.id, indices, tag}),
    })
    .then(response => response.json())
    .then(data => onSuccess(data))
    .catch(error => console.error('error', error))

  }, [dataset, tag, indices])

  return <div style={{display: 'flex', flexDirection: 'row', gap: '6px'}}>
    <div className="tags" style={{display: 'flex', flexDirection: 'row', gap: '6px'}}>
      {tags.map(t => <div 
        key={t} 
        className="tag" 
        style={{
          cursor: 'pointer',
          padding: '2px 6px',
          border: t == tag ? '2px solid black' : '1px solid gray',
        }}
        onClick={() => t == tag ? setTag('') : setTag(t)}>
        {t}
      </div>
      )}
    </div>
    {tag && <div className="action">
      <button onClick={handleAdd}>Add</button>
      <button onClick={handleRemove}>Remove</button>
    </div>}
  </div>;
}

export default Tagging;

