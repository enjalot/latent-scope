import PropTypes from 'prop-types';

// 8px status diode — the ONLY element in the system that glows or pulses.
// Mapping guidance: done=ready · running=busy (pulse) · pending=offline · failed=critical.
export function StatusDiode({ status = 'offline', pulse = false, label }) {
  const diode = (
    <span
      className={`ls-diode ls-diode--${status}${pulse ? ' ls-diode--pulse' : ''}`}
      aria-hidden={label ? 'true' : undefined}
      role={label ? undefined : 'status'}
      aria-label={label ? undefined : status}
    />
  );
  if (!label) return diode;
  return (
    <span className="ls-status">
      {diode}
      <span className="ls-status__label">{label}</span>
    </span>
  );
}

StatusDiode.propTypes = {
  status: PropTypes.oneOf(['ready', 'busy', 'offline', 'critical']),
  pulse: PropTypes.bool,
  label: PropTypes.string,
};

export default StatusDiode;
