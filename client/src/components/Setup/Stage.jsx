import { useState } from 'react';

import styles from './Stage.module.css';
console.log("STYLES", styles)

function Stage({ active, complete, title, children }) {
  return (
    <div className={`${styles.stage} ${active ? styles.active : ''} ${complete? styles.complete: ''}`}>
      <h3>{title}</h3>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
export default Stage;