import PropTypes from 'prop-types';
import styles from './Compare.module.css';

/**
 * Signature detail: viewport reticle ticks — four 12×12px corner L-marks
 * inset 8px in the map viewport. Neutral crosshair tone at rest, amber while
 * a selection is active. Purely decorative: pointer-events: none.
 */
function Reticle({ active = false }) {
  return (
    <div
      className={`${styles.reticle} ${active ? styles['reticle-active'] : ''}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

Reticle.propTypes = {
  active: PropTypes.bool,
};

export default Reticle;
