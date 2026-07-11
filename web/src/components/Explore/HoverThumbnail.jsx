import { useEffect, useState } from 'react';

import styles from './HoverThumbnail.module.scss';

/**
 * Fixed-size thumbnail for the map hover tooltip. Swaps `src` in place:
 * the incoming image is preloaded off-screen while the previous point's
 * image stays visible (slightly dimmed), so rapid hovering never flashes a
 * "loading…" placeholder. The placeholder only appears before the very
 * first image resolves; failed loads show "no image".
 */
function HoverThumbnail({ src, alt, size = 150 }) {
  // the image currently displayed (last one that finished loading)
  const [current, setCurrent] = useState(null);
  // status of the incoming src: 'loading' | 'loaded' | 'error'
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!src) {
      setCurrent(null);
      setStatus('error');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setCurrent({ src, alt });
        setStatus('loaded');
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setCurrent(null);
        setStatus('error');
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, alt]);

  return (
    // width/height stay inline: they come from the `size` prop
    <div className={styles.thumb} style={{ width: size, height: size }}>
      {status === 'error' && <span className={styles.status}>no image</span>}
      {status === 'loading' && !current && <span className={styles.status}>loading…</span>}
      {current && (
        <img
          className={`${styles.image} ${status === 'loading' ? styles.imageLoading : ''}`}
          src={current.src}
          alt={current.alt}
          style={{ maxWidth: size, maxHeight: size }}
        />
      )}
    </div>
  );
}

export default HoverThumbnail;
