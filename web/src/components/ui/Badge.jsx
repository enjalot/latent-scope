import PropTypes from 'prop-types';

// The ONE badge. Sans variant for human-readable labels; mono chip variant
// (mono, 2xs, uppercase) for machine facts: HDF5, LANCE, run IDs, RUN/OK/ERR/DEAD.
export function Badge({ variant, mono = false, selected = false, children, className }) {
  const classes = [
    mono ? 'ls-chip' : 'ls-badge',
    variant ? `ls-badge--${variant}` : '',
    selected ? 'ls-badge--selected' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}

Badge.propTypes = {
  variant: PropTypes.oneOf(['critical', 'info', 'success', 'warning', 'neutral']),
  mono: PropTypes.bool,
  selected: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
};

export default Badge;
