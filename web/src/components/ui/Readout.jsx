import PropTypes from 'prop-types';

// Mono telemetry readout: uppercase 2xs label + tabular value.
// The enforcement vehicle for machine facts (counts, IDs, metrics, byte sizes).
export function Readout({ label, value }) {
  return (
    <span className="ls-readout">
      <span className="ls-readout__label">{label}</span>
      <span className="ls-readout__value">{value}</span>
    </span>
  );
}

Readout.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node,
};

export default Readout;
