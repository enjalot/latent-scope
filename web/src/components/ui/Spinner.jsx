import PropTypes from 'prop-types';

// The ONE spinner: 20px (or 14px inline via size="sm"), 2px ring, amber top arc.
// Optional label renders a mono uppercase status line under it (e.g. "LOADING SCOPE…").
export function Spinner({ size = 'md', label }) {
  const spinner = (
    <span
      className={`ls-spinner${size === 'sm' ? ' ls-spinner--sm' : ''}`}
      role="status"
      aria-label={label || 'Loading'}
    />
  );
  if (!label) return spinner;
  return (
    <span className="ls-loading">
      {spinner}
      <span className="ls-loading__status">{label}</span>
    </span>
  );
}

Spinner.propTypes = {
  size: PropTypes.oneOf(['md', 'sm']),
  label: PropTypes.string,
};

export default Spinner;
