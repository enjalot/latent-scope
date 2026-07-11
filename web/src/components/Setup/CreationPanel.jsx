import styles from './CreationPanel.module.scss';

/**
 * Collapsible wrapper for a Setup step's creation form.
 *
 * Purely presentational: the parent owns the open state (and forces it open
 * while a creation job is running so JobProgress stays visible). Collapsed,
 * the panel reduces to a single "+ {title}" trigger row so the list of
 * existing artifacts stays in view; expanded, the same row (now a chevron)
 * collapses the form again. The body collapses via the grid-template-rows
 * 0fr/1fr pattern so the form stays mounted (inputs keep their values).
 *
 * Props:
 *  - title: trigger label, e.g. "New embedding"
 *  - isOpen: whether the form body is expanded
 *  - onToggle(): flip the open state
 *  - children: the creation form content
 */

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function CreationPanel({ title, isOpen, onToggle, children }) {
  return (
    <section className={isOpen ? `${styles.panel} ${styles.open}` : styles.panel}>
      <button type="button" className={styles.trigger} onClick={onToggle} aria-expanded={!!isOpen}>
        <span className={styles.icon}>{isOpen ? <ChevronUpIcon /> : <PlusIcon />}</span>
        <span className={styles.title}>{title}</span>
      </button>
      <div className={styles.collapse} aria-hidden={!isOpen}>
        <div className={styles.inner}>
          <div className={styles.body}>{children}</div>
        </div>
      </div>
    </section>
  );
}

export default CreationPanel;
