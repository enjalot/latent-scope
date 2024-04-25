import { useState, useEffect } from 'react';

import styles from './Stage.module.css';

function Stage({ active, complete, title, subtitle, children, allowToggle = true }) {
  // State to manage whether the content is collapsed
  const [isCollapsed, setIsCollapsed] = useState(complete && allowToggle);

  useEffect(() => {
    setIsCollapsed(complete && allowToggle)
  }, [complete])

  // Toggle the collapsed state
  const toggleCollapse = () => {
    // If the stage is complete, allow toggling the collapsed state
    if (allowToggle && complete) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div className={`${styles.stage} ${active ? styles.active : ''} ${complete ? styles.complete : ''}`}>
      <h3 onClick={toggleCollapse}>{title} {subtitle && <span className={styles.subtitle}>({subtitle})</span>}</h3>
        <div className={styles.content} style={{display: isCollapsed ? 'none' : 'block'}}>
          {children}
        </div>
    </div>
  );
}

export default Stage;