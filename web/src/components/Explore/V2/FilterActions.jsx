import React from 'react';
import Container from './Search/Container';
import styles from './FilterActions.module.scss';

export default function FilterActions() {
  return (
    <div className={styles.container}>
      <div className={styles.actionsRow}>
        <Container />
      </div>
    </div>
  );
}
