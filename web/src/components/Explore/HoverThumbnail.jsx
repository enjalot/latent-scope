import { useState } from 'react';

/**
 * Fixed-size thumbnail for the map hover tooltip. Manages its own loaded
 * state so it can show a loading placeholder instead of leaving the previous
 * point's image on screen while the new one fetches. Mount with a key tied to
 * the hovered index so it resets per point.
 */
function HoverThumbnail({ src, alt, size = 150 }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      style={{
        width: size,
        height: size,
        marginTop: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.12)',
        fontSize: 11,
        color: 'rgba(0,0,0,0.55)',
      }}
    >
      {!loaded && !errored && <span>loading…</span>}
      {errored && <span>no image</span>}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        style={{
          maxWidth: size,
          maxHeight: size,
          objectFit: 'contain',
          display: loaded ? 'block' : 'none',
        }}
      />
    </div>
  );
}

export default HoverThumbnail;
